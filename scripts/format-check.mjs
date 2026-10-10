/**
 * 纯函数层的边界断言。
 *
 *   node scripts/format-check.mjs
 *
 * DOM 层的检查看得见「页面上有没有出现某段文字」，但看不清边界：
 * 0001 年、null、非法字符串、刚好卡在阈值两侧的日期。这些分支只能直接
 * 调函数来测。
 *
 * 用 Vite 做一次性 SSR 构建把 TS 转成 Node 能跑的东西 —— 项目没有装测试
 * 框架，为这一个文件引一套依赖不值得。
 */

import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { ROOT } from './lib/spawn-mock.mjs'

const ENTRY = join(ROOT, '.tmp-format-entry.ts')
const OUT_DIR = join(ROOT, '.tmp-format-out')

let failures = 0
let checks = 0

function check(label, got, want) {
  checks += 1
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (ok) {
    console.log(`  ok   ${label}`)
  } else {
    failures += 1
    console.log(`  FAIL ${label} — 得到 ${JSON.stringify(got)}，期望 ${JSON.stringify(want)}`)
  }
}

async function loadFormat() {
  await writeFile(
    ENTRY,
    [
      "export { formatExpiry, daysUntil, isLongTerm, formatBytes, formatSpeed, ratio, trafficUsed } from './src/lib/format'",
      "export { taskAppliesTo, tasksFor } from './src/lib/ping'",
      "export { nodeIssues, majorIssues, nodeLevel, attentionList, EXPIRY_ATTENTION_DAYS } from './src/lib/attention'",
      "export { resolveSettings, DEFAULT_SETTINGS } from './src/hooks/useThemeSettings'",
      '',
    ].join('\n'),
    'utf8',
  )
  const { build } = await import('vite')
  await build({
    root: ROOT,
    logLevel: 'error',
    // 项目配置里带 Tailwind 插件和 dev proxy，两者都不该进这次构建。
    configFile: false,
    build: {
      ssr: ENTRY,
      outDir: OUT_DIR,
      emptyOutDir: true,
      rollupOptions: { output: { entryFileNames: 'entry.mjs' } },
    },
  })
  return import(pathToFileURL(join(OUT_DIR, 'entry.mjs')).href)
}

async function main() {
  const {
    formatExpiry,
    daysUntil,
    isLongTerm,
    formatSpeed,
    ratio,
    trafficUsed,
    taskAppliesTo,
    tasksFor,
    nodeIssues,
    majorIssues,
    nodeLevel,
    attentionList,
    EXPIRY_ATTENTION_DAYS,
    resolveSettings,
    DEFAULT_SETTINGS,
  } = await loadFormat()

  /*
   * 「长期」的阈值必须和服务端一致：utils/renewal/renewal.go:48-52 用的是
   * 「当前时间 + 100 年」这个相对判定。后台选长期时写入的是一个很远的日期
   * （实测 2225-12-11），不是 null。
   */
  console.log('\n长期判定')
  check('后台哨兵日期判为长期', isLongTerm('2225-12-11T00:00:00Z'), true)
  check('普通到期日不是长期', isLongTerm('2026-09-11T00:00:00Z'), false)
  check('null 不是长期', isLongTerm(null), false)
  check('非法字符串不是长期', isLongTerm('不是日期'), false)
  // 服务端把 0002 年之前当无效值（renewal.go:39）
  check('0001 年不是长期', isLongTerm('0001-01-01T00:00:00Z'), false)
  // 阈值两侧各取一个，确认判定发生在正确的位置
  const almost = new Date(Date.now() + 99 * 365.25 * 86_400_000).toISOString()
  const beyond = new Date(Date.now() + 101 * 365.25 * 86_400_000).toISOString()
  check('99 年后不算长期', isLongTerm(almost), false)
  check('101 年后算长期', isLongTerm(beyond), true)

  console.log('\n到期日文案')
  // 长期和 null 都返回 null，由调用方分别显示「长期」和「永久」
  check('长期不给具体日期', formatExpiry('2225-12-11T00:00:00Z'), null)
  check('null 不给具体日期', formatExpiry(null), null)
  check('0001 年不给具体日期', formatExpiry('0001-01-01T00:00:00Z'), null)
  check('非法字符串不给具体日期', formatExpiry('不是日期'), null)
  check('普通日期按 MM/DD/YYYY', formatExpiry('2026-09-11T00:00:00Z'), '09/11/2026')

  console.log('\n剩余天数')
  // 「剩 72785 天」对读者没有任何信息量
  check('长期不给剩余天数', daysUntil('2225-12-11T00:00:00Z'), null)
  check('null 不给剩余天数', daysUntil(null), null)
  const soon = daysUntil(new Date(Date.now() + 5 * 86_400_000).toISOString())
  check('五天后落在 4-6 之间', soon >= 4 && soon <= 6, true)
  const past = daysUntil(new Date(Date.now() - 3 * 86_400_000).toISOString())
  check('已过期为负数', past < 0, true)

  console.log('\n百分比')
  check('分母为 0 返回 null', ratio(5, 0), null)
  check('分母为负返回 null', ratio(5, -1), null)
  check('超过 100 会被夹住', ratio(200, 100), 100)
  check('负的已用量夹到 0', ratio(-5, 100), 0)

  console.log('\n瞬时网速')
  // net_in / net_out 是 byte/s，直接格式化。曾经误当 bit/s 除以 8，显示只有真实值 1/8。
  check('1 MiB/s 显示为 1.00M/s', formatSpeed(1024 * 1024), '1.00M/s')
  check('不再除以 8（8 MiB/s 不是 1M/s）', formatSpeed(8 * 1024 * 1024), '8.00M/s')
  check('0 速率显示 0/s', formatSpeed(0), '0/s')

  console.log('\n流量计费方式')
  const status = { net_total_up: 300, net_total_down: 700 }
  check('sum 上下行相加', trafficUsed(status, 'sum'), 1000)
  check('max 取较大者', trafficUsed(status, 'max'), 700)
  check('min 取较小者', trafficUsed(status, 'min'), 300)
  check('up 只算上行', trafficUsed(status, 'up'), 300)
  check('down 只算下行', trafficUsed(status, 'down'), 700)

  /*
   * 探测任务的适用性。这一层是 DOM 检查看不见的：那里只能验证「有几个药丸」，
   * 验证不了空列表和字段缺失这两个边界该怎么算。
   */
  console.log('\n探测任务适用性')
  const task = (clients) => ({ id: 1, name: 'x', interval: 60, type: 'icmp', clients })
  check('列表含该节点则适用', taskAppliesTo(task(['a1', 'b2']), 'a1'), true)
  check('列表不含该节点则不适用', taskAppliesTo(task(['a1', 'b2']), 'zz'), false)
  /*
   * 空列表和字段缺失都按「适用全部」处理，与服务端 AppliesToClient 相反。
   * 老版本服务端不下发这个字段，按「不适用」处理会把延迟展示整个关掉。
   */
  check('空列表按适用全部处理', taskAppliesTo(task([]), 'a1'), true)
  check('字段缺失按适用全部处理', taskAppliesTo(task(undefined), 'a1'), true)
  check(
    'tasksFor 只留适用的任务',
    tasksFor([task(['a1']), task(['b2']), task([])], 'a1').length,
    2,
  )

  /*
   * 「需要注意」判定。三处界面共用这一份结果（板块、卡片徽章、详情页状态），
   * 阈值两侧的行为只能在这一层直接测 —— DOM 检查只看得见「有没有这块」。
   */
  console.log('\n需要注意')
  const GB = 1024 ** 3
  const node = ({ cpu = 10, ram = 1, disk = 1, online = true, limit = 0, up = 0, down = 0, expires = null } = {}) => ({
    client: {
      uuid: 'n1',
      mem_total: 100 * GB,
      disk_total: 100 * GB,
      traffic_limit: limit,
      traffic_limit_type: 'sum',
      expired_at: expires,
    },
    status: {
      online,
      cpu,
      ram: ram * GB,
      ram_total: 100 * GB,
      disk: disk * GB,
      disk_total: 100 * GB,
      net_total_up: up,
      net_total_down: down,
    },
  })
  const kinds = (n) => nodeIssues(n).map((i) => `${i.kind}:${i.level}${i.minor ? ':minor' : ''}`)
  /*
   * 造一个 daysUntil() 恰好返回 d 的时刻。daysUntil 向上取整，所以要比 d 天
   * 少一点而不是多一点 —— 7 天零 1 小时在界面上显示的是「剩 8 天」。
   */
  const inDays = (d) => new Date(Date.now() + d * 86_400_000 - 3_600_000).toISOString()

  check('一切正常没有问题', kinds(node()), [])
  check('一切正常档位为 ok', nodeLevel(node()), 'ok')
  check('CPU 刚好 90 点名为 bad', kinds(node({ cpu: 90 })), ['cpu:bad'])
  check('CPU 89.6 四舍五入后仍不点名', majorIssues(node({ cpu: 89.6 })).length, 0)
  check('CPU 刚好 75 记为次要', kinds(node({ cpu: 75 })), ['cpu:warn:minor'])
  check('CPU 74.9 什么都不是', kinds(node({ cpu: 74.9 })), [])
  check('次要问题不影响档位', nodeLevel(node({ cpu: 80 })), 'ok')
  check('内存按实时总量算', kinds(node({ ram: 91 })), ['mem:bad'])
  check('磁盘过高点名', kinds(node({ disk: 95 })), ['disk:bad'])

  // 配额不能用 ratio()：它会夹到 100，而超额多少正是要说的事
  const over = nodeIssues(node({ limit: 100 * GB, up: 200 * GB, down: 157 * GB }))
  check('配额超额不被夹到 100', over[0]?.values.percent, 357)
  check('配额刚好 90 点名', kinds(node({ limit: 100 * GB, up: 90 * GB })), ['quota:bad'])
  check('配额 89 不点名', kinds(node({ limit: 100 * GB, up: 89 * GB })), [])
  check('不限额不判配额', kinds(node({ limit: 0, up: 999 * GB })), [])
  check('配额排在占用之前', kinds(node({ limit: 100 * GB, up: 95 * GB, cpu: 95 })), ['quota:bad', 'cpu:bad'])

  check(`刚好 ${EXPIRY_ATTENTION_DAYS} 天后到期点名为 warn`, kinds(node({ expires: inDays(EXPIRY_ATTENTION_DAYS) })), ['expiring:warn'])
  check(`${EXPIRY_ATTENTION_DAYS + 1} 天后到期不点名`, kinds(node({ expires: inDays(EXPIRY_ATTENTION_DAYS + 1) })), [])
  check('已过期点名为 bad', kinds(node({ expires: inDays(-3) })), ['expired:bad'])
  check('长期（+100 年）不点名', kinds(node({ expires: '2225-12-11T00:00:00Z' })), [])
  check('永久（null）不点名', kinds(node({ expires: null })), [])

  // 离线时只说离线：最后一次采样的 CPU 是过去的事实
  check('离线只报离线', kinds(node({ online: false, cpu: 99, expires: inDays(-3) })), ['offline:bad'])
  check('离线档位为 offline', nodeLevel(node({ online: false })), 'offline')
  check('没有状态等同离线', kinds({ client: node().client, status: null }), ['offline:bad'])

  const list = attentionList([
    node({ expires: inDays(2) }),
    { ...node({ cpu: 99 }), client: { ...node().client, uuid: 'n2' } },
    { ...node(), client: { ...node().client, uuid: 'n3' } },
  ])
  check('需要注意里 bad 排在 warn 前', list.map((e) => e.level), ['bad', 'warn'])
  check('正常节点不进需要注意', list.length, 2)

  /*
   * 新设置项的读取。这三个值由管理员在后台设，经未鉴权接口下发；坏值必须
   * 回退到默认，而不是让整套界面落进一个不存在的皮肤。
   */
  console.log('\n界面风格设置')
  check('缺省风格是 apple', DEFAULT_SETTINGS.style, 'apple')
  check('缺省明暗是跟随系统', DEFAULT_SETTINGS.defaultAppearance, 'system')
  check('缺省显示需要注意', DEFAULT_SETTINGS.showAttention, true)
  check('读得出 vercel', resolveSettings({ style: 'vercel' }).style, 'vercel')
  check('读得出 classic', resolveSettings({ style: 'classic' }).style, 'classic')
  check('大小写与空白容错', resolveSettings({ style: '  Vercel ' }).style, 'vercel')
  check('未知风格回退 apple', resolveSettings({ style: 'grafana' }).style, 'apple')
  check('非字符串风格回退 apple', resolveSettings({ style: 3 }).style, 'apple')
  check('读得出 dark', resolveSettings({ defaultAppearance: 'dark' }).defaultAppearance, 'dark')
  check('未知明暗回退 system', resolveSettings({ defaultAppearance: 'sepia' }).defaultAppearance, 'system')
  check('开关可能被存成字符串', resolveSettings({ showAttention: 'false' }).showAttention, false)
  check('低版本服务端没有设置时全用默认', resolveSettings(undefined).style, 'apple')

  console.log(`\n${checks - failures}/${checks} 项通过`)
}

try {
  await main()
} finally {
  await rm(ENTRY, { force: true })
  await rm(OUT_DIR, { recursive: true, force: true })
}

if (failures > 0) process.exit(1)
