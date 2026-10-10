/**
 * 两套新皮肤（vercel / apple）在真实浏览器里的检查。
 *
 * browser-check.mjs 原有的断言是照经典皮肤写的（LED 进度条、呼吸状态点、
 * 14 列开关、延迟药丸），那一整套继续对 classic 跑，覆盖一条不减。这里补的是
 * 新皮肤也必须满足的行为，以及新皮肤独有的东西：
 *
 *   - 风格真的生效了：<html data-style> 与配置一致，令牌覆盖解析出新皮肤的颜色
 *   - 卡片、分组筛选、表格视图、详情页、页脚对齐这些与皮肤无关的行为
 *   - 「需要注意」板块、档位徽章
 *   - 深浅切换后图表按新配色重建（曾经的缺陷：颜色在渲染期读、属性在副作用里
 *     写，详情页会一直留着上一套配色）
 *   - 375px 宽度下没有横向滚动
 *   - 控制台没有未捕获异常
 *
 * 断言函数由调用方注入，计数与汇总沿用 browser-check.mjs 的那一份。
 */

import { launch } from './cdp.mjs'
import { startMock, waitForApi } from './spawn-mock.mjs'

/** 和 browser-check.mjs 的 pinEnvironment 同理：钉死语言与视口。 */
async function pin(session, base) {
  await session.setViewport(1600, 900)
  await session.load(base, { waitFor: () => true })
  await session.evaluate(`(() => {
    localStorage.setItem('language', 'zh-CN')
    return true
  })()`)
}

/**
 * 跑一套新皮肤。
 *
 * @param {object} args
 * @param {string} args.browserPath
 * @param {'vercel' | 'apple'} args.skin
 * @param {number} args.port CDP 端口，每套皮肤各用一个，避免和上一个会话撞
 * @param {(label: string, ok: boolean, detail?: string) => void} args.check
 */
export async function checkSkin({ browserPath, skin, port, check }) {
  console.log(`\n新皮肤 [${skin}]`)
  const mock = await startMock([`--style=${skin}`])
  let session = null
  try {
    await waitForApi(mock.base)
    session = await launch(browserPath, port)
    await pin(session, mock.base)

    const fixtures = (await (await fetch(`${mock.base}/api/nodes`)).json()).data
    const expectedCards = fixtures.filter((node) => !node.hidden).length

    // ---------- 首页 ----------
    /*
     * 等到卡片和「需要注意」都到位。只等卡片不够：卡片在元数据到达时就渲染了，
     * 实时状态晚一个来回，那之前所有节点都被判成离线，「需要注意」会把全部
     * 节点列进去。
     */
    const home = await session.load(mock.base, {
      waitFor: (html) => html.includes('km-node-card') && html.includes('km-index-attention'),
    })
    // 再多等一轮轮询，确保实时状态已经覆盖了首屏的元数据态。
    await new Promise((resolve) => setTimeout(resolve, 2500))

    const state = await session.evaluate(`(() => {
      const root = document.documentElement
      const css = getComputedStyle(root)
      return {
        style: root.getAttribute('data-style'),
        cached: localStorage.getItem('km-minimal-style'),
        bg: css.getPropertyValue('--color-km-bg').trim().toLowerCase(),
        series1: css.getPropertyValue('--color-km-series1').trim(),
        cards: document.querySelectorAll('.km-node-card').length,
        badges: document.querySelectorAll('.km-node-card .km-s-badge').length,
        attentionRows: document.querySelectorAll('.km-index-attention li').length,
        blobsVisible: [...document.querySelectorAll('.km-blob')].some(
          (el) => getComputedStyle(el).display !== 'none',
        ),
      }
    })()`)

    check('<html data-style> 与配置一致', state.style === skin, `${state.style}`)
    check('风格写进了首屏缓存', state.cached === skin, `${state.cached}`)
    // 经典皮肤浅色底是 #f3f5f8。新皮肤的底色只要不是它，就说明覆盖压住了 :root。
    check('令牌覆盖压住了经典默认值', state.bg !== '' && state.bg !== '#f3f5f8', state.bg)
    check('多线图区分色有值', state.series1 !== '', '空串意味着延迟图第一条线画不出来')
    check('每个假节点都渲染了', state.cards === expectedCards, `${state.cards} 张，应为 ${expectedCards}`)
    check('每张卡片都有档位徽章或状态', state.badges > 0, `${state.badges} 个`)
    check(
      '「需要注意」列出了有问题的节点',
      state.attentionRows > 0 && state.attentionRows < expectedCards,
      `${state.attentionRows} 行，共 ${expectedCards} 台`,
    )
    check('经典皮肤的光晕已关掉', !state.blobsVisible)

    /*
     * 自托管字体真的加载到了。路径前缀错了的话浏览器只是静默回退到系统字体，
     * 页面照样能看 —— 只有问 document.fonts 才知道。
     */
    if (skin === 'vercel') {
      const font = await session.evaluate(`(async () => {
        await document.fonts.ready
        const face = [...document.fonts].find((f) => f.family.replace(/["']/g, '') === 'Inter')
        return { status: face?.status ?? 'missing', ok: document.fonts.check('16px Inter') }
      })()`)
      check('Inter 字体从主题自身加载成功', font.status === 'loaded' && font.ok, font.status)
    }
    check('保留版权行', home.includes('Powered by Komari Monitor.'))

    // ---------- 分组筛选 ----------
    const groups = await session.evaluate(`(() => {
      const row = document.querySelector('.km-index-groups')
      if (!row) return null
      return [...row.querySelectorAll('button')].map((b) => ({
        label: [...b.childNodes]
          .filter((n) => !(n.classList && n.classList.contains('km-num')))
          .map((n) => n.textContent ?? '')
          .join('')
          .trim(),
        count: Number(b.querySelector('.km-num')?.textContent ?? ''),
        pressed: b.getAttribute('aria-pressed'),
      }))
    })()`)
    check('渲染出分组芯片', Array.isArray(groups) && groups.length > 1)
    if (Array.isArray(groups) && groups.length > 1) {
      check(
        '第一个芯片是「全部」并显示总数',
        groups[0].label === '全部' && groups[0].count === expectedCards,
        groups.map((g) => `${g.label}=${g.count}`).join(' | '),
      )
      check('「全部」默认选中', groups[0].pressed === 'true')

      const target = groups[1]
      const filtered = await session.evaluate(`(async () => {
        const buttons = [...document.querySelectorAll('.km-index-groups button')]
        buttons[1].click()
        await new Promise((r) => setTimeout(r, 300))
        return {
          cards: document.querySelectorAll('.km-node-card').length,
          pressed: buttons[1].getAttribute('aria-pressed'),
          stored: localStorage.getItem('km-minimal-group'),
          // 选中态反白：文字和底色不能是同一个颜色（曾经白底白字）
          fg: getComputedStyle(buttons[1]).color,
          bg: getComputedStyle(buttons[1]).backgroundColor,
        }
      })()`)
      check('点击分组后筛选生效', filtered.cards === target.count, `${filtered.cards} 张，应为 ${target.count}`)
      check('点中的芯片切换为选中态', filtered.pressed === 'true')
      check('选中芯片的文字与底色可区分', filtered.fg !== filtered.bg, `${filtered.fg} on ${filtered.bg}`)
      check('筛选持久化到 localStorage', filtered.stored === target.label, `${filtered.stored}`)

      // 恢复「全部」，免得影响后面的断言
      await session.evaluate(`(async () => {
        document.querySelector('.km-index-groups button').click()
        await new Promise((r) => setTimeout(r, 300))
        return true
      })()`)
    }

    // ---------- 表格视图 ----------
    const table = await session.evaluate(`(async () => {
      const toTable = [...document.querySelectorAll('.km-navbar button')].find(
        (b) => b.textContent.trim() === '表格',
      )
      if (!toTable) return { error: '没有表格切换按钮' }
      toTable.click()
      await new Promise((r) => setTimeout(r, 400))
      const rows = document.querySelectorAll('.km-ui-table-row').length
      const wrap = document.querySelector('.km-index-table')
      const result = {
        rows,
        cards: document.querySelectorAll('.km-node-card').length,
        stored: localStorage.getItem('km-minimal-view'),
        overflow: wrap ? wrap.scrollWidth - wrap.clientWidth : -1,
      }
      const toGrid = [...document.querySelectorAll('.km-navbar button')].find(
        (b) => b.textContent.trim() === '卡片',
      )
      toGrid?.click()
      await new Promise((r) => setTimeout(r, 300))
      return result
    })()`)
    if (table.error) {
      check('表格视图可切换', false, table.error)
    } else {
      check('表格视图每个节点一行', table.rows === expectedCards, `${table.rows} 行`)
      check('表格视图下不再渲染卡片', table.cards === 0)
      check('视图选择持久化', table.stored === 'table')
      check('1600px 下表格不需要横向滚动', table.overflow <= 0, `多出 ${table.overflow}px`)
    }

    // ---------- 页脚对齐 ----------
    const footer = await session.evaluate(`(() => {
      const main = document.querySelector('.km-main')
      const row = document.querySelector('.km-footer > div')
      if (!main || !row) return null
      const m = main.getBoundingClientRect()
      const r = row.getBoundingClientRect()
      const pad = parseFloat(getComputedStyle(main).paddingLeft)
      return {
        mainLeft: Math.round(m.left + pad),
        mainRight: Math.round(m.right - pad),
        rowLeft: Math.round(r.left),
        rowRight: Math.round(r.right),
      }
    })()`)
    if (footer) {
      check('页脚左缘与正文对齐', footer.rowLeft === footer.mainLeft, `页脚 ${footer.rowLeft}px，正文 ${footer.mainLeft}px`)
      check('页脚右缘与正文对齐', footer.rowRight === footer.mainRight, `页脚 ${footer.rowRight}px，正文 ${footer.mainRight}px`)
    } else {
      check('页脚与正文都在', false)
    }

    // ---------- 详情页 ----------
    const firstHref = await session.evaluate(
      `document.querySelector('.km-node-card')?.getAttribute('href') ?? ''`,
    )
    check('卡片链接到详情页', firstHref.startsWith('/instance/'), firstHref)
    const detail = await session.load(`${mock.base}${firstHref}`, {
      waitFor: (html) => html.includes('km-instance-charts') && html.includes('<canvas'),
    })
    check('详情页渲染出当前值区块', detail.includes('km-instance-current'))
    check('详情页渲染出信息分组', detail.includes('km-instance-info'))
    check('详情页有一句话状态', detail.includes('km-instance-verdict'))
    check('uPlot 已挂载出 canvas', detail.includes('<canvas'))
    check('没有 NaN', !detail.includes('NaN'))
    check('没有 undefined', !detail.includes('undefined'))
    check('没有未替换的 i18n 占位符', !/\{\{\s*\w+\s*\}\}/.test(detail))

    /*
     * 深浅切换后图表按新配色重建。
     *
     * 取 CPU 图描边像素的颜色不现实，改为看 uPlot 实例是否被重建：重建会换掉
     * canvas 元素本身，旧的引用就脱离了文档。
     */
    const rebuilt = await session.evaluate(`(async () => {
      const before = document.querySelector('.km-instance-charts canvas')
      const wasDark = document.documentElement.classList.contains('dark')
      const toggle = document.querySelector('.km-navbar button[title="外观"]')
      if (!before || !toggle) return { error: '没有图表或外观按钮' }
      toggle.click()
      await new Promise((r) => setTimeout(r, 600))
      const after = document.querySelector('.km-instance-charts canvas')
      const isDark = document.documentElement.classList.contains('dark')
      toggle.click()
      await new Promise((r) => setTimeout(r, 300))
      return { flipped: wasDark !== isDark, rebuilt: before !== after && !before.isConnected }
    })()`)
    if (rebuilt.error) {
      check('深浅切换后图表重建', false, rebuilt.error)
    } else {
      check('外观按钮切换了深浅', rebuilt.flipped)
      check('深浅切换后图表按新配色重建', rebuilt.rebuilt)
    }

    // ---------- 窄屏 ----------
    await session.setViewport(375, 800)
    for (const [name, url] of [
      ['首页', mock.base],
      ['详情页', `${mock.base}${firstHref}`],
    ]) {
      await session.load(url, { waitFor: (html) => html.includes('km-main') })
      await new Promise((resolve) => setTimeout(resolve, 1500))
      const overflow = await session.evaluate(
        `document.documentElement.scrollWidth - document.documentElement.clientWidth`,
      )
      check(`375px 宽${name}没有横向滚动`, overflow <= 0, `多出 ${overflow}px`)
    }

    // ---------- 控制台 ----------
    const fatal = session.consoleEntries.filter(
      (entry) => entry.level === 'exception' || entry.level === 'error',
    )
    check('没有未捕获异常或错误', fatal.length === 0, fatal.map((e) => e.text).join(' | '))
  } finally {
    if (session) await session.close()
    mock.stop()
  }
}
