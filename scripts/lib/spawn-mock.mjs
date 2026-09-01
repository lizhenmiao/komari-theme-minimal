/**
 * 用系统分配的端口启动假服务端，就绪后 resolve。
 *
 * smoke 和 render 两个检查共用。用端口 0 而不是固定端口，这样上一次崩掉或
 * 残留的进程不会挡住下一次运行。
 */

import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * @param {string[]} flags extra CLI flags for the mock, e.g. ['--no-rpc2']
 * @returns {Promise<{port: number, base: string, stop: () => void}>}
 */
export function startMock(flags = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(ROOT, 'scripts', 'mock-server.mjs'), '0', ...flags], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill()
      reject(new Error(`mock server did not report a port\n${stdout}`))
    }, 20_000)

    child.stdout.setEncoding('utf8')
    // resolve 之后仍要继续消费：没人读的管道会把缓冲填满，然后子进程在
    // 下一次写入时被阻塞。
    child.stdout.on('data', (chunk) => {
      if (settled) return
      stdout += chunk
      const match = stdout.match(/MOCK_PORT=(\d+)/)
      if (!match) return
      settled = true
      clearTimeout(timer)
      child.stdout.resume()
      const port = Number(match[1])
      resolve({
        port,
        base: `http://127.0.0.1:${port}`,
        stop: () => child.kill(),
      })
    })

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => {
      process.stderr.write(chunk)
    })

    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    })

    child.on('exit', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(new Error(`mock server exited with ${code}\n${stdout}`))
    })
  })
}

/** 轮询到接口能应答为止，避免测试和监听器抢跑。 */
export async function waitForApi(base, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      const response = await fetch(`${base}/api/public`)
      if (response.ok) return
    } catch {
      // 还没开始接受连接。
    }
    if (Date.now() > deadline) throw new Error(`${base} never became ready`)
    await new Promise((resolve) => setTimeout(resolve, 120))
  }
}
