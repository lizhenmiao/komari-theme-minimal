/**
 * 指标仓库（`public:queryMetrics`）的键名与返回结构。
 *
 * 键名是带点的命名空间形式，不是状态记录里的字段名 —— 这两套名字完全不同，
 * 混用不会报错，只会拿到 `unknown metric key` 或者空序列。真实键名可以用
 * `public:listMetricDefinitions` 列出来，本文件里的都在其中。
 *
 * 返回结构是 `{ series: [{ metric_key, entity_id, points: [...] }] }`，
 * 每条序列自带键名和实体，不是扁平的记录数组。
 */

/** 指标仓库里的键名。值就是服务端认的字符串。 */
export const METRIC_KEYS = {
  cpu: 'cpu.usage',
  memory: 'memory.used',
  swap: 'swap.used',
  disk: 'disk.used',
  load: 'load.average',
  netIn: 'net.in.rate',
  netOut: 'net.out.rate',
  trafficUp: 'net.total.up',
  trafficDown: 'net.total.down',
  processes: 'process.count',
  connectionsTcp: 'connections.tcp',
  pingLatency: 'ping.latency_ms',
  pingLoss: 'ping.loss',
} as const

export type MetricKey = (typeof METRIC_KEYS)[keyof typeof METRIC_KEYS]

/** 服务端支持的降采样算法。 */
export type Aggregation = 'avg' | 'min' | 'max' | 'last' | 'p50' | 'p99' | 'stddev'

/**
 * 逐指标的降采样算法。
 *
 * `avg` 会把一个 100% 的 CPU 尖峰平均进十个采样点后变成 10%，图上就看不见了。
 * 所以尖刺本身即信号的指标用 `max`；内存、swap、磁盘变化缓慢，取平均更能代表
 * 区间状态。累计量用 `last`，取平均毫无意义。
 */
export const AGGREGATION_BY_METRIC: Partial<Record<MetricKey, Aggregation>> = {
  [METRIC_KEYS.cpu]: 'max',
  [METRIC_KEYS.load]: 'max',
  [METRIC_KEYS.netIn]: 'max',
  [METRIC_KEYS.netOut]: 'max',
  [METRIC_KEYS.memory]: 'avg',
  [METRIC_KEYS.swap]: 'avg',
  [METRIC_KEYS.disk]: 'avg',
  [METRIC_KEYS.trafficUp]: 'last',
  [METRIC_KEYS.trafficDown]: 'last',
  [METRIC_KEYS.pingLatency]: 'avg',
  [METRIC_KEYS.pingLoss]: 'avg',
}

/** 序列里的一个采样点。`count` 是这个桶里聚合了多少条原始采样。 */
export interface MetricPoint {
  /** RFC3339。 */
  time: string
  value: number
  count?: number
  /** 同一指标的多条序列靠标签区分，比如 ping 的 `task_id`、GPU 的 `device_index`。 */
  tags?: Record<string, string>
}

export interface MetricSeries {
  metric_key: string
  entity_id: string
  type?: string
  unit?: string
  downsampled?: boolean
  downsample_algorithm?: string
  interval_seconds?: number
  count?: number
  points?: MetricPoint[]
  /** 序列级标签。按标签拆分时，点上和序列上都可能带。 */
  tags?: Record<string, string>
}

export interface QueryMetricsResult {
  count?: number
  start?: string
  end?: string
  series?: MetricSeries[]
}

/**
 * 从 `queryMetrics` 的返回里取出序列数组。
 *
 * 兼容三种：`{ series: [...] }`（真实返回）、裸数组、以及 `{ records: [...] }`。
 * 后两种没在真实实例上见到，但接口文档没有给出保证，容错成本极低。
 */
export function extractSeries(payload: unknown): MetricSeries[] {
  if (Array.isArray(payload)) return payload as MetricSeries[]
  if (!payload || typeof payload !== 'object') return []
  const shaped = payload as QueryMetricsResult & { records?: unknown }
  if (Array.isArray(shaped.series)) return shaped.series
  if (Array.isArray(shaped.records)) return shaped.records as MetricSeries[]
  return []
}

/** 某个实体某个指标的序列。多条时（按标签拆分）合并所有点。 */
export function pointsFor(
  series: MetricSeries[],
  metricKey: string,
  entityId?: string,
): MetricPoint[] {
  const matched = series.filter(
    (entry) =>
      entry.metric_key === metricKey && (entityId === undefined || entry.entity_id === entityId),
  )
  if (matched.length === 1) return matched[0]?.points ?? []
  return matched.flatMap((entry) => entry.points ?? [])
}

/**
 * 按标签值把一个指标的点分组，用于 ping：同一个 `ping.latency_ms` 下每个探测
 * 任务是一条独立序列，靠 `task_id` 标签区分（服务端把它当字符串处理）。
 */
export function pointsByTag(
  series: MetricSeries[],
  metricKey: string,
  tag: string,
  entityId?: string,
): Map<string, MetricPoint[]> {
  const out = new Map<string, MetricPoint[]>()
  for (const entry of series) {
    if (entry.metric_key !== metricKey) continue
    if (entityId !== undefined && entry.entity_id !== entityId) continue
    for (const point of entry.points ?? []) {
      // 标签可能挂在点上，也可能挂在序列上
      const value = point.tags?.[tag] ?? entry.tags?.[tag]
      if (value === undefined) continue
      const bucket = out.get(value)
      if (bucket) bucket.push(point)
      else out.set(value, [point])
    }
  }
  return out
}

/** Unix 秒。解析失败返回 null，调用方据此丢弃这个点。 */
export function toUnixSeconds(time: string): number | null {
  const ms = new Date(time).getTime()
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null
}
