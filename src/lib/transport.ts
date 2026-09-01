/**
 * 管住所有网络路径：能力探测、实时轮询循环、REST 与 `/api/clients` 降级。
 *
 * 接口里没有任何推送或订阅机制 —— RPC2 没有 `subscribe`，`/api/clients`
 * 也是请求响应式 —— 所以实时数据只能靠轮询。间隔从主题设置读，标签页
 * 隐藏时整个循环暂停。
 */

import { detectCapabilities, METHODS, NO_CAPABILITIES } from './capabilities'
import { fromNested } from './normalize'
import { request, websocketUrl } from './request'
import { JsonRpcClient } from './rpc'
import { getState as getStoreState, mergeStatuses, setState } from './store'
import type { Capabilities } from './capabilities'
import type {
  Client,
  ClientsFrame,
  NodeStatus,
  PingTask,
  PublicInfo,
} from './types'

const DEFAULT_INTERVAL_MS = 2000
/** 元数据很少变，按这个节奏重拉，不必每次轮询都拉。 */
const METADATA_INTERVAL_MS = 60_000
/** 探测任务通常一分钟一次，拉得更勤没有意义。 */
const PING_INTERVAL_MS = 30_000

export interface TransportConfig {
  refreshIntervalSeconds: number
}

let rpc: JsonRpcClient | null = null
let capabilities: Capabilities = NO_CAPABILITIES
let pollTimer: ReturnType<typeof setTimeout> | null = null
let metadataTimer: ReturnType<typeof setTimeout> | null = null
let intervalMs = DEFAULT_INTERVAL_MS
let started = false
/** 防止慢响应跨过下一个 tick 造成轮询重叠。 */
let inFlight = false
let lastMetadataAt = 0
let lastPingAt = 0
/** 每次 stopTransport 递增，用来让在飞的启动流程认出自己已被取代。 */
let startGeneration = 0

/** 降级状态路径复用的 `/api/clients` socket。 */
let clientsSocket: WebSocket | null = null

export function getCapabilities(): Capabilities {
  return capabilities
}

export function getRpcClient(): JsonRpcClient | null {
  return rpc
}

export function configureTransport(config: TransportConfig): void {
  const seconds = Number(config.refreshIntervalSeconds)
  // 防止配成 0 之后疯狂打服务端。
  const next = Number.isFinite(seconds) && seconds >= 1 ? seconds * 1000 : DEFAULT_INTERVAL_MS
  if (next === intervalMs) return
  intervalMs = next
  if (started) scheduleNextPoll(0)
}

export async function startTransport(): Promise<void> {
  if (started) return
  started = true

  /*
   * 世代号。React StrictMode 在开发态会把 effect 挂载两次：
   * start → stop → start。第一次 start 还停在下面的 await 上时，stop 已经把
   * 模块级的 rpc 置成 null 了，await 恢复后继续用它就是空指针。
   *
   * started 这个标志拦不住：stop 把它设回 false，第二次 start 直接放行，
   * 于是两次启动流程同时在跑、抢同一份状态。
   *
   * 所以每次 stop 递增世代号，start 在每个 await 之后核对一次：世代变了说明
   * 自己已被取代，立刻收尾退出，不再碰任何共享状态。
   */
  const generation = ++startGeneration
  const superseded = () => generation !== startGeneration

  // 本地引用：即便 stop 把模块级的 rpc 置空，也能安全地把这个实例收掉。
  const client = new JsonRpcClient()
  rpc = client

  const detected = await detectCapabilities(client)
  if (superseded()) {
    client.dispose()
    return
  }
  capabilities = detected

  if (capabilities.rpc) {
    client.connect()
    client.onStateChange((state) => {
      // 已被取代的那一代不该再写 store。
      if (superseded()) return
      setState({ connected: state === 'open' })
      // 新连上的 socket 没有任何服务端状态，立刻拉一次，不等当前间隔走完。
      if (state === 'open') scheduleNextPoll(0)
    })
  } else {
    client.dispose()
    if (rpc === client) rpc = null
  }

  document.addEventListener('visibilitychange', onVisibilityChange)

  await Promise.all([loadPublicInfo(), loadMetadata(), loadPingTasks()])
  if (superseded()) return

  await pollStatuses()
  if (superseded()) return

  setState({ loading: false })
  // 放在任务列表拿到之后，这样第一次请求才有 ID 可问。
  void pollPing()
  scheduleNextPoll(intervalMs)
}

export function stopTransport(): void {
  started = false
  // 让所有在飞的 startTransport 认出自己已被取代。
  startGeneration += 1
  if (pollTimer) clearTimeout(pollTimer)
  if (metadataTimer) clearTimeout(metadataTimer)
  pollTimer = null
  metadataTimer = null
  document.removeEventListener('visibilitychange', onVisibilityChange)
  clientsSocket?.close()
  clientsSocket = null
  rpc?.dispose()
  rpc = null
}

function onVisibilityChange(): void {
  if (document.hidden) {
    if (pollTimer) clearTimeout(pollTimer)
    pollTimer = null
    return
  }
  // 在后台待过一段时间后数据必然是旧的，立刻刷新。
  scheduleNextPoll(0)
}

function scheduleNextPoll(delay: number): void {
  if (!started || document.hidden) return
  if (pollTimer) clearTimeout(pollTimer)
  pollTimer = setTimeout(() => {
    void tick()
  }, delay)
}

async function tick(): Promise<void> {
  if (!started) return
  if (inFlight) {
    scheduleNextPoll(intervalMs)
    return
  }
  inFlight = true
  try {
    await pollStatuses()
    if (Date.now() - lastMetadataAt > METADATA_INTERVAL_MS) {
      await loadMetadata()
    }
    if (Date.now() - lastPingAt > PING_INTERVAL_MS) {
      await pollPing()
    }
  } finally {
    inFlight = false
    scheduleNextPoll(intervalMs)
  }
}

/* ------------------------------------------------------------------ */
/* ping                                                                */
/* ------------------------------------------------------------------ */

/**
 * 每个节点每个任务的最新延迟，给卡片上的药丸用。
 *
 * 探测任务有自己的周期（通常 60 秒），按状态轮询的间隔来拉只会反复取到
 * 同样的数字。一小时窗口配一个很小的点数预算，足够拿到每个组合的最新采样。
 */
async function pollPing(): Promise<void> {
  const { pingTasks } = getStoreState()
  if (pingTasks.length === 0) return

  const capabilities = getCapabilities()
  if (!capabilities.pingStats || !rpc) return

  try {
    /*
     * getPingMetricStats 返回的是**聚合统计**，不是采样序列：
     * `{ start, end, interval_seconds, stats: [...], count }`，每条 stats
     * 带 min/max/avg/latest/p50/p99/loss（见 web/rpc/jsonrpc/public.metric.go
     * 的 publicPingMetricTaskStats）。卡片上要的最新值直接取 `latest`。
     *
     * 之前这里把它当成 PingRecord[] 处理，于是在真实实例上一条都取不到，
     * 三网延迟药丸永远显示 —— 而且是静默的，这个方法本身返回 200。
     */
    const payload = await rpc.call<unknown>(METHODS.pingStats, {
      task_ids: pingTasks.map((task) => task.id),
      hours: 1,
      max_points: 60,
    })

    const latest: Record<string, number> = {}
    const stats = extractPingStats(payload)
    for (const entry of stats) {
      if (!entry.entity_id || entry.task_id === undefined) continue
      // task_id 在统计里是字符串，而任务列表里是数字。键统一按字符串拼。
      const key = `${entry.entity_id}:${entry.task_id}`
      if (typeof entry.latest === 'number') {
        latest[key] = entry.latest
      } else if (entry.loss === 1) {
        // 全丢包时没有 latest。用 -1 表达"探测丢失"，和采样里的约定一致。
        latest[key] = -1
      }
    }

    if (Object.keys(latest).length === 0) return
    lastPingAt = Date.now()
    setState({ pingLatest: latest })
  } catch {
    // 延迟属于装饰信息，这里失败不能干扰状态主路径。
  }
}

interface PingTaskStats {
  entity_id?: string
  task_id?: string | number
  latest?: number
  loss?: number
}

function extractPingStats(payload: unknown): PingTaskStats[] {
  if (Array.isArray(payload)) return payload as PingTaskStats[]
  if (payload && typeof payload === 'object') {
    const shaped = payload as { stats?: unknown }
    if (Array.isArray(shaped.stats)) return shaped.stats as PingTaskStats[]
  }
  return []
}

/* ------------------------------------------------------------------ */
/* 站点信息                                                            */
/* ------------------------------------------------------------------ */

async function loadPublicInfo(): Promise<void> {
  try {
    const info = capabilities.publicInfo && rpc
      ? await rpc.call<PublicInfo>(METHODS.publicInfo)
      : await request<PublicInfo>('/api/public')
    setState({ publicInfo: info })
  } catch (error) {
    // 非致命：拿不到就用代码里的默认值渲染。
    reportError(error, 'public info')
  }
}

/* ------------------------------------------------------------------ */
/* 节点元数据                                                          */
/* ------------------------------------------------------------------ */

/**
 * 节点元数据的两条路径返回的形状不一样，必须都认。
 *
 * - RPC `common:getNodes` 返回**以 uuid 为键的字典**
 *   （web/rpc/jsonrpc/common.go：「返回以 uuid 为键的字典」）。
 * - REST `/api/nodes` 信封里的 `data` 是数组。
 *
 * 只按数组处理的话，RPC 可用的实例上一个节点都出不来，而且是静默的 ——
 * 请求 200、没有异常，只是列表永远为空。
 */
function toClientArray(payload: unknown): Client[] | null {
  if (Array.isArray(payload)) return payload as Client[]
  if (payload && typeof payload === 'object') {
    // 字典的每个 value 自身也带 uuid 字段，直接取值即可
    const values = Object.values(payload as Record<string, unknown>)
    if (values.every((entry) => entry && typeof entry === 'object')) {
      return values as Client[]
    }
  }
  return null
}

async function loadMetadata(): Promise<void> {
  try {
    const payload = capabilities.nodes && rpc
      ? await rpc.call<unknown>(METHODS.nodes)
      : await request<unknown>('/api/nodes')
    const clients = toClientArray(payload)
    if (clients) {
      lastMetadataAt = Date.now()
      setState({ clients, error: null })
    }
  } catch (error) {
    reportError(error, 'node metadata')
  }
}

/* ------------------------------------------------------------------ */
/* 探测任务                                                            */
/* ------------------------------------------------------------------ */

async function loadPingTasks(): Promise<void> {
  try {
    const tasks = capabilities.pingTasks && rpc
      ? await rpc.call<PingTask[]>(METHODS.pingTasks)
      : await request<PingTask[]>('/api/task/ping')
    if (Array.isArray(tasks)) setState({ pingTasks: tasks })
  } catch {
    // ping 是可选的，服务端没配任务是正常情况。
    setState({ pingTasks: [] })
  }
}

/* ------------------------------------------------------------------ */
/* 实时状态                                                            */
/* ------------------------------------------------------------------ */

async function pollStatuses(): Promise<void> {
  if (capabilities.latestStatus && rpc) {
    try {
      const payload = await rpc.call<NodeStatus[] | Record<string, NodeStatus>>(
        METHODS.latestStatus,
      )
      const map = toStatusMap(payload)
      if (Object.keys(map).length > 0) {
        mergeStatuses(map)
        setState({ error: null })
        return
      }
    } catch (error) {
      reportError(error, 'live status')
    }
  }

  // 降级：走 WS `/api/clients` 拿嵌套结构。
  try {
    const map = await fetchViaClientsSocket()
    mergeStatuses(map)
    setState({ error: null })
  } catch (error) {
    reportError(error, 'live status fallback')
  }
}

/** `common:getNodesLatestStatus` 可能返回数组，也可能返回按 uuid 索引的 map。 */
function toStatusMap(payload: NodeStatus[] | Record<string, NodeStatus>): Record<string, NodeStatus> {
  if (Array.isArray(payload)) {
    const map: Record<string, NodeStatus> = {}
    for (const status of payload) {
      if (status?.client) map[status.client] = status
    }
    return map
  }
  if (payload && typeof payload === 'object') return payload
  return {}
}

/**
 * `/api/clients` 是裸文本协议：发 `get`，回一帧。没有请求 ID，所以同一时刻
 * 只能有一个请求在飞 —— 这里没问题，因为状态路径只有一个消费者。
 */
function fetchViaClientsSocket(): Promise<Record<string, NodeStatus>> {
  return new Promise((resolve, reject) => {
    const socket = clientsSocket
    if (socket && socket.readyState === WebSocket.OPEN) {
      awaitFrame(socket, resolve, reject)
      try {
        socket.send('get')
      } catch (error) {
        // socket 在 readyState 检查和 send 之间死掉了。
        clientsSocket = null
        reject(error instanceof Error ? error : new Error('clients send failed'))
      }
      return
    }

    let opened: WebSocket
    try {
      opened = new WebSocket(websocketUrl('/api/clients'))
    } catch (error) {
      reject(error instanceof Error ? error : new Error('clients socket failed'))
      return
    }
    clientsSocket = opened

    // 每条退出路径都必须恰好 settle 一次。提前 close 时把 promise 留在
    // pending 会让 `inFlight` 永久卡住，轮询从此彻底停掉。
    let settled = false
    const finish = (error: Error | null, value?: Record<string, NodeStatus>) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(error)
      else resolve(value ?? {})
    }

    const timer = setTimeout(() => {
      finish(new Error('clients socket timed out'))
    }, 10_000)

    opened.onopen = () => {
      clearTimeout(timer)
      awaitFrame(
        opened,
        (map) => finish(null, map),
        (error) => finish(error),
      )
      opened.send('get')
    }
    opened.onclose = () => {
      if (clientsSocket === opened) clientsSocket = null
      // 端点拒绝升级时会先走到这里，`onopen` 永远不会触发。
      finish(new Error('clients socket closed before opening'))
    }
    opened.onerror = () => {
      finish(new Error('clients socket errored'))
    }
  })
}

function awaitFrame(
  socket: WebSocket,
  resolve: (value: Record<string, NodeStatus>) => void,
  reject: (reason: Error) => void,
): void {
  const timer = setTimeout(() => {
    socket.onmessage = null
    reject(new Error('clients frame timed out'))
  }, 10_000)

  socket.onmessage = (event) => {
    clearTimeout(timer)
    socket.onmessage = null
    if (typeof event.data !== 'string') {
      reject(new Error('clients frame was not text'))
      return
    }
    try {
      resolve(parseClientsFrame(event.data))
    } catch (error) {
      reject(error instanceof Error ? error : new Error('clients frame parse failed'))
    }
  }
}

/**
 * 这里的在线状态放在同级的 `data.online` 数组里，不在每个状态对象上，
 * 所以要按 uuid join 回去。
 */
export function parseClientsFrame(raw: string): Record<string, NodeStatus> {
  const frame = JSON.parse(raw) as ClientsFrame
  const inner = frame.data?.data ?? {}
  const online = new Set(frame.data?.online ?? [])
  const map: Record<string, NodeStatus> = {}
  for (const [uuid, nested] of Object.entries(inner)) {
    map[uuid] = fromNested(uuid, nested, online.has(uuid))
  }
  return map
}

function reportError(error: unknown, label: string): void {
  const message = error instanceof Error ? error.message : String(error)
  // 只在什么都没加载出来时才呈现给用户；网格已有数据时，偶发的轮询失败
  // 不应该把页面清空。
  if (import.meta.env.DEV) {
    console.warn(`[transport] ${label}: ${message}`)
  }
  setState({ error: `${label}: ${message}` })
}
