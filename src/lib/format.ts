/**
 * 纯格式化函数。接口用来代替 null 的各种哨兵值都在这里被吸收掉，
 * 保证组件永远不会渲染出 `NaN`、`-1` 或 `"None"`。
 */

import type { Client, NodeStatus, TrafficLimitType } from './types'

const UNITS_LONG = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const
const UNITS_SHORT = ['B', 'K', 'M', 'G', 'T', 'P'] as const

/**
 * 字节数，单位自动选择。同一个面板里可能既有 256 MB 的小鸡也有 2 TB 的独服，
 * 单位不可能写死。
 *
 * `short` 去掉空格并缩写单位，给表格单元格和进度条下方的小字用。
 */
export function formatBytes(n: number, short = false): string {
  if (!Number.isFinite(n) || n <= 0) return short ? '0' : '0 B'
  const units = short ? UNITS_SHORT : UNITS_LONG
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1)
  const value = n / 1024 ** i
  // 让字符串宽度大致稳定：数值越大，小数位越少。
  const digits = i === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2
  const unit = units[i] ?? 'B'
  return short ? `${value.toFixed(digits)}${unit}` : `${value.toFixed(digits)} ${unit}`
}

/** `net_in` / `net_out` 的单位是 bit/s，展示时换成 byte/s。 */
export function formatSpeed(bitsPerSecond: number): string {
  return `${formatBytes(bitsPerSecond / 8, true)}/s`
}

export function formatPercent(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return '—'
  return `${n.toFixed(digits)}%`
}

/** 安全求百分比；分母缺失或为 0 时返回 null，由调用方决定怎么显示。 */
export function ratio(used: number, total: number): number | null {
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return null
  return Math.min(Math.max((used / total) * 100, 0), 100)
}

/** 在线时长的单位后缀。由调用方从 i18n 取，格式化本身不依赖 React。 */
export interface UptimeUnits {
  day: string
  hour: string
  minute: string
}

/**
 * 在线时长，天不足则退到小时，小时不足则退到分钟。
 *
 * 单位由调用方传入而不是写死 `d`/`h`/`m`：中文里「12d 3h」读起来别扭，
 * 而这个函数在 lib 层，不能自己调 i18n。
 */
export function formatUptime(seconds: number | undefined, units: UptimeUnits): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return '—'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days} ${units.day} ${hours} ${units.hour}`
  if (hours > 0) return `${hours} ${units.hour} ${minutes} ${units.minute}`
  return `${minutes} ${units.minute}`
}

/**
 * 「长期」判定。
 *
 * 后台选「长期」时写入的不是 null，而是一个很远的日期（实测是 2225-12-11）。
 * 服务端的判定是相对的 —— `utils/renewal/renewal.go:48-52`：
 *
 *     hundredYearsFromNow := localNow.AddDate(100, 0, 0).UTC()
 *     // 如果过期时间超过当前时间100年，视为长期/一次性账单，不续费
 *     if clientExpireTime.After(hundredYearsFromNow) { return }
 *
 * 这里必须照抄这个相对判定，不能硬编码某个年份：服务端将来改了哨兵值，
 * 相对判定仍然成立，硬编码会在某一天悄悄失配，然后把「长期」显示成
 * 一个荒谬的日期和「剩 72785 天」。
 */
const HUNDRED_YEARS_MS = 100 * 365.2425 * 86_400_000

export function isLongTerm(iso: string | null): boolean {
  if (!iso) return false
  const target = new Date(iso).getTime()
  if (Number.isNaN(target)) return false
  return target > Date.now() + HUNDRED_YEARS_MS
}

/**
 * 到期日渲染成 MM/DD/YYYY。
 *
 * 两种情况返回 null，由调用方决定文案：`iso` 为 null（后端的「永久」，
 * `expired_at: null` 是合法值）和判定为长期。
 */
export function formatExpiry(iso: string | null): string | null {
  if (!iso) return null
  if (isLongTerm(iso)) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  // 服务端把 0002 年之前的值当无效处理（renewal.go:39），跟着照做。
  if (date.getFullYear() < 2) return null
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${mm}/${dd}/${date.getFullYear()}`
}

/**
 * 距到期还有几天。负数表示已经过期。
 *
 * 长期返回 null：「剩 72785 天」对读者没有任何信息量。
 */
export function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  if (isLongTerm(iso)) return null
  const target = new Date(iso).getTime()
  if (Number.isNaN(target)) return null
  return Math.ceil((target - Date.now()) / 86_400_000)
}

/**
 * 按节点自己的计费规则算已用流量。算错的话，所有不是默认 `sum` 的节点
 * 配额都会静默报错 —— 页面照常显示，数字是错的。
 */
export function trafficUsed(status: NodeStatus, type: TrafficLimitType): number {
  const up = status.net_total_up
  const down = status.net_total_down
  switch (type) {
    case 'up':
      return up
    case 'down':
      return down
    case 'max':
      return Math.max(up, down)
    case 'min':
      return Math.min(up, down)
    case 'sum':
      return up + down
    default:
      return up + down
  }
}

/**
 * 价格文案；不该显示时返回 null。
 * `-1` 表示免费，`0` 表示运营者从未设置过。
 */
export function formatPrice(client: Client): string | null {
  if (client.price === 0) return null
  const currency = client.currency || '$'
  if (client.price < 0) return 'Free'
  const cycle = client.billing_cycle > 0 ? ` / ${client.billing_cycle}d` : ''
  return `${client.price} ${currency}${cycle}`
}

/** GPU 型号；节点上报字符串 `"None"` 时返回 null。 */
export function formatGpu(name: string): string | null {
  if (!name || name === 'None') return null
  return name
}

/** 物理核数未知时是 `0`，这种情况就只显示逻辑核数。 */
export function formatCores(client: Client): string {
  if (client.cpu_physical_cores > 0 && client.cpu_physical_cores !== client.cpu_cores) {
    return `${client.cpu_cores}C / ${client.cpu_physical_cores}P`
  }
  return `${client.cpu_cores}C`
}

/** `tags` 是 `;` 分隔的字符串。空片段丢掉。 */
export function parseTags(tags: string): string[] {
  if (!tags) return []
  return tags
    .split(';')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

/**
 * 带明确时区偏移的 RFC3339。服务端会直接拒绝无时区的时间字符串，
 * 也不会把 Unix 时间戳猜出来。
 */
export function toRfc3339(date: Date): string {
  return date.toISOString()
}
