/**
 * 在真实 dev server 上跑真实浏览器，验证开发态本身没坏。
 *
 *   node scripts/dev-check.mjs
 *
 * 这一层补的是其他检查都盖不到的盲区：
 *
 *   - browser-check 打的是构建产物，base 是 /themes/{short}/dist/，
 *     且没有 StrictMode。开发态 base 是 `/`，两者的页面 URL 完全不同。
 *   - StrictMode 只在开发态生效，effect 会挂载两次（挂载 → 卸载 → 挂载），
 *     传输层的启动竞态只有这里能暴露。
 *   - render-check 是 SSR 出字符串，没有 document、没有 URL 解析、
 *     也没有客户端路由。
 *
 * 它盯的具体问题：开发态 base 若和构建一样用 /themes/{short}/dist/，地址栏
 * pathname 就带上这段前缀，React Router 匹配不到任何路由，被 `path="*"`
 * 兜回首页 —— 详情页在开发态永远打不开，而其余各层检查全绿。
 */

import { spawn } from 'node:child_process'
import { join } from 'node:path'

import { findBrowser, launch } from './lib/cdp.mjs'
import { ROOT, startMock, waitForApi } from './lib/spawn-mock.mjs'

const DEV_PORT = 5392
const CDP_PORT = 9415

let failures = 0
let checks = 0

function check(label, condition, detail = '') {
  checks += 1
  if (condition) {
    console.log(`  ok   ${label}`)
  } else {
    failures += 1
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

/** 起 dev server，把输出留着，失败时能看到原因。 */
function startDev(apiTarget) {
  const child = spawn(
    process.execPath,
    [
      join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'),
      '--port',
      String(DEV_PORT),
      '--strictPort',
      // 显式绑定 IPv4：默认只监听 localhost，Windows 上可能解析成 ::1，
      // 于是对 127.0.0.1 的探测一直失败。
      '--host',
      '127.0.0.1',
    ],
    {
      cwd: ROOT,
      env: { ...process.env, VITE_API_TARGET: apiTarget },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  let log = ''
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding('utf8')
    stream.on('data', (chunk) => {
      log += chunk
    })
  }
  return { getLog: () => log, stop: () => child.kill() }
}

/**
 * 等 dev server 起来。
 *
 * 只等根路径。开发态 base 若被配成 /themes/{short}/dist/，根路径会一直
 * 404，这时直接判定失败并说清原因 —— 干等到超时再报"没就绪"没有任何信息量。
 */
async function waitForDev(origin, dev, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      const res = await fetch(`${origin}/`)
      if (res.ok) return
      if (res.status === 404) {
        // 监听已经起来了，只是入口不在根路径上
        // Vite 的输出带 ANSI 颜色码，先剥掉再匹配，否则 \S+ 抓到的是转义序列
        const plain = dev.getLog().replace(/\[[0-9;]*m/g, '')
        const printed = plain.match(/Local:\s+(\S+)/)?.[1] ?? '(未打印)'
        throw new Error(
          `dev server 的入口不在根路径上（${origin}/ 返回 404，实际入口 ${printed}）。\n` +
            '开发态 base 必须是 `/`：Vite 把入口挂在 base 下，带前缀的 pathname\n' +
            '会让 React Router 匹配不到路由，被 path="*" 兜回首页。\n' +
            '见 vite.config.ts 里 base 的说明。',
        )
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('dev server 的入口')) throw error
      // 否则是还没开始监听，继续等
    }
    if (Date.now() > deadline) {
      throw new Error(`dev server 没就绪：${origin}/\n--- vite 输出 ---\n${dev.getLog()}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}

/** 页面里取一组状态，DOM 之外的信息（比如真实 URL）只能这样拿。 */
const PROBE = `(() => {
  const root = document.getElementById('root')
  const count = (selector) => document.querySelectorAll(selector).length
  return {
    pathname: location.pathname,
    rootEmpty: !root || root.innerHTML === '',
    html: document.documentElement.outerHTML,
    cards: count('.km-node-card'),
    current: count('.km-instance-current'),
    info: count('.km-instance-info'),
    canvas: count('canvas'),
  }
})()`

async function main() {
  const browserPath = await findBrowser()
  if (!browserPath) {
    console.log('  跳过：没找到 Chrome 或 Edge')
    return
  }
  console.log(`浏览器 ${browserPath}`)

  const mock = await startMock()
  const dev = startDev(mock.base)
  let session = null

  try {
    await waitForApi(mock.base)
    const origin = `http://127.0.0.1:${DEV_PORT}`
    await waitForDev(origin, dev)
    console.log(`dev server ${origin}（StrictMode 生效）`)

    session = await launch(browserPath, CDP_PORT)

    console.log('\n首页')
    /*
     * 等到卡片和实时状态都到位。只等卡片会踩竞态：卡片在元数据到达时就渲染，
     * 实时状态晚一个来回，那之前所有状态点都是离线态。
     */
    await session.load(`${origin}/`, {
      waitFor: (html) => html.includes('km-node-card') && html.includes('km-dot-live'),
      timeoutMs: 60_000,
    })
    const home = await session.evaluate(PROBE)
    // 期望张数从假服务端取，不写死 —— 往固定数据里加节点时不必回来改这里
    const fixtures = (await (await fetch(`${origin}/api/nodes`)).json()).data
    const expected = fixtures.filter((node) => !node.hidden).length
    check('停在站点根路径', home.pathname === '/', home.pathname)
    check('渲染出节点卡片', home.cards === expected, `${home.cards} 张，应为 ${expected}`)
    check('#root 没有被清空', !home.rootEmpty)

    console.log('\n详情页（直接访问 URL）')
    await session.load(`${origin}/instance/a1`, {
      waitFor: (html) => html.includes('<canvas'),
      timeoutMs: 60_000,
    })
    const detail = await session.evaluate(PROBE)
    /*
     * 这一条是这个脚本存在的理由：开发态 base 配错时，路由会把 URL 兜回
     * `/`，页面看起来"正常"（首页照常渲染），只有 pathname 能看出问题。
     */
    check('URL 停在详情页，没被兜回首页', detail.pathname === '/instance/a1', detail.pathname)
    check('渲染出当前值区块', detail.current > 0, '可能是 React #185')
    check('渲染出配置区块', detail.info > 0)
    check('uPlot 已挂载出 canvas', detail.canvas > 0, 'StrictMode 下重建失败')
    check('没有节点卡片（确实换了页面）', detail.cards === 0, `${detail.cards} 张`)
    check('没有未替换的 i18n 占位符', !/\{\{\s*\w+\s*\}\}/.test(detail.html))

    /*
     * StrictMode 的 effect 双次调用会把传输层的启动竞态放出来，
     * 症状是控制台里一个未捕获异常，DOM 上却只是少一块内容。
     */
    console.log('\n控制台')
    const fatal = session.consoleEntries.filter(
      (entry) => entry.level === 'exception' || entry.level === 'error',
    )
    check('没有未捕获异常或错误', fatal.length === 0, fatal.map((e) => e.text).join(' | '))
  } finally {
    if (session) await session.close()
    dev.stop()
    mock.stop()
  }

  console.log(`\n${checks - failures}/${checks} 项通过`)
  if (failures > 0) process.exit(1)
}

await main()
