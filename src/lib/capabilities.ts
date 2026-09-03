/**
 * 通过 `rpc.methods` 做运行时能力探测。
 *
 * 文档没有给逐方法的最低版本表，只说 RPC2 整体要求服务端 >= 1.0.7。硬编码
 * 版本判断等于瞎猜；直接问服务端有哪些方法是唯一可靠的做法。
 */

import { JsonRpcClient } from './rpc'

export const METHODS = {
  list: 'rpc.methods',
  nodes: 'common:getNodes',
  latestStatus: 'common:getNodesLatestStatus',
  publicInfo: 'common:getPublicInfo',
  records: 'common:getRecords',
  queryMetrics: 'public:queryMetrics',
  metricDefinitions: 'public:listMetricDefinitions',
  pingStats: 'public:getPingMetricStats',
  pingTasks: 'public:getPublicPingTasks',
  /** 延迟的原始采样序列。pingStats 只有聚合值，画曲线要靠这个。 */
  pingRecords: 'public:getPingRecords',
  /** 当前访客身份。未登录返回 Guest 占位，不会 401。 */
  me: 'public:getMe',
} as const

export interface Capabilities {
  /** 端点不可达时为 false，此时全部降级到 REST。 */
  rpc: boolean
  methods: ReadonlySet<string>
  nodes: boolean
  latestStatus: boolean
  publicInfo: boolean
  records: boolean
  queryMetrics: boolean
  metricDefinitions: boolean
  pingStats: boolean
  pingTasks: boolean
  pingRecords: boolean
  me: boolean
}

export const NO_CAPABILITIES: Capabilities = {
  rpc: false,
  methods: new Set(),
  nodes: false,
  latestStatus: false,
  publicInfo: false,
  records: false,
  queryMetrics: false,
  metricDefinitions: false,
  pingStats: false,
  pingTasks: false,
  pingRecords: false,
  me: false,
}

/** 兼容裸数组和 `{ methods: [...] }` 两种返回；文档给的是数组。 */
function extractMethodNames(result: unknown): string[] {
  if (Array.isArray(result)) {
    return result.filter((entry): entry is string => typeof entry === 'string')
  }
  if (result && typeof result === 'object' && 'methods' in result) {
    const inner = (result as { methods?: unknown }).methods
    if (Array.isArray(inner)) {
      return inner.filter((entry): entry is string => typeof entry === 'string')
    }
  }
  return []
}

export async function detectCapabilities(client: JsonRpcClient): Promise<Capabilities> {
  const reachable = await client.probe()
  if (!reachable) return NO_CAPABILITIES

  let names: string[] = []
  try {
    names = extractMethodNames(await client.call<unknown>(METHODS.list))
  } catch {
    // 端点响应了探测但列不出方法。认为 RPC 可用，但不假设任何具体能力，
    // 各条数据路径自己降级。
    return { ...NO_CAPABILITIES, rpc: true }
  }

  const methods = new Set(names)
  return {
    rpc: true,
    methods,
    nodes: methods.has(METHODS.nodes),
    latestStatus: methods.has(METHODS.latestStatus),
    publicInfo: methods.has(METHODS.publicInfo),
    records: methods.has(METHODS.records),
    queryMetrics: methods.has(METHODS.queryMetrics),
    metricDefinitions: methods.has(METHODS.metricDefinitions),
    pingStats: methods.has(METHODS.pingStats),
    pingTasks: methods.has(METHODS.pingTasks),
    pingRecords: methods.has(METHODS.pingRecords),
    me: methods.has(METHODS.me),
  }
}
