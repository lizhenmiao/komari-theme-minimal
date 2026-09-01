/**
 * 详情页的延迟曲线。
 *
 * 数据来源有两条，形状完全不同：
 *
 * - 主路径 `public:queryMetrics` + `ping.latency_ms`：多个探测任务共用一个
 *   指标键，靠点上的 `task_id` 标签拆分，而**标签值是字符串**
 *   （web/rpc/jsonrpc/public.metric.go 里 `point.Tags["task_id"]`）。
 * - 降级路径 `public:getPingRecords`：扁平数组 `{task_id, time, value, client}`，
 *   这里的 `task_id` 是数字。
 *
 * 刻意不用 `getPingMetricStats`：它返回的是聚合统计（min/max/avg/latest/
 * p50/p99/loss），没有时间序列，画不出曲线。卡片上的最新值才用它。
 *
 * 采样为负表示探测丢失。画图时转成 null 让线断开，同时单独计数算丢包率。
 */

import { useCallback, useEffect, useMemo, useState } from 'react'

import { METHODS } from '../lib/capabilities'
import { METRIC_KEYS, extractSeries, pointsByTag, toUnixSeconds } from '../lib/metrics'
import { request } from '../lib/request'
import { getCapabilities, getRpcClient } from '../lib/transport'
import { RANGE_HOURS } from './useNodeHistory'
import type { RangeKey } from './useNodeHistory'
import type { PingRecord } from '../lib/types'

export interface PingSeries {
  /** Unix 秒，升序。 */
  timestamps: number[]
  /**
   * 按任务 ID 索引，与 `timestamps` 对齐。null 表示探测丢失。
   *
   * 键是字符串：指标标签里的 `task_id` 就是字符串，而任务列表里是数字。
   * JS 的对象键本身会强制转成字符串，所以 `byTask[task.id]` 依然能取到。
   */
  byTask: Record<string, (number | null)[]>
  /** 所有任务合计的丢失采样占比。 */
  lossRate: number
}

const EMPTY: PingSeries = { timestamps: [], byTask: {}, lossRate: 0 }

/** 一个任务的一列采样：时刻 -> 值（负值表示丢失）。 */
type Column = Map<number, number>

/** 把每个任务的列对齐到共享时间轴。 */
function align(columns: Map<string, Column>): PingSeries {
  const allTimes = new Set<number>()
  for (const column of columns.values()) {
    for (const time of column.keys()) allTimes.add(time)
  }
  const timestamps = [...allTimes].sort((a, b) => a - b)
  if (timestamps.length === 0) return EMPTY

  const byTask: Record<string, (number | null)[]> = {}
  let lost = 0
  let total = 0

  for (const [taskId, column] of columns) {
    const list: (number | null)[] = []
    for (const time of timestamps) {
      const value = column.get(time)
      if (value === undefined) {
        // 这个任务在这一刻没有采样：留空洞，不插值。
        list.push(null)
        continue
      }
      total += 1
      if (value < 0) {
        // 丢失渲染成断口，而不是一个向下的尖刺。
        lost += 1
        list.push(null)
      } else {
        list.push(value)
      }
    }
    byTask[taskId] = list
  }

  return { timestamps, byTask, lossRate: total > 0 ? lost / total : 0 }
}

/** 主路径：按 task_id 标签拆分的指标序列。 */
function fromSeries(payload: unknown, uuid: string): PingSeries {
  const series = extractSeries(payload)
  if (series.length === 0) return EMPTY

  const grouped = pointsByTag(series, METRIC_KEYS.pingLatency, 'task_id', uuid)
  if (grouped.size === 0) return EMPTY

  const columns = new Map<string, Column>()
  for (const [taskId, points] of grouped) {
    const column: Column = new Map()
    for (const point of points) {
      const seconds = toUnixSeconds(point.time)
      if (seconds === null || !Number.isFinite(point.value)) continue
      column.set(seconds, point.value)
    }
    if (column.size > 0) columns.set(taskId, column)
  }
  return align(columns)
}

/** 降级路径：扁平采样数组。 */
function fromRecords(records: PingRecord[]): PingSeries {
  const columns = new Map<string, Column>()
  for (const record of records) {
    const seconds = toUnixSeconds(record.time)
    if (seconds === null) continue
    const key = String(record.task_id)
    let column = columns.get(key)
    if (!column) {
      column = new Map()
      columns.set(key, column)
    }
    column.set(seconds, record.value)
  }
  return align(columns)
}

function extractPingRecords(payload: unknown): PingRecord[] {
  if (Array.isArray(payload)) return payload as PingRecord[]
  if (payload && typeof payload === 'object') {
    const shaped = payload as { records?: unknown; data?: unknown }
    if (Array.isArray(shaped.records)) return shaped.records as PingRecord[]
    if (Array.isArray(shaped.data)) return shaped.data as PingRecord[]
  }
  return []
}

export function usePingStats(
  uuid: string,
  taskIds: number[],
  range: RangeKey,
  maxPoints: number,
  enabled: boolean,
): { series: PingSeries; loading: boolean } {
  const [series, setSeries] = useState<PingSeries>(EMPTY)
  const [loading, setLoading] = useState(false)

  const hours = RANGE_HOURS[range]
  // 用稳定的原始值，避免数组换了引用就重新触发 effect。
  const taskKey = taskIds.join(',')

  const load = useCallback(
    async (signal: AbortSignal) => {
      if (!enabled) {
        setSeries(EMPTY)
        return
      }
      setLoading(true)

      const capabilities = getCapabilities()
      const rpc = getRpcClient()

      try {
        // 主路径：指标仓库里的延迟序列。
        if (capabilities.queryMetrics && rpc) {
          try {
            const payload = await rpc.call<unknown>(METHODS.queryMetrics, {
              entity_ids: [uuid],
              metric_keys: [METRIC_KEYS.pingLatency],
              hours,
              downsample: true,
              max_points: maxPoints,
              aggregation: 'avg',
            })
            if (signal.aborted) return
            const built = fromSeries(payload, uuid)
            if (built.timestamps.length > 0) {
              setSeries(built)
              return
            }
          } catch (cause) {
            if (signal.aborted) return
            if (import.meta.env.DEV) console.warn('[ping] queryMetrics 失败', cause)
          }
        }

        // 降级：原始采样。RPC 不可用时走同名 REST 端点。
        const params: Record<string, unknown> = { uuid, hours }
        const payload =
          capabilities.pingRecords && rpc
            ? await rpc.call<unknown>(METHODS.pingRecords, params)
            : await request<unknown>(
                `/api/records/ping?uuid=${encodeURIComponent(uuid)}&hours=${hours}`,
                { signal },
              )
        if (signal.aborted) return
        const records = extractPingRecords(payload)
        setSeries(records.length > 0 ? fromRecords(records) : EMPTY)
      } catch {
        if (!signal.aborted) setSeries(EMPTY)
      } finally {
        if (!signal.aborted) setLoading(false)
      }
    },
    [uuid, taskKey, hours, maxPoints, enabled],
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  return useMemo(() => ({ series, loading }), [series, loading])
}
