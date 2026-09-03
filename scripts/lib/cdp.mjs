/**
 * 极简 Chrome DevTools Protocol 客户端。
 *
 * 为什么不用 `--virtual-time-budget` + `--dump-dom`：虚拟时间和真实网络 I/O
 * 不搭配。虚拟时钟推进得比真实时间快，预算可能在 mock 服务端的响应回来之前
 * 就用完，于是 dump 出来的是还没拿到数据的页面 —— 同一份代码连续跑四次
 * 得到 10/22、16/22、21/22、22/22 四个不同结果。
 *
 * 改成用 CDP 轮询 DOM，直到出现期望的内容或者超时。这样等待条件是"内容真的
 * 渲染出来了"，而不是"某个时间预算走完了"。
 */

import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { NodeWebSocket } from './node-websocket.mjs'

/** 常见安装位置。 */
const CANDIDATES = [
  `${process.env['ProgramFiles']}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env['ProgramFiles']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]

export async function findBrowser() {
  const { access } = await import('node:fs/promises')
  for (const path of CANDIDATES) {
    if (!path || path.includes('undefined')) continue
    const ok = await access(path).then(
      () => true,
      () => false,
    )
    if (ok) return path
  }
  return null
}

/** 从固定端口启动无头浏览器，返回一个可发 CDP 命令的会话。 */
export async function launch(browserPath, port) {
  const profile = await mkdtemp(join(tmpdir(), 'km-cdp-'))

  /*
   * 长驻进程必须用 spawn。execFile 会把子进程的输出全部缓冲在内存里，默认
   * maxBuffer 只有 1 MB，一超 Node 直接把子进程杀掉 —— Chrome 在 Linux 上
   * stderr 相当吵，跑几十秒足够撞上，而表现出来只是「端点没起来」。
   */
  const child = spawn(browserPath, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    /*
     * Chrome 默认在 /dev/shm 里分配共享内存。CI 环境给的 /dev/shm 往往很小，
     * 用满之后崩在启动阶段，端点永远不出现。改用临时文件绕开。
     */
    '--disable-dev-shm-usage',
    '--disable-software-rasterizer',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--hide-scrollbars',
    '--window-size=1600,900',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ])

  /*
   * 收着 Chrome 自己的输出，并把进程死因记下来。
   *
   * 这些信息是启动失败时唯一的线索：缺共享库、共享内存不足、端口被占，症状
   * 全都是「端点没起来」，只有 stderr 能区分。
   */
  let output = ''
  const collect = (chunk) => {
    // 只留尾部：真正的报错在最后，而 Chrome 的启动噪音可以很长
    output = (output + chunk).slice(-4000)
  }
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)

  let death = null
  child.on('error', (error) => {
    death = `无法启动浏览器：${error.message}`
  })
  child.on('exit', (code, signal) => {
    death = `浏览器进程提前退出（code=${code} signal=${signal}）`
  })

  const giveUp = async (reason) => {
    child.kill()
    await rm(profile, { recursive: true, force: true }).catch(() => {})
    return new Error(output ? `${reason}\n--- 浏览器输出 ---\n${output.trim()}` : reason)
  }

  // 等 DevTools 端点起来
  const deadline = Date.now() + 30_000
  let wsUrl = null
  for (;;) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (res.ok) {
        wsUrl = (await res.json()).webSocketDebuggerUrl
        if (wsUrl) break
      }
    } catch {
      // 还没监听
    }
    // 进程已经死了就不必等满 30 秒，那只会把真正的原因埋得更深
    if (death) throw await giveUp(death)
    if (Date.now() > deadline) {
      throw await giveUp(`DevTools 端点在 30 秒内没起来（端口 ${port}）`)
    }
    await new Promise((r) => setTimeout(r, 150))
  }

  const socket = new NodeWebSocket(wsUrl)
  await new Promise((resolve, reject) => {
    socket.onopen = resolve
    socket.onerror = () => reject(new Error('CDP socket 连接失败'))
  })

  let nextId = 1
  const pending = new Map()

  /*
   * 控制台输出与未捕获异常。
   *
   * 只看 DOM 判断不出「页面为什么少了一块」—— 组件抛异常时 React 会静默卸载
   * 那棵子树，DOM 里只是缺内容，原因只在控制台里。
   */
  const consoleEntries = []

  socket.onmessage = (event) => {
    let frame
    try {
      frame = JSON.parse(event.data)
    } catch {
      return
    }

    if (frame.method === 'Runtime.consoleAPICalled') {
      const text = (frame.params?.args ?? [])
        .map((a) => a.value ?? a.description ?? a.type)
        .join(' ')
      consoleEntries.push({ level: frame.params?.type ?? 'log', text })
      return
    }
    if (frame.method === 'Runtime.exceptionThrown') {
      const detail = frame.params?.exceptionDetails
      consoleEntries.push({
        level: 'exception',
        text: detail?.exception?.description ?? detail?.text ?? 'unknown exception',
      })
      return
    }

    if (typeof frame.id !== 'number') return
    const entry = pending.get(frame.id)
    if (!entry) return
    pending.delete(frame.id)
    if (frame.error) entry.reject(new Error(frame.error.message))
    else entry.resolve(frame.result)
  }

  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      const payload = { id, method, params }
      if (sessionId) payload.sessionId = sessionId
      socket.send(JSON.stringify(payload))
      setTimeout(() => {
        if (pending.delete(id)) reject(new Error(`${method} 超时`))
      }, 30_000)
    })

  // 建一个 target 并 attach，后续命令都带 sessionId
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })

  // 开了才会收到 consoleAPICalled / exceptionThrown 事件
  await send('Runtime.enable', {}, sessionId)

  return {
    /** 本次会话收到的控制台输出与未捕获异常。 */
    consoleEntries,

    /**
     * 精确设定视口。`--window-size` 在无头 + CDP 下不生效，实测拿到的是
     * 1584x805（被浏览器窗口边框吃掉了一圈），截图尺寸对不上。
     */
    async setViewport(width, height) {
      await send(
        'Emulation.setDeviceMetricsOverride',
        { width, height, deviceScaleFactor: 1, mobile: false },
        sessionId,
      )
    },

    /** 导航后轮询 DOM，直到 predicate 为真或超时。 */
    async load(url, { waitFor, timeoutMs = 25_000 } = {}) {
      await send('Page.enable', {}, sessionId)
      await send('Page.navigate', { url }, sessionId)

      const until = Date.now() + timeoutMs
      let html = ''
      for (;;) {
        const result = await send(
          'Runtime.evaluate',
          { expression: 'document.documentElement.outerHTML', returnByValue: true },
          sessionId,
        )
        html = result?.result?.value ?? ''
        if (!waitFor || waitFor(html)) return html
        if (Date.now() > until) return html
        await new Promise((r) => setTimeout(r, 200))
      }
    },

    /** 在页面里求值，用来读取 DOM 之外的运行时状态。 */
    async evaluate(expression) {
      const result = await send(
        'Runtime.evaluate',
        { expression, returnByValue: true, awaitPromise: true },
        sessionId,
      )
      return result?.result?.value
    },

    async screenshot() {
      const { data } = await send(
        'Page.captureScreenshot',
        { format: 'png', captureBeyondViewport: false },
        sessionId,
      )
      return Buffer.from(data, 'base64')
    },

    async close() {
      try {
        socket.close()
      } catch {
        // 已经断了
      }
      child.kill()
      await rm(profile, { recursive: true, force: true }).catch(() => {})
    },
  }
}
