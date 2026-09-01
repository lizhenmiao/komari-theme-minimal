/**
 * 用真实浏览器加载打包产物，等内容渲染出来再断言。
 *
 *   node scripts/browser-check.mjs
 *
 * render-check 是 SSR 出字符串，抓不到只在浏览器里才发生的问题：
 * base 路径解析、无限重渲染（React #185）、useEffect 里的崩溃、
 * uPlot 真实挂载、真实 WebSocket 行为。这个脚本补上那一层。
 */

import { access } from 'node:fs/promises'
import { join } from 'node:path'

import { findBrowser, launch } from './lib/cdp.mjs'
import { ROOT, startMock, waitForApi } from './lib/spawn-mock.mjs'

const CDP_PORT = 9412

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

async function main() {
  const built = await access(join(ROOT, 'dist', 'index.html')).then(
    () => true,
    () => false,
  )
  if (!built) throw new Error('dist/ 不存在，先跑 npm run build')

  const browserPath = await findBrowser()
  if (!browserPath) {
    console.log('  跳过：没找到 Chrome 或 Edge')
    return
  }
  console.log(`浏览器 ${browserPath}`)

  const mock = await startMock()
  let session = null
  try {
    await waitForApi(mock.base)
    session = await launch(browserPath, CDP_PORT)

    console.log('\n首页')
    /*
     * 等到卡片和实时状态都到位，而不是等一个固定时长。
     *
     * 只等 `km-node-card` 不够：卡片在节点元数据到达时就渲染了，实时状态是
     * 另一次请求，晚一个来回。此时所有状态点都是离线态，`km-dot-live`
     * 还不存在 —— 那条断言会随机失败。等到有在线点出现才算真的就绪。
     */
    const home = await session.load(mock.base, {
      waitFor: (html) => html.includes('km-node-card') && html.includes('km-dot-live'),
    })

    /*
     * 期望张数从假服务端自己的接口取，不写死数字 —— 往固定数据里加节点时，
     * 写死的断言会一起要改，漏掉一处就是一次假失败。
     */
    const fixtures = (await (await fetch(`${mock.base}/api/nodes`)).json()).data
    const expectedCards = fixtures.filter((node) => !node.hidden).length

    const cards = (home.match(/km-node-card/g) ?? []).length
    check('渲染出节点卡片', cards > 0, `${cards} 张`)
    check('每个假节点都渲染了', cards === expectedCards, `${cards} 张，应为 ${expectedCards}`)
    check('站点名来自接口', home.includes('Komari Mock'))
    check('保留版权行', home.includes('Powered by Komari Monitor.'))
    check('在线状态点有呼吸动画', home.includes('km-dot-live'))
    check('进度条已渲染', home.includes('km-bar'))
    check('有百分比数值', /\d+%/.test(home))
    check('有字节格式数值', /\d+(\.\d+)?\s?(MB|GB|TB)/.test(home))
    check('没有 NaN', !home.includes('NaN'))
    check('没有 undefined', !home.includes('undefined'))
    // React 崩溃后 #root 会被清空
    check('#root 没有被清空', !/<div id="root"><\/div>/.test(home))
    check('没有 React 报错文案', !home.includes('Minified React error'))

    /*
     * 国旗与排序。
     *
     * 这两条只能在真实浏览器里验：DOM 里有 <img> 不代表图真的加载出来了，
     * 得看 naturalWidth；排序则要看渲染后的实际先后。
     */
    console.log('\n国旗与排序')
    /*
     * 轮询到图片解码完成，不要采样一次就断言。
     *
     * <img> 出现在 DOM 里和它解码完成是两件事，中间隔着一次网络请求。直接
     * 采样会随机读到 complete=false —— 实测就这样偶发失败过一次。不稳定的
     * 断言比没有断言更糟：它会训练人忽略失败。
     */
    const visual = await session.evaluate(`(async () => {
      const read = () => [...document.querySelectorAll('img.km-ui-flag')]
      const until = Date.now() + 10000
      for (;;) {
        const imgs = read()
        const pending = imgs.filter((img) => !img.complete)
        if (imgs.length > 0 && pending.length === 0) break
        if (Date.now() > until) break
        await new Promise((r) => setTimeout(r, 150))
      }

      const cards = [...document.querySelectorAll('.km-node-card')]
      const imgs = read()
      return {
        // 名字取 h3。整块 innerText 的第一行可能是国旗的文本回退。
        names: cards.map((card) => card.querySelector('h3')?.innerText?.trim() ?? '?'),
        alts: imgs.map((img) => img.getAttribute('alt')),
        srcs: imgs.map((img) => img.getAttribute('src')),
        // naturalWidth 为 0 才是真的没加载出来；complete 只说明请求结束了
        broken: imgs.filter((img) => !img.complete || img.naturalWidth === 0).length,
        textFallback: [...document.querySelectorAll('span.km-ui-flag')].map((s) => s.innerText.trim()),
      }
    })()`)

    /*
     * 先断言数量。加载失败时 onError 会把 <img> 换成文本回退，DOM 里就不剩
     * 碎图了 —— 只查 broken===0 的话，「全部退回文本」会静默通过。
     * 期望个数同样从固定数据推导：region 能映射成两位国家代码的才有国旗。
     */
    const expectedFlags = fixtures.filter(
      (node) => !node.hidden && /^([A-Za-z]{2}|[\u{1F1E6}-\u{1F1FF}]{2})$/u.test(node.region ?? ''),
    ).length
    check(
      '渲染出国旗 img',
      visual.alts.length === expectedFlags,
      `${visual.alts.length} 个，应为 ${expectedFlags}`,
    )
    // 图片真的解码成功了，不是碎图
    check('国旗图片全部加载成功', visual.broken === 0, `${visual.broken} 张失败`)
    check('emoji 形式的 region 映射到了国旗', visual.alts.includes('HK'), visual.alts.join(','))
    check('两位代码形式的 region 也映射到了', visual.alts.includes('JP'), visual.alts.join(','))
    check(
      '国旗走自托管路径而非第三方 CDN',
      visual.srcs.every((src) => src?.startsWith('/themes/') && src.includes('/flags/')),
      visual.srcs[0] ?? '(无)',
    )
    check('映射不出国家的 region 退回文本', visual.textFallback.includes('内网'), visual.textFallback.join(','))

    /*
     * weight 升序。假数据的 weight 取值刻意打乱，所以这个期望顺序既不是
     * 数组顺序也不是它的反序 —— 比较器方向写反会得到完全相反的结果。
     */
    const expectedOrder = [
      'Bravo 东京', // 0
      'Delta 法兰克福', // 1
      'Golf 圣何塞', // 2
      'Alpha 香港', // 3
      'Foxtrot 首尔', // 4
      'Charlie 洛杉矶', // 5
      'Echo 新加坡', // 6
      'Hotel 台北', // 7
    ]
    check(
      '按 weight 升序排列',
      JSON.stringify(visual.names) === JSON.stringify(expectedOrder),
      visual.names.join(' | '),
    )

    /*
     * 到期文案的三种形态。
     *
     * 「长期」这条尤其容易漏：后台选长期时写入的是一个很远的日期而不是 null，
     * 所以只要不做判定，页面就会把它显示成 12/11/2225 和「剩 72785 天」，
     * 而且没有任何报错。
     */
    console.log('\n到期文案')
    check('长期节点显示「长期」', home.includes('长期'), '缺少长期文案')
    check('长期节点不显示哨兵日期', !home.includes('2225') && !home.includes('12/11/2225'))
    check('长期节点不显示剩余天数', !/剩\s*7\d{4}\s*天/.test(home))
    check('expired_at 为 null 的节点显示「永久」', home.includes('永久'))
    check('正常日期仍按 MM/DD/YYYY 显示', /\d{2}\/\d{2}\/20\d{2}/.test(home))
    check('已过期节点仍显示过期药丸', /已过期\s*\d+\s*天/.test(home))

    /*
     * 表格视图默认列。
     *
     * 必须先清掉 localStorage 再切视图：一旦存过偏好，读到的就是那份偏好而
     * 不是默认值，断言会测不到默认值本身。
     */
    console.log('\n表格默认列')
    const table = await session.evaluate(`(async () => {
      localStorage.removeItem('km-minimal-columns')
      location.reload()
      return true
    })()`)
    void table

    await session.load(mock.base, { waitFor: (html) => html.includes('km-node-card') })
    const tableInfo = await session.evaluate(`(async () => {
      // 切到表格视图
      const buttons = [...document.querySelectorAll('button')]
      const tableBtn = buttons.find((b) => b.innerText.trim() === '表格')
      if (!tableBtn) return { error: '找不到表格按钮' }
      tableBtn.click()
      await new Promise((r) => setTimeout(r, 400))

      const headers = [...document.querySelectorAll('.km-index-table thead th')]
        .map((th) => th.innerText.trim())
        .filter(Boolean)

      // 打开列开关面板，数一下总共有多少列可选
      const toggleBtn = document.querySelector('.km-index-table .km-iconbtn')
      toggleBtn?.click()
      await new Promise((r) => setTimeout(r, 250))
      const boxes = [...document.querySelectorAll('.km-index-table input[type=checkbox]')]
      return {
        headerCount: headers.length,
        headers,
        totalColumns: boxes.length,
        checked: boxes.filter((b) => b.checked).length,
      }
    })()`)

    if (tableInfo.error) {
      check('切换到表格视图', false, tableInfo.error)
    } else {
      check('列开关列出全部 13 列', tableInfo.totalColumns === 13, `${tableInfo.totalColumns} 列`)
      check(
        '默认全部勾选',
        tableInfo.checked === tableInfo.totalColumns,
        `勾选 ${tableInfo.checked} / ${tableInfo.totalColumns}`,
      )
      check(
        '表头渲染出全部列',
        tableInfo.headerCount === tableInfo.totalColumns,
        `${tableInfo.headerCount} 个表头`,
      )
    }

    console.log('\n详情页（直接访问 URL，不从首页点进去）')
    /*
     * 必须直接访问，这是 base 路径配错时唯一会暴露的路径：从首页点进去走的是
     * 客户端路由，不触发 document 加载，相对路径的资源引用不会被重新解析。
     */
    const detail = await session.load(`${mock.base}/instance/a1`, {
      waitFor: (html) => html.includes('km-instance-info'),
    })

    check('渲染出当前值区块', detail.includes('km-instance-current'), '可能是 React #185')
    check('渲染出配置区块', detail.includes('km-instance-info'))
    // 值模板被当标签用时会把 {{count}} 原样渲染出来，不报错也不崩
    const leaked = [...new Set(detail.match(/\{\{\s*\w+\s*\}\}/g) ?? [])]
    check('没有未替换的 i18n 占位符', leaked.length === 0, leaked.join(' '))
    check('渲染出图表容器', detail.includes('km-load-chart'))
    // uPlot 只在客户端挂载后建 canvas，SSR 抓不到这一点
    check('uPlot 已实例化出 canvas', detail.includes('<canvas'), 'uPlot 没挂上')
    check('显示节点名', detail.includes('Alpha'))
    check('显示 CPU 型号', detail.includes('EPYC'))
    check('#root 没有被清空', !/<div id="root"><\/div>/.test(detail))
    check('没有 React 报错文案', !detail.includes('Minified React error'))
    check('没有 NaN', !detail.includes('NaN'))
    check('没有 undefined', !detail.includes('undefined'))
  } finally {
    if (session) await session.close()
    mock.stop()
  }

  console.log(`\n${checks - failures}/${checks} 项通过`)
  if (failures > 0) {
    console.log(`${failures} 项失败`)
    process.exit(1)
  }
}

await main()
