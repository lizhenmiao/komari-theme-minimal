/**
 * 渲染检查：在 Node 里挂载真实组件树、连假服务端，然后对产出的 HTML 断言。
 *
 * `npm run build` 通过只证明代码类型正确、能打包，完全说明不了应用能不能渲染
 * 出来。这一层抓的是「构建干净、页面空白」那一类问题。
 *
 *   node scripts/render-check.mjs
 *
 * 主题用到的浏览器全局对象只打桩到够跑完一次静态渲染为止。真正的交互行为不在
 * 这一层的范围内，由 browser-check.mjs 负责。
 */

import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { NodeWebSocket } from './lib/node-websocket.mjs'
import { ROOT, startMock, waitForApi } from './lib/spawn-mock.mjs'

const ENTRY = join(ROOT, '.render-entry.tsx')
const OUT_DIR = join(ROOT, '.render-out')

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

/**
 * 由 Vite 以 SSR 模式编译的入口，这样走的是真实的 TSX 管线，而不是自己手写的
 * 转换。
 */
const ENTRY_SOURCE = `
import { renderToString } from 'react-dom/server'
import { Route, Routes } from 'react-router-dom'
import { StaticRouter } from 'react-router-dom/server'
import Index from './src/pages/Index'
import NodeDetail from './src/pages/NodeDetail'
import Footer from './src/components/Footer'
import { startTransport, stopTransport } from './src/lib/transport'
import './src/i18n'

const step = (m) => process.stdout.write('[entry] ' + m + '\\n')

export async function render() {
  await startTransport()

  // 打出来是为了在渲染为空时能区分责任：是传输层没拿到数据，还是组件没渲染。
  const { getState } = await import('./src/lib/store')
  const s = getState()
  step('store: clients=' + s.clients.length +
    ' statuses=' + Object.keys(s.statuses).length +
    ' publicInfo=' + Boolean(s.publicInfo))

  /*
   * 快照引用稳定性。useSyncExternalStore 用 Object.is 比较，所以每次调用都
   * 新建对象的读取函数会导致无限循环（React #185）。SSR 只会调用每个读取函数
   * 一次，所以只有显式检查才能抓到。
   */
  const { __snapshotReaders } = await import('./src/hooks/useNodes')
  const uuid = s.clients[0]?.uuid ?? ''
  const pinned = []
  const stability = {
    buildViews: __snapshotReaders.buildViews(pinned) === __snapshotReaders.buildViews(pinned),
    buildNode: __snapshotReaders.buildNode(uuid) === __snapshotReaders.buildNode(uuid),
    computeTotals: __snapshotReaders.computeTotals() === __snapshotReaders.computeTotals(),
    buildGroups: __snapshotReaders.buildGroups() === __snapshotReaders.buildGroups(),
  }
  step('snapshots ' + JSON.stringify(stability))

  // 多让一个宏任务过去，保证首轮轮询的数据在快照之前到达。
  await new Promise((resolve) => setTimeout(resolve, 400))

  try {
    const home = renderToString(
      <StaticRouter location="/">
        <Index />
        <Footer html="<p>mock footer</p>" />
      </StaticRouter>,
    )

    // 必须经过 Route：useParams 从匹配到的路由里读参数，直接裸挂 NodeDetail
    // 会导致 uuid 为空，页面只渲染出加载态。
    const detail = renderToString(
      <StaticRouter location="/instance/a1">
        <Routes>
          <Route path="/instance/:uuid" element={<NodeDetail />} />
        </Routes>
      </StaticRouter>,
    )
    return { home, detail, snapshots: stability }
  } finally {
    // 清掉轮询和重连定时器，否则进程永远不会退出。
    stopTransport()
  }
}
`

/** 阶段日志：没有它的话，卡住时完全看不出停在哪一步。 */
function stage(message) {
  process.stdout.write(`[render-check] ${message}\n`)
}

/**
 * 额外的 mock 参数，让同一批断言也能对着降级后的服务端跑一遍。
 *   node scripts/render-check.mjs --no-rpc2
 *   node scripts/render-check.mjs --no-metrics
 */
const MOCK_FLAGS = process.argv.slice(2).filter((arg) => arg.startsWith('--'))

async function main() {
  if (MOCK_FLAGS.length > 0) stage(`mock flags: ${MOCK_FLAGS.join(' ')}`)

  stage('writing SSR entry')
  await writeFile(ENTRY, ENTRY_SOURCE, 'utf8')

  stage('starting mock server')
  const mock = await startMock(MOCK_FLAGS)

  try {
    stage(`mock on port ${mock.port}, waiting for api`)
    await waitForApi(mock.base)
    stage('installing browser stubs')
    installBrowserStubs(mock.port)

    // 用一次性的 SSR **构建**，不用 dev server：`createServer` 即使关掉 HMR
    // 也会开 socket，和已经在监听的东西冲突。
    //
    // `configFile: false` 是刻意的。项目配置里带着 Tailwind 插件和 dev proxy，
    // 两者都不该进 SSR 包，加载它会让这次构建卡死。这里只需要 React 转换，把
    // TSX 变成 Node 能执行的东西。
    stage('building SSR bundle')
    const { build } = await import('vite')
    const react = (await import('@vitejs/plugin-react')).default
    await build({
      root: ROOT,
      logLevel: 'error',
      configFile: false,
      plugins: [react()],
      resolve: { alias: { '@': join(ROOT, 'src') } },
      build: {
        ssr: ENTRY,
        outDir: OUT_DIR,
        emptyOutDir: true,
        rollupOptions: { output: { entryFileNames: 'entry.mjs' } },
      },
    })

    stage('ssr bundle built, importing')
    const mod = await import(pathToFileURL(join(OUT_DIR, 'entry.mjs')).href)
    stage('rendering')
    const { home, detail, snapshots } = await mod.render()
    stage('asserting')
    // 期望节点数从假服务端取，不写死 —— 加节点时不必回来改断言
    const fixtures = (await (await fetch(`${mock.base}/api/nodes`)).json()).data
    const expectedCards = fixtures.filter((node) => !node.hidden).length
    assertSnapshots(snapshots)
    assertHome(home, expectedCards)
    assertDetail(detail)
  } finally {
    mock.stop()
    await rm(ENTRY, { force: true })
    await rm(OUT_DIR, { force: true, recursive: true })
  }

  console.log(`\n${checks - failures}/${checks} checks passed`)
  if (failures > 0) {
    console.log(`${failures} FAILED`)
    process.exit(1)
  }
}
/**
 * 主题在渲染和 effect 里会读 localStorage、matchMedia、WebSocket 和 document。
 * Node 一个都没有，这里只补它实际用到的那一小部分。
 */
function installBrowserStubs(port) {
  const store = new Map()

  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size
    },
  }

  // uPlot 在模块加载时就读这个值来定 canvas 尺寸。
  globalThis.devicePixelRatio = 1

  globalThis.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })

  const noopTarget = {
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }

  globalThis.window = {
    ...noopTarget,
    location: {
      protocol: 'http:',
      host: `127.0.0.1:${port}`,
      hostname: '127.0.0.1',
      port: String(port),
      href: `http://127.0.0.1:${port}/`,
      pathname: '/',
      origin: `http://127.0.0.1:${port}`,
    },
    matchMedia: globalThis.matchMedia,
    localStorage: globalThis.localStorage,
  }

  globalThis.document = {
    ...noopTarget,
    hidden: false,
    title: '',
    documentElement: { classList: { add: () => {}, remove: () => {}, toggle: () => {} } },
    getElementById: () => null,
  }

  // Node 22 的 `navigator` 只有 getter，直接赋值会抛错。
  Object.defineProperty(globalThis, 'navigator', {
    value: { language: 'zh-CN', languages: ['zh-CN'] },
    configurable: true,
    writable: true,
  })

  // 用真实客户端而不是打桩：只有这样 WS `/api/clients` 降级路径才真的被跑到。
  globalThis.WebSocket = NodeWebSocket

  // Node 里同源相对 fetch 没有 base，这里补一个。
  const nativeFetch = globalThis.fetch
  globalThis.fetch = (input, init) => {
    if (typeof input === 'string' && input.startsWith('/')) {
      return nativeFetch(`http://127.0.0.1:${port}${input}`, init)
    }
    return nativeFetch(input, init)
  }
}

/**
 * 防 React #185。任何在数据没变时返回新引用的读取函数，都会让
 * useSyncExternalStore 无限重渲染。
 */
function assertSnapshots(snapshots) {
  console.log('\n快照引用稳定性')
  check('useNodes 的读取函数引用稳定', snapshots.buildViews)
  check('useNode 的读取函数引用稳定', snapshots.buildNode)
  check('useTotals 的读取函数引用稳定', snapshots.computeTotals)
  check('useGroups 的读取函数引用稳定', snapshots.buildGroups)
}

function assertHome(html, expectedCards) {
  console.log('\n首页')
  check('渲染出非空内容', html.length > 500, `${html.length} 字符`)
  check('有布局的钩子类名', html.includes('km-main'))
  check('有导航栏的钩子类名', html.includes('km-navbar'))
  check('有汇总条', html.includes('km-index-summary'))
  check('渲染出节点卡片', html.includes('km-node-card'), '没有 km-node-card')

  const cards = (html.match(/km-node-card/g) ?? []).length
  check('每个假节点都渲染了', cards === expectedCards, `${cards} 张，应为 ${expectedCards}`)

  // 到期文案的三种形态。长期这条最易漏：后台选长期写入的是很远的日期而非 null
  check('长期节点显示「长期」', html.includes('长期'), '缺少长期文案')
  check('长期节点不显示哨兵日期', !html.includes('2225'))
  check('长期节点不显示剩余天数', !/剩\s*7\d{4}\s*天/.test(html))

  check('保留版权行', html.includes('Powered by Komari Monitor.'))
  check('渲染出运营者的页脚 HTML', html.includes('mock footer'))
  check('渲染出进度条', html.includes('km-ui-usage-bar'))
  check('渲染出状态点', html.includes('km-ui-status-dot'))
  check('在线节点带呼吸动画类名', html.includes('km-dot-live'))

  // 必须是真实数据，不是占位符。
  check('接口里的节点名出现了', html.includes('Alpha'), '没有 Alpha')
  check('站点名来自 public info', html.includes('Komari Mock'))
  check('有百分比数值', /\d+%/.test(html))
  check('有字节格式数值', /\d+(\.\d+)?\s?(MB|GB|TB)/.test(html))
  check('有速率数值', /\/s/.test(html))

  // 哨兵值绝不能泄漏到 DOM 里。
  check('没有 NaN', !html.includes('NaN'))
  check('没有字面量 None 的 GPU', !html.includes('>None<'))
  check('没有裸的 -1 价格', !/>-1</.test(html))
  check('没有 undefined', !html.includes('undefined'))
  assertNoPlaceholders(html)

  /*
   * 主题不能自己实现 /admin 和 /terminal 这两个路由 —— 它们是 Komari 内置 UI。
   *
   * 但可以链接过去：后台入口在已登录时会渲染 `<a href="/admin">`，那是跳转而不是
   * 占位。所以这里查的是有没有 Route 声明，不是有没有链接。
   */
  check('没有声明 /admin 路由', !/path="\/admin/.test(html))
  check('没有声明 /terminal 路由', !/path="\/terminal/.test(html))
  check('没有 /terminal 链接', !html.includes('href="/terminal"'))
}

/**
 * i18n 占位符必须都被替换掉。
 *
 * 把带插值的值模板（`'{{count}} 核'`）当标签用时不会报错，也不会崩，
 * 只是把 `{{count}} 核` 原样渲染出来 —— 四层检查全都放过了这种情况，
 * 只能靠扫产出的 DOM 兜住。
 */
function assertNoPlaceholders(html) {
  const leaked = html.match(/\{\{\s*\w+\s*\}\}/g) ?? []
  check(
    '没有未替换的 i18n 占位符',
    leaked.length === 0,
    leaked.length > 0 ? [...new Set(leaked)].join(' ') : '',
  )
}

function assertDetail(html) {
  console.log('\n详情页')
  check('渲染出非空内容', html.length > 500, `${html.length} 字符`)
  check('有详情页的钩子类名', html.includes('km-page-instance'))
  check('渲染出当前值区块', html.includes('km-instance-current'))
  check('渲染出配置区块', html.includes('km-instance-info'))
  check('显示节点名', html.includes('Alpha'))
  check('显示元数据里的 CPU 型号', html.includes('EPYC'))
  check('有回首页的链接', html.includes('href="/"'))
  check('没有 NaN', !html.includes('NaN'))
  check('没有 undefined', !html.includes('undefined'))
  assertNoPlaceholders(html)
}

await main()
