/**
 * 把节点元数据和实时状态合并，并决定展示顺序。
 *
 * 排序优先级：
 *   1. 主题设置里置顶的节点，按运营者填写的顺序
 *   2. weight **小的在前**
 *   3. 名称，保证权重相同时网格不会每次轮询都重排
 *
 * weight 是升序，不是降序。三条依据：
 *
 *   - 服务端对节点**完全不排序**（database/clients/client.go 的
 *     GetAllClientBasicInfo 没有 ORDER BY），所以顺序全靠主题自己定，
 *     必须和后台拖拽排序时写入的方向一致。
 *   - 同一代码库里同名字段的约定是升序：探测任务用
 *     `Order("weight ASC").Order("id ASC")`（database/tasks/ping.go）。
 *   - 后台拖拽排序按下标赋值（admin:orderClients 原样写入前端传来的
 *     uuid->weight），下标 0 就是列表第一个。
 */

import { useSyncExternalStore } from 'react'

import { getState, subscribe } from '../lib/store'
import type { NodeStatus, NodeView } from '../lib/types'

/*
 * 下面每个 snapshot 读取函数都必须缓存返回值。useSyncExternalStore 用 Object.is
 * 比较前后两次快照，每次返回新对象会被判定为「变了」，进而无限重渲染。
 *
 * 两个 snapshot 参数传同一个读取函数：主题是纯浏览器端的静态包，store 是模块级
 * 单例，没有请求级状态，也不做 hydration，所以不存在串数据或 mismatch 的问题。
 */

/** 按节点订阅：单张卡片重渲染时不牵动其他卡片。 */
export function useNodeStatus(uuid: string): NodeStatus | null {
  const read = () => getState().statuses[uuid] ?? null
  return useSyncExternalStore(subscribe, read, read)
}

let viewsClients: unknown
let viewsStatuses: unknown
let viewsPinned: readonly string[] = []
let viewsCache: NodeView[] = []

function buildViews(pinned: readonly string[]): NodeView[] {
  const { clients, statuses } = getState()

  if (clients === viewsClients && statuses === viewsStatuses && pinned === viewsPinned) {
    return viewsCache
  }

  const rank = new Map<string, number>()
  pinned.forEach((uuid, index) => rank.set(uuid, index))

  const views = clients
    // hidden 是运营者主动隐藏的节点，任何地方都不该出现。
    .filter((client) => !client.hidden)
    .map<NodeView>((client) => ({ client, status: statuses[client.uuid] ?? null }))
    .sort((a, b) => {
      const aRank = rank.get(a.client.uuid)
      const bRank = rank.get(b.client.uuid)
      if (aRank !== undefined || bRank !== undefined) {
        if (aRank === undefined) return 1
        if (bRank === undefined) return -1
        return aRank - bRank
      }
      if (a.client.weight !== b.client.weight) return a.client.weight - b.client.weight
      return a.client.name.localeCompare(b.client.name)
    })

  viewsClients = clients
  viewsStatuses = statuses
  viewsPinned = pinned
  viewsCache = views
  return views
}

export function useNodes(pinned: readonly string[] = []): NodeView[] {
  const read = () => buildViews(pinned)
  return useSyncExternalStore(subscribe, read, read)
}

let nodeUuid: string | null = null
let nodeClients: unknown
let nodeStatuses: unknown
let nodeCache: NodeView | null = null

/**
 * 单个节点。
 *
 * 这里必须缓存：`{ client, status }` 是新建的对象字面量，不缓存的话每次读取都是
 * 新引用，useSyncExternalStore 会判定快照一直在变，详情页直接无限重渲染
 * （React #185）。
 */
function buildNode(uuid: string): NodeView | null {
  const { clients, statuses } = getState()

  if (uuid === nodeUuid && clients === nodeClients && statuses === nodeStatuses) {
    return nodeCache
  }

  const client = clients.find((entry) => entry.uuid === uuid)
  const view = client ? { client, status: statuses[uuid] ?? null } : null

  nodeUuid = uuid
  nodeClients = clients
  nodeStatuses = statuses
  nodeCache = view
  return view
}

export function useNode(uuid: string): NodeView | null {
  const read = () => buildNode(uuid)
  return useSyncExternalStore(subscribe, read, read)
}

export interface NodeTotals {
  total: number
  online: number
  netIn: number
  netOut: number
  trafficUp: number
  trafficDown: number
  averageLoad: number
}

export function useTotals(): NodeTotals {
  return useSyncExternalStore(subscribe, computeTotals, computeTotals)
}

let totalsStatuses: unknown
let totalsClients: unknown
let totalsCache: NodeTotals | null = null

function computeTotals(): NodeTotals {
  const { clients, statuses } = getState()
  if (clients === totalsClients && statuses === totalsStatuses && totalsCache) {
    return totalsCache
  }

  const visible = clients.filter((client) => !client.hidden)
  let online = 0
  let netIn = 0
  let netOut = 0
  let trafficUp = 0
  let trafficDown = 0
  let loadSum = 0

  for (const client of visible) {
    const status = statuses[client.uuid]
    if (!status) continue
    if (status.online) {
      online += 1
      // 只有在线节点计入瞬时速率，否则离线节点的残留读数会永久虚高总量。
      netIn += status.net_in
      netOut += status.net_out
      loadSum += status.load
    }
    // 累计流量在节点离线后依然有意义，照常累加。
    trafficUp += status.net_total_up
    trafficDown += status.net_total_down
  }

  const totals: NodeTotals = {
    total: visible.length,
    online,
    netIn,
    netOut,
    trafficUp,
    trafficDown,
    averageLoad: online > 0 ? loadSum / online : 0,
  }

  totalsClients = clients
  totalsStatuses = statuses
  totalsCache = totals
  return totals
}

/**
 * 供测试断言引用稳定性用。数据没变时必须返回同一个引用，否则
 * useSyncExternalStore 会无限重渲染。
 */
export const __snapshotReaders = { buildViews, buildNode, computeTotals }
