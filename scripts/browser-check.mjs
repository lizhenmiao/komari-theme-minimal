/**
 * 用真实浏览器加载打包产物，等内容渲染出来再断言。
 *
 *   node scripts/browser-check.mjs
 *
 * render-check 是 SSR 出字符串，抓不到只在浏览器里才发生的问题：
 * base 路径解析、无限重渲染（React #185）、useEffect 里的崩溃、
 * uPlot 真实挂载、真实 WebSocket 行为。这个脚本补上那一层。
 */

import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { findBrowser, launch } from './lib/cdp.mjs'
import { ROOT, startMock, waitForApi } from './lib/spawn-mock.mjs'

const CDP_PORT = 9412

/*
 * 入口按钮的 title 取自 i18n。写死中文而不是 import locale 文件：
 * 这些断言要能抓到「文案被误删」，从同一个源读就永远不会失败。
 */
const LABEL = { admin: '管理后台', login: '登录' }

/*
 * 页脚出处入口要断言的仓库地址和主题名则相反，必须从 manifest 读：这两条抓的
 * 就是「页面上的值和 komari-theme.json 不一致」，写死等于两边各自测自己。
 */
const MANIFEST = JSON.parse(await readFile(join(ROOT, 'komari-theme.json'), 'utf8'))

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

/*
 * 断言里写死的中文文案要求页面就是中文渲染的，而无头浏览器的语言跟随宿主
 * 环境：中文机器上是 zh-CN，Linux CI（LANG=C.UTF-8）上 navigator 报 en，
 * detectLanguage() 就会返回 'en'，这批断言全部落空。
 *
 * detectLanguage() 最优先读 localStorage 的 `language` 键，所以在正式取样
 * 之前先把它钉死。视口一并钉死：页脚那几条几何断言依赖真实宽度，默认视口
 * 尺寸不在本脚本控制之下。
 */
async function pinEnvironment(session, base) {
  await session.setViewport(1600, 900)
  await session.load(base, { waitFor: () => true })
  await session.evaluate(`(() => {
    localStorage.setItem('language', 'zh-CN')
    return true
  })()`)
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
    await pinEnvironment(session, mock.base)

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
      // 这个数字绑定 NodeTable.tsx 的 ALL_COLUMNS，加列时两处一起改
      check('列开关列出全部 14 列', tableInfo.totalColumns === 14, `${tableInfo.totalColumns} 列`)
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

    /*
     * 后台入口。假服务端默认返回已登录，所以两个页面都该有这个链接。
     *
     * 必须是 <a> 而不是 <Link>：/admin 属于 Komari 内置 UI，走客户端路由会被
     * 本主题的 `path="*"` 拦下来兜回首页。
     */
    /*
     * 身份入口。假服务端默认返回已登录，所以两个页面都该是后台入口。
     * 未登录形态由 --guest 覆盖，见下面单独的一段。
     */
    console.log('\n身份入口')
    check('首页有身份入口', home.includes('km-auth-entry'))
    check('详情页也有身份入口', detail.includes('km-auth-entry'))
    check('已登录时指向后台', home.includes(`title="${LABEL.admin}"`), '缺少后台入口')
    check('已登录时不显示登录入口', !home.includes(`title="${LABEL.login}"`))
    check('入口用 <a> 而非客户端路由', home.includes('href="/admin"'))

    /*
     * 延迟药丸的适用性过滤。
     *
     * 运营者可以给每个探测任务指定适用节点（PingTask.clients）。不过滤的话，
     * 没配探测的节点会显示一排空药丸，把「这台没配」说成「还没测出来」。
     *
     * 期望值从固定数据推导：h8 不在任何任务的 clients 里，移动只配了三台。
     */
    console.log('\n延迟药丸按适用节点过滤')
    /*
     * 先把视图偏好改回卡片。上面的表格测试点过「表格」按钮，而视图选择会持久化
     * 到 km-minimal-view —— 不重置的话这里渲染出来的是表格，一张卡片都没有，
     * 下面三条断言会因为「什么都没渲染」而假通过。
     */
    await session.evaluate(`(() => {
      localStorage.setItem('km-minimal-view', 'grid')
      return true
    })()`)
    // km-ui-ping-badges 出现才说明延迟数据已到，见下面的轮询。
    await session.load(mock.base, {
      waitFor: (html) => html.includes('km-node-card') && html.includes('km-ui-ping-badges'),
    })

    const perCard = await session.evaluate(`(async () => {
      /*
       * 同时等卡片和药丸。只等药丸不够：这一步是从详情页导航回首页，
       * 导航尚未完成时卡片一张都没有，采样结果会是空对象，而空对象会让
       * 「没配探测的节点没有药丸」因为「什么都没渲染」而假通过。
       */
      const until = Date.now() + 12000
      for (;;) {
        const cards = document.querySelectorAll('.km-node-card').length
        const badges = document.querySelectorAll('.km-ui-ping-badges').length
        if (cards > 0 && badges > 0) break
        if (Date.now() > until) break
        await new Promise((r) => setTimeout(r, 200))
      }

      const out = {}
      for (const card of document.querySelectorAll('.km-node-card')) {
        const name = card.querySelector('h3')?.innerText?.trim() ?? '?'
        const group = card.querySelector('.km-ui-ping-badges')
        out[name] = group ? [...group.children].map((el) => el.getAttribute('title')) : []
      }
      return out
    })()`)

    // 先确认采样到的是完整的一批，否则下面三条都可能因为「还没渲染」而假通过
    check(
      '采样到了全部卡片',
      Object.keys(perCard).length === expectedCards,
      `${Object.keys(perCard).length} / ${expectedCards}`,
    )

    check(
      '未配置探测的节点不显示药丸',
      (perCard['Hotel 台北'] ?? []).length === 0,
      `Hotel 台北: ${JSON.stringify(perCard['Hotel 台北'])}`,
    )
    check(
      '配了全部三个任务的节点显示三个药丸',
      (perCard['Alpha 香港'] ?? []).length === 3,
      `Alpha 香港: ${JSON.stringify(perCard['Alpha 香港'])}`,
    )
    check(
      '只配了部分任务的节点按任务过滤',
      (perCard['Delta 法兰克福'] ?? []).length === 2,
      `Delta 法兰克福: ${JSON.stringify(perCard['Delta 法兰克福'])}`,
    )
    /*
     * 分组筛选。
     *
     * 固定数据的分布刻意贴近真实实例：FreeCloud 2、Oracle 3、华为云 1、DGN 1，
     * 另有一个节点不分组 —— 后者用来验证芯片计数只算有分组的那些。
     */
    console.log('\n分组筛选')
    const groupInfo = await session.evaluate(`(async () => {
      localStorage.removeItem('km-minimal-group')
      localStorage.setItem('km-minimal-view', 'grid')
      location.reload()
      return true
    })()`)
    void groupInfo

    await session.load(mock.base, {
      waitFor: (html) => html.includes('km-index-groups') && html.includes('km-node-card'),
    })

    const groups = await session.evaluate(`(() => {
      const row = document.querySelector('.km-index-groups')
      if (!row) return { error: '没有分组芯片行' }
      /*
       * 名称和计数分开取。innerText 会把两个 <span> 直接拼起来（「Oracle3」），
       * 靠字符串切分容易在组名以数字结尾时出错。
       */
      return {
        entries: [...row.querySelectorAll('button')].map((b) => {
          const nodes = [...b.childNodes]
          const num = b.querySelector('.km-num')
          return {
            label: nodes
              .filter((n) => n !== num)
              .map((n) => n.textContent ?? '')
              .join('')
              .trim(),
            count: Number(num?.textContent ?? ''),
          }
        }),
        cards: document.querySelectorAll('.km-node-card').length,
      }
    })()`)

    if (groups.error) {
      check('渲染出分组芯片', false, groups.error)
    } else {
      const shown = groups.entries.map((e) => `${e.label}=${e.count}`).join(' | ')
      check('渲染出分组芯片', groups.entries.length > 1, shown)
      check(
        '第一个芯片是「全部」并显示总数',
        groups.entries[0]?.label === '全部' && groups.entries[0]?.count === expectedCards,
        shown,
      )
      const counts = groups.entries.slice(1).map((e) => e.count)
      check(
        '芯片按节点数降序',
        counts.every((n, i) => i === 0 || counts[i - 1] >= n),
        shown,
      )
      check(
        '未分组的节点不产生芯片',
        groups.entries.slice(1).every((e) => e.label.length > 0),
        shown,
      )
      check('默认显示全部节点', groups.cards === expectedCards, `${groups.cards} 张`)
    }

    // 点某个组，卡片数量必须收窄到该组
    const filtered = await session.evaluate(`(async () => {
      const row = document.querySelector('.km-index-groups')
      const target = [...row.querySelectorAll('button')].find((b) => b.innerText.includes('Oracle'))
      if (!target) return { error: '找不到 Oracle 芯片' }
      target.click()
      await new Promise((r) => setTimeout(r, 400))
      return {
        cards: document.querySelectorAll('.km-node-card').length,
        stored: localStorage.getItem('km-minimal-group'),
      }
    })()`)

    if (filtered.error) {
      check('点击分组后筛选生效', false, filtered.error)
    } else {
      check('点击分组后筛选生效', filtered.cards === 3, `${filtered.cards} 张，应为 3`)
      check('选择持久化到 localStorage', filtered.stored === 'Oracle', String(filtered.stored))
    }

    // 刷新后筛选仍在，且表格视图共用同一个状态
    await session.load(mock.base, { waitFor: (html) => html.includes('km-node-card') })
    const persisted = await session.evaluate(`(async () => {
      const cards = document.querySelectorAll('.km-node-card').length
      const buttons = [...document.querySelectorAll('button')]
      const tableBtn = buttons.find((b) => b.innerText.trim() === '表格')
      tableBtn?.click()
      await new Promise((r) => setTimeout(r, 400))
      return { cards, rows: document.querySelectorAll('.km-ui-table-row').length }
    })()`)
    check('刷新后筛选保留', persisted.cards === 3, `${persisted.cards} 张`)
    check('表格视图共用同一筛选', persisted.rows === 3, `${persisted.rows} 行`)

    // 复位，免得影响后续断言
    await session.evaluate(`(() => {
      localStorage.removeItem('km-minimal-group')
      localStorage.setItem('km-minimal-view', 'grid')
      return true
    })()`)

    /*
     * 页脚的主题出处入口。
     *
     * 只断言「HTML 里有 github.com」是不够的：链接可能落在页脚之外、图标可能
     * 因为 svg 没有尺寸而不可见、路径数据可能被改坏。这里查的是渲染后的实际
     * 结果 —— 元素归属、外链属性、图标和路径的实测尺寸。
     *
     * 另外量了页脚整行的几何。<footer> 是 .km-layout（flex flex-col）的弹性
     * 子项，交叉轴上的 auto 外边距会吸走剩余空间并压掉 stretch，页脚会缩成
     * 内容宽度飘在中间、justify-between 失去可分配的空间。这种塌陷在 HTML
     * 字符串里看不出来，只能量。
     */
    console.log('\n页脚出处入口')
    const source = await session.evaluate(`(() => {
      const footer = document.querySelector('.km-footer')
      if (!footer) return { error: '页面上没有页脚' }
      const link = footer.querySelector('a.km-footer-source')
      if (!link) return { error: '页脚里没有出处链接' }
      const svg = link.querySelector('svg')
      const path = svg ? svg.querySelector('path') : null
      const box = svg ? svg.getBoundingClientRect() : null
      const mark = path ? path.getBBox() : null
      const rect = (el) => (el ? el.getBoundingClientRect() : null)
      const row = footer.firstElementChild
      const rowBox = rect(row)
      const creditBox = rect(row.querySelector('p'))
      const customBox = rect(row.querySelector('.km-footer-custom'))
      /*
       * 正文的内容边缘。页脚和 <main> 用的是同一套 max-width 与内边距，所以
       * 两者的左右缘必须重合 —— 直接比视口宽度是错的，超过 1560px 之后行宽
       * 被 max-width 限住，和视口再无关系。
       */
      const main = document.querySelector('.km-main')
      const mainBox = rect(main)
      const mainStyle = main ? getComputedStyle(main) : null
      return {
        href: link.getAttribute('href'),
        target: link.getAttribute('target'),
        rel: link.getAttribute('rel') || '',
        title: link.getAttribute('title') || '',
        text: link.innerText.trim(),
        iconWidth: box ? Math.round(box.width) : 0,
        markWidth: mark ? Math.round(mark.width) : 0,
        rowLeft: rowBox ? Math.round(rowBox.left) : 0,
        rowRight: rowBox ? Math.round(rowBox.right) : 0,
        mainLeft: mainBox ? Math.round(mainBox.left + parseFloat(mainStyle.paddingLeft)) : -1,
        mainRight: mainBox ? Math.round(mainBox.right - parseFloat(mainStyle.paddingRight)) : -1,
        hasCustom: Boolean(customBox),
        // 出处块右缘到自定义块左缘的空隙，两者真的分列两端时会很大
        split: customBox && creditBox ? Math.round(customBox.left - creditBox.right) : 0,
        customToRowRight: customBox && rowBox ? Math.round(rowBox.right - customBox.right) : -1,
      }
    })()`)

    if (source.error) {
      check('页脚有仓库入口', false, source.error)
    } else {
      check('页脚有仓库入口', true)
      check('地址与 manifest 的 url 一致', source.href === MANIFEST.url, String(source.href))
      check('在新标签页打开', source.target === '_blank', String(source.target))
      check('带 noopener', source.rel.includes('noopener'), source.rel || '(空)')
      check('链接文字含主题名', source.text.includes(MANIFEST.name), source.text || '(空)')
      /*
       * 词条缺失时 i18next 把键名原样吐出来，插值失败则留着 {{name}}。两种都
       * 会直接漏到页面上，而构建与渲染检查都不会报错。
       */
      check(
        '无障碍名称已翻译并完成插值',
        source.title !== '' && source.title !== 'footer.source' && !source.title.includes('{{'),
        source.title || '(空)',
      )
      /*
       * 图标尺寸卡上下界，不是只卡「大于 0」。内联 svg 没有显式尺寸时会回落到
       * CSS 默认的 300x150 —— 那种情况下「大于 0」照样通过，页脚却已经被一个
       * 巨大的图标撑坏。
       */
      check('图标尺寸在正文字号量级', source.iconWidth >= 10 && source.iconWidth <= 24, `${source.iconWidth}px`)
      check('图标路径不是空的', source.markWidth > 0, `${source.markWidth}px`)

      // 页脚没有塌成内容宽度：左右缘必须与正文重合
      check(
        '页脚左缘与正文对齐',
        source.rowLeft === source.mainLeft,
        `页脚 ${source.rowLeft}px，正文 ${source.mainLeft}px`,
      )
      check(
        '页脚右缘与正文对齐',
        source.rowRight === source.mainRight,
        `页脚 ${source.rowRight}px，正文 ${source.mainRight}px`,
      )
      check('假服务端提供了自定义页脚', source.hasCustom)
      if (source.hasCustom) {
        check('出处与自定义内容分列两端', source.split > 300, `空隙 ${source.split}px`)
        check(
          '自定义内容贴住右缘',
          source.customToRowRight >= 0 && source.customToRowRight <= 2,
          `距右缘 ${source.customToRowRight}px`,
        )
      }
    }
  } finally {
    if (session) await session.close()
    mock.stop()
  }

  /*
   * 未登录形态。
   *
   * 必须单独起一个 --guest 假服务端：只验证「已登录显示后台」的话，判定条件
   * 写反（或干脆不判断、无条件显示）同样能通过。
   */
  console.log('\n未登录形态（--guest）')
  const guestMock = await startMock(['--guest'])
  let guestSession = null
  try {
    await waitForApi(guestMock.base)
    guestSession = await launch(browserPath, CDP_PORT + 1)
    await pinEnvironment(guestSession, guestMock.base)
    const guestHome = await guestSession.load(guestMock.base, {
      waitFor: (html) => html.includes('km-auth-entry'),
    })
    check('未登录显示登录入口', guestHome.includes(`title="${LABEL.login}"`))
    check('未登录不显示后台入口', !guestHome.includes(`title="${LABEL.admin}"`))
    check('登录入口同样指向 /admin', guestHome.includes('href="/admin"'))
  } finally {
    if (guestSession) await guestSession.close()
    guestMock.stop()
  }

  console.log(`\n${checks - failures}/${checks} 项通过`)
  if (failures > 0) {
    console.log(`${failures} 项失败`)
    process.exit(1)
  }
}

await main()
