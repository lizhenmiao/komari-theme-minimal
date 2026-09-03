/**
 * 外部 store，由 `useSyncExternalStore` 消费。
 *
 * 需要的是按节点粒度的订阅：30 个节点每 2 秒刷新时，不能让整个网格重渲染。
 */

import type { Client, NodeStatus, PingTask, PublicInfo, Viewer } from './types'

export interface StoreState {
  publicInfo: PublicInfo | null
  clients: Client[]
  /** 按 uuid 索引。逐节点替换，没变化的节点保持原对象引用。 */
  statuses: Record<string, NodeStatus>
  /**
   * 每个节点最近若干个 CPU 采样，供卡片上的迷你趋势图用。
   *
   * 数据由状态轮询顺带累积，不额外发历史请求 —— 首页 N 张卡片各拉一次历史
   * 会把请求数放大 N 倍，而这张图只是给个趋势感，不值这个代价。
   * 代价是刚打开页面时它是空的，随轮询长出来。
   */
  cpuTrend: Record<string, number[]>
  pingTasks: PingTask[]
  /** 每个 `${uuid}:${taskId}` 的最新延迟。负值表示丢包。 */
  pingLatest: Record<string, number>
  /** 当前访客。null 表示还没问到，与「未登录」不是一回事。 */
  viewer: Viewer | null
  connected: boolean
  /** 首次成功加载前是 null；全部失败时才写入。 */
  error: string | null
  loading: boolean
}

/** 趋势图保留的采样点数。够画出形状，又不至于让 store 无限长。 */
const TREND_LENGTH = 60

const initialState: StoreState = {
  publicInfo: null,
  clients: [],
  statuses: {},
  cpuTrend: {},
  pingTasks: [],
  pingLatest: {},
  viewer: null,
  connected: false,
  error: null,
  loading: true,
}

type Listener = () => void

let state: StoreState = initialState
const listeners = new Set<Listener>()

export function getState(): StoreState {
  return state
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function emit(): void {
  for (const listener of listeners) listener()
}

/**
 * 浅合并一个 patch。改动任何嵌套集合时调用方必须传新的对象引用，因为
 * `useSyncExternalStore` 的选择器用 `Object.is` 比较。
 */
export function setState(patch: Partial<StoreState>): void {
  state = { ...state, ...patch }
  emit()
}

/**
 * 合并新到的状态，内容完全相同的节点保持原对象引用。没有这一步的话，每次
 * 轮询都会给每张卡片一个新对象，按节点的 memo 全部失效。
 */
export function mergeStatuses(incoming: Record<string, NodeStatus>): void {
  const next: Record<string, NodeStatus> = { ...state.statuses }
  let changed = false

  for (const [uuid, status] of Object.entries(incoming)) {
    const previous = next[uuid]
    if (previous && shallowEqualStatus(previous, status)) continue
    next[uuid] = status
    changed = true
  }

  if (!changed) return

  /*
   * 趋势缓冲跟着状态一起更新。只给内容确实变了的节点追加，否则轮询到重复
   * 数据时会把同一个值刷满整条曲线。
   */
  const trend: Record<string, number[]> = { ...state.cpuTrend }
  for (const [uuid, status] of Object.entries(incoming)) {
    if (next[uuid] !== status) continue
    const series = trend[uuid] ?? []
    const value = Number.isFinite(status.cpu) ? status.cpu : 0
    trend[uuid] = [...series, value].slice(-TREND_LENGTH)
  }

  state = { ...state, statuses: next, cpuTrend: trend }
  emit()
}

function shallowEqualStatus(a: NodeStatus, b: NodeStatus): boolean {
  // 在线节点的 `time` 每次轮询都在变，先比它能立刻短路掉"确实变了"这种
  // 最常见的情况。
  if (a.time !== b.time) return false
  if (a.online !== b.online) return false
  if (a.cpu !== b.cpu || a.ram !== b.ram || a.disk !== b.disk) return false
  if (a.net_in !== b.net_in || a.net_out !== b.net_out) return false
  if (a.load !== b.load || a.load5 !== b.load5 || a.load15 !== b.load15) return false
  if (a.net_total_up !== b.net_total_up || a.net_total_down !== b.net_total_down) return false
  if (a.swap !== b.swap || a.process !== b.process || a.connections !== b.connections) return false
  return true
}

/** 测试和 HMR 用。运行时不会调用。 */
export function resetStore(): void {
  state = initialState
  emit()
}
