/**
 * 带默认值合并的、类型化的 `theme_settings` 访问。
 *
 * `theme_settings` 是通过无鉴权、全世界可读的 `GET /api/public` 下发的，
 * 所以 manifest 里不能放任何 token、密钥或私有 URL，`showPrice` 也默认关闭。
 *
 * 低于 1.0.5 的服务端完全没有这个字段，所以每次读取都要容忍它缺失、为 null
 * 或类型不对。
 */

import { useSyncExternalStore } from 'react'

import { getState, subscribe } from '../lib/store'
import type { DefaultAppearance, SkinName, ThemeSettings } from '../lib/types'

/**
 * 风格的出厂默认值。
 *
 * 服务端对后台没存过的键一律补 manifest 的默认值
 * （`.tmp/komari/database/utils.go` 里的 `managedconfig.DefaultValue`），
 * 分不出新装和老装，所以老站点升级后也会落到这里 —— 这是产品决策，
 * 不是疏漏，Release 说明里要写明「想保留原样就到后台选经典」。
 */
const DEFAULT_SKIN: SkinName = 'apple'

const SKINS: readonly SkinName[] = ['classic', 'vercel', 'apple']
const APPEARANCES: readonly DefaultAppearance[] = ['system', 'light', 'dark']

export const DEFAULT_SETTINGS: ThemeSettings = {
  style: DEFAULT_SKIN,
  defaultAppearance: 'system',
  showAttention: true,
  defaultView: 'grid',
  refreshInterval: 2,
  showDisk: true,
  showLoad: true,
  showSparkline: true,
  showTraffic: true,
  showExpiry: true,
  // 价格对所有匿名访客可见。只能显式开启，不能默认开着让人去关。
  showPrice: false,
  showPing: true,
  featuredPingTasks: [],
  historyHours: 4,
  maxPoints: 500,
  featuredNodes: [],
  footerHtml: '',
}

function readBoolean(raw: unknown, fallback: boolean): boolean {
  if (typeof raw === 'boolean') return raw
  // 后台的 managed 表单可能把开关序列化成字符串。
  if (raw === 'true') return true
  if (raw === 'false') return false
  return fallback
}

function readNumber(raw: unknown, fallback: number, min: number): number {
  const value = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(value) || value < min) return fallback
  return value
}

/**
 * `nodes` 和 `pingtasks` 两类设置存的是 JSON 字符串，默认值就是字面量
 * `"[]"`，用之前必须先 parse。
 */
function readJsonArray<T>(raw: unknown, guard: (entry: unknown) => entry is T): T[] {
  if (Array.isArray(raw)) return raw.filter(guard)
  if (typeof raw !== 'string' || raw.trim() === '') return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(guard) : []
  } catch {
    return []
  }
}

const isString = (entry: unknown): entry is string => typeof entry === 'string'
const isNumber = (entry: unknown): entry is number =>
  typeof entry === 'number' && Number.isFinite(entry)

/**
 * 读 `select` 型设置。
 *
 * 后台存的是选项字符串本身。大小写与首尾空白都容错一下：这个值可能由管理员
 * 手改数据库写进去，一个空格就让整套界面回退到默认风格，排查起来毫无线索。
 */
function readChoice<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  if (typeof raw !== 'string') return fallback
  const value = raw.trim().toLowerCase()
  return allowed.find((entry) => entry === value) ?? fallback
}

export function resolveSettings(raw: Record<string, unknown> | undefined | null): ThemeSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_SETTINGS

  const view = raw['defaultView']
  return {
    style: readChoice(raw['style'], SKINS, DEFAULT_SETTINGS.style),
    defaultAppearance: readChoice(
      raw['defaultAppearance'],
      APPEARANCES,
      DEFAULT_SETTINGS.defaultAppearance,
    ),
    showAttention: readBoolean(raw['showAttention'], DEFAULT_SETTINGS.showAttention),
    // `select` 的缺省值回退到第一个选项，也就是 `grid`。
    defaultView: view === 'table' ? 'table' : 'grid',
    refreshInterval: readNumber(raw['refreshInterval'], DEFAULT_SETTINGS.refreshInterval, 1),
    showDisk: readBoolean(raw['showDisk'], DEFAULT_SETTINGS.showDisk),
    showLoad: readBoolean(raw['showLoad'], DEFAULT_SETTINGS.showLoad),
    showSparkline: readBoolean(raw['showSparkline'], DEFAULT_SETTINGS.showSparkline),
    showTraffic: readBoolean(raw['showTraffic'], DEFAULT_SETTINGS.showTraffic),
    showExpiry: readBoolean(raw['showExpiry'], DEFAULT_SETTINGS.showExpiry),
    showPrice: readBoolean(raw['showPrice'], DEFAULT_SETTINGS.showPrice),
    showPing: readBoolean(raw['showPing'], DEFAULT_SETTINGS.showPing),
    featuredPingTasks: readJsonArray(raw['featuredPingTasks'], isNumber),
    historyHours: readNumber(raw['historyHours'], DEFAULT_SETTINGS.historyHours, 1),
    maxPoints: readNumber(raw['maxPoints'], DEFAULT_SETTINGS.maxPoints, 10),
    featuredNodes: readJsonArray(raw['featuredNodes'], isString),
    footerHtml: typeof raw['footerHtml'] === 'string' ? raw['footerHtml'] : '',
  }
}

/** 缓存起来，这样无关的 store 更新不会改变快照的对象引用。 */
let cachedRaw: Record<string, unknown> | undefined
let cachedResolved: ThemeSettings = DEFAULT_SETTINGS

function getSnapshot(): ThemeSettings {
  const raw = getState().publicInfo?.theme_settings
  if (raw === cachedRaw) return cachedResolved
  cachedRaw = raw
  cachedResolved = resolveSettings(raw)
  return cachedResolved
}

export function useThemeSettings(): ThemeSettings {
  // 两个快照参数用同一个读取函数，原因见 useNodes.ts 的说明。
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
