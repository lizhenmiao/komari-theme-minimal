/**
 * 一个节点的派生读数，三处共用：新皮肤的卡片、表格行、详情页。
 *
 * 字段映射只写在这一处。原来首页卡片和详情页各算一遍 `status.ram_total ||
 * client.mem_total` 这类回退，新增两套皮肤之后就是六遍 —— 必然有一处漂移，
 * 表现出来是「同一台机器在卡片上 56%、点进去 54%」。
 *
 * 换算一律调 lib/format.ts 的函数，这里不自己写除法与单位，`formatSpeed` 的
 * bit/s → byte/s 尤其不能漏。
 */

import { daysUntil, formatExpiry, isLongTerm, parseTags, ratio, trafficUsed } from '../../lib/format'
import { nodeIssues, nodeLevel } from '../../lib/attention'
import type { Issue, NodeLevel } from '../../lib/attention'
import type { NodeView } from '../../lib/types'

export interface NodeFacts {
  online: boolean
  /** 单位秒。节点离线或服务端没给就是 undefined，交给 formatUptime 吸收。 */
  uptime: number | undefined
  /**
   * 最后一次上报的 unix 秒。服务端填的是 `rep.UpdatedAt`，节点掉线后就停住，
   * 所以离线时它就是「最后一次还活着的时刻」。解析不出来时为 null。
   */
  lastSeen: number | null
  /**
   * 离线了多久，单位秒。在线、或拿不到最后上报时刻时为 null。
   *
   * 浏览器与服务端的时钟可能有偏差，算出来是负数时按 0 处理；差距小于一分钟
   * 也当作 null —— 那个量级分不清是真的刚掉线还是时钟偏差，不如不说。
   */
  offlineFor: number | null

  cores: number
  /** CPU 占用百分比，没有采样时为 null。 */
  cpu: number | null
  /** 按占用折算的核数，用来显示「3.6C / 8C」。 */
  coresUsed: number | null

  mem: number | null
  memUsed: number
  memTotal: number

  disk: number | null
  diskUsed: number
  diskTotal: number

  /** Swap 占用。节点没开 Swap 时为 null，和「没有采样」一样显示 —— 文案不同。 */
  swap: number | null
  swapUsed: number
  swapTotal: number
  swapEnabled: boolean

  /**
   * 流量配额百分比。`null` 表示不限额。
   *
   * 刻意不夹到 100：超额多少正是要显示的事，首页样张上 357% 就是这么来的。
   * 画条形时调用方自己 `Math.min(…, 100)`。
   */
  quota: number | null
  quotaUsed: number
  quotaLimit: number

  /** byte/s，显示前过 formatSpeed（补 `/s` 与单位，不再除 8）。 */
  netIn: number
  netOut: number
  totalUp: number
  totalDown: number

  /** 1 / 5 / 15 分钟。离线时为 null。 */
  load: [number, number, number] | null

  processes: number
  /** TCP 连接数。服务端另有 UDP 计数，详情页目前只展示 TCP。 */
  connections: number

  tags: string[]
  /** 到期日，`null` 表示永久或长期，用 `longTerm` 区分。 */
  expiryDate: string | null
  longTerm: boolean
  /** 距到期天数，负数表示已过期。`null` 表示没有到期日。 */
  daysLeft: number | null

  level: NodeLevel
  issues: Issue[]
}

export function nodeFacts(node: NodeView): NodeFacts {
  const { client, status } = node

  // 还没有采样到达时，总量回退到元数据里的数字，这样首屏显示的是真实容量
  // 而不是一堆 0。
  const memTotal = status?.ram_total || client.mem_total
  const diskTotal = status?.disk_total || client.disk_total
  const swapTotal = status?.swap_total || client.swap_total
  const swapEnabled = swapTotal > 0

  const online = status?.online ?? false

  /*
   * 最后上报时刻。`status.time` 是服务端的 RFC3339 字符串，坏值要吸收掉 ——
   * Date.parse 失败返回 NaN，直接拿去算会渲染出 `NaN 分钟前`。
   */
  const parsed = status ? Date.parse(status.time) : Number.NaN
  const lastSeen = Number.isFinite(parsed) ? parsed / 1000 : null

  let offlineFor: number | null = null
  if (!online && lastSeen !== null) {
    const gap = Date.now() / 1000 - lastSeen
    offlineFor = gap >= 60 ? gap : null
  }

  const quotaUsed = status ? trafficUsed(status, client.traffic_limit_type) : 0
  const quotaLimit = client.traffic_limit
  const quota =
    quotaLimit > 0 && status && Number.isFinite(quotaUsed / quotaLimit)
      ? (quotaUsed / quotaLimit) * 100
      : null

  return {
    online,
    uptime: status?.uptime,
    lastSeen,
    offlineFor,

    cores: client.cpu_cores,
    cpu: status ? ratio(status.cpu, 100) : null,
    coresUsed: status ? (client.cpu_cores * status.cpu) / 100 : null,

    mem: status ? ratio(status.ram, memTotal) : null,
    memUsed: status?.ram ?? 0,
    memTotal,

    disk: status ? ratio(status.disk, diskTotal) : null,
    diskUsed: status?.disk ?? 0,
    diskTotal,

    swap: status && swapEnabled ? ratio(status.swap, swapTotal) : null,
    swapUsed: status?.swap ?? 0,
    swapTotal,
    swapEnabled,

    quota,
    quotaUsed,
    quotaLimit,

    netIn: status?.net_in ?? 0,
    netOut: status?.net_out ?? 0,
    totalUp: status?.net_total_up ?? 0,
    totalDown: status?.net_total_down ?? 0,

    load: status ? [status.load, status.load5, status.load15] : null,

    processes: status?.process ?? 0,
    connections: status?.connections ?? 0,

    tags: parseTags(client.tags),
    expiryDate: formatExpiry(client.expired_at),
    longTerm: isLongTerm(client.expired_at),
    daysLeft: daysUntil(client.expired_at),

    level: nodeLevel(node),
    issues: nodeIssues(node),
  }
}
