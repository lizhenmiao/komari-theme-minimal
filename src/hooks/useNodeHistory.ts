/**
 * 单个节点的历史序列，由服务端降采样。
 *
 * 两条路径的数据形状完全不同，这是这个文件里绝大部分复杂度的来源：
 *
 * - 主路径 `public:queryMetrics`：键名是带点的命名空间（`cpu.usage`、
 *   `memory.used`…），返回 `{ series: [{ metric_key, points: [...] }] }`。
 *   用量类指标给的是**字节**，百分比要自己按总量换算。
 * - 降级路径 `common:getRecords`：扁平的 `StatusRecord`，字段名是 `cpu`、
 *   `ram`、`ram_total` 这一套，且自带总量。
 *
 * 对外只暴露一种形状（见 `HistorySeries`），调用方不必关心走了哪条路。
 */

import { useCallback, useEffect, useMemo, useState } from 'react'

import { METHODS } from '../lib/capabilities'
import {
  AGGREGATION_BY_METRIC,
  METRIC_KEYS,
  extractSeries,
  pointsFor,
  toUnixSeconds,
} from '../lib/metrics'
import { groupRecords } from '../lib/normalize'
import { request } from '../lib/request'
import { getState } from '../lib/store'
import { getCapabilities, getRpcClient } from '../lib/transport'
import type { StatusRecord } from '../lib/types'

export type RangeKey = '1h' | '4h' | '24h' | '7d' | '30d'

export const RANGE_HOURS: Record<RangeKey, number> = {
  '1h': 1,
  '4h': 4,
  '24h': 24,
  '7d': 168,
  '30d': 720,
}

/** 对外的槽位名。和指标仓库的键名是两套命名，这里做映射。 */
const SLOTS = ['cpu', 'ram', 'swap', 'disk', 'load', 'net_in', 'net_out'] as const
export type MetricSlot = (typeof SLOTS)[number]

const SLOT_TO_METRIC: Record<MetricSlot, string> = {
  cpu: METRIC_KEYS.cpu,
  ram: METRIC_KEYS.memory,
  swap: METRIC_KEYS.swap,
  disk: METRIC_KEYS.disk,
  load: METRIC_KEYS.load,
  net_in: METRIC_KEYS.netIn,
  net_out: METRIC_KEYS.netOut,
}

/** 这几个槽位对外是百分比，而指标仓库给的是字节，需要按总量换算。 */
const PERCENT_SLOTS: Partial<Record<MetricSlot, 'ram' | 'swap' | 'disk'>> = {
  ram: 'ram',
  swap: 'swap',
  disk: 'disk',
}

export interface HistorySeries {
  /** Unix 秒，升序。 */
  timestamps: number[]
  /** 逐槽位，与 `timestamps` 对齐。null 表示缺口，画图时断开。 */
  values: Record<MetricSlot, (number | null)[]>
  /** 换算百分比用的总量。 */
  ramTotal: number
  swapTotal: number
  diskTotal: number
}

const emptyValues = (): Record<MetricSlot, (number | null)[]> => ({
  cpu: [],
  ram: [],
  swap: [],
  disk: [],
  load: [],
  net_in: [],
  net_out: [],
})

const EMPTY: HistorySeries = {
  timestamps: [],
  values: emptyValues(),
  ramTotal: 0,
  swapTotal: 0,
  diskTotal: 0,
}

/** 节点元数据里的总量，用于把字节换算成百分比。 */
function totalsFor(uuid: string): { ram: number; swap: number; disk: number } {
  const client = getState().clients.find((entry) => entry.uuid === uuid)
  return {
    ram: client?.mem_total ?? 0,
    swap: client?.swap_total ?? 0,
    disk: client?.disk_total ?? 0,
  }
}

/**
 * 把 `queryMetrics` 的多条序列对齐到一根共享时间轴。
 *
 * 各指标的采样时刻理论上一致（同一次降采样），但不能假设：某个指标可能整段
 * 缺失，或者少几个桶。所以先把所有时刻收成有序集合，再逐指标按时刻填值，
 * 填不上的位置留 null。
 */
function buildFromSeries(payload: unknown, uuid: string): HistorySeries {
  const series = extractSeries(payload)
  if (series.length === 0) return EMPTY

  const perSlot = new Map<MetricSlot, Map<number, number>>()
  const allTimes = new Set<number>()

  for (const slot of SLOTS) {
    const points = pointsFor(series, SLOT_TO_METRIC[slot], uuid)
    const bySecond = new Map<number, number>()
    for (const point of points) {
      const seconds = toUnixSeconds(point.time)
      if (seconds === null || !Number.isFinite(point.value)) continue
      bySecond.set(seconds, point.value)
      allTimes.add(seconds)
    }
    perSlot.set(slot, bySecond)
  }

  const timestamps = [...allTimes].sort((a, b) => a - b)
  if (timestamps.length === 0) return EMPTY

  const totals = totalsFor(uuid)
  const values = emptyValues()

  for (const slot of SLOTS) {
    const bySecond = perSlot.get(slot)
    const scale = PERCENT_SLOTS[slot]
    const total = scale ? totals[scale] : 0
    const column = values[slot]

    for (const time of timestamps) {
      const raw = bySecond?.get(time)
      if (raw === undefined) {
        column.push(null)
        continue
      }
      if (!scale) {
        column.push(raw)
        continue
      }
      // 总量为 0 说明这个节点没上报（比如没开 swap），留 null 而不是 0 ——
      // 0 会画成一条贴底的实线，看起来像"用量为零"，而事实是"没有数据"。
      column.push(total > 0 ? (raw / total) * 100 : null)
    }
  }

  return {
    timestamps,
    values,
    ramTotal: totals.ram,
    swapTotal: totals.swap,
    diskTotal: totals.disk,
  }
}

/** 降级路径：扁平的 StatusRecord，自带总量。 */
function buildFromRecords(records: StatusRecord[]): HistorySeries {
  const timestamps: number[] = []
  const values = emptyValues()

  const last = records[records.length - 1]
  const ramTotal = last?.ram_total ?? 0
  const swapTotal = last?.swap_total ?? 0
  const diskTotal = last?.disk_total ?? 0

  const percent = (used: number, total: number): number | null =>
    total > 0 ? (used / total) * 100 : null

  for (const record of records) {
    const seconds = toUnixSeconds(record.time)
    if (seconds === null) continue
    timestamps.push(seconds)

    values.cpu.push(Number.isFinite(record.cpu) ? record.cpu : null)
    values.load.push(Number.isFinite(record.load) ? record.load : null)
    values.net_in.push(Number.isFinite(record.net_in) ? record.net_in : null)
    values.net_out.push(Number.isFinite(record.net_out) ? record.net_out : null)
    // 每条记录用自己那条的总量，节点扩容后历史段落的百分比才不会被算错
    values.ram.push(percent(record.ram, record.ram_total))
    values.swap.push(percent(record.swap, record.swap_total))
    values.disk.push(percent(record.disk, record.disk_total))
  }

  if (timestamps.length === 0) return EMPTY
  return { timestamps, values, ramTotal, swapTotal, diskTotal }
}

export function useNodeHistory(
  uuid: string,
  range: RangeKey,
  maxPoints: number,
): { history: HistorySeries; loading: boolean; error: string | null } {
  const [history, setHistory] = useState<HistorySeries>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const hours = RANGE_HOURS[range]

  const load = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true)
      setError(null)

      const capabilities = getCapabilities()
      const rpc = getRpcClient()

      // 主路径：服务端聚合，逐指标算法。
      if (capabilities.queryMetrics && rpc) {
        try {
          const payload = await rpc.call<unknown>(METHODS.queryMetrics, {
            entity_ids: [uuid],
            metric_keys: SLOTS.map((slot) => SLOT_TO_METRIC[slot]),
            hours,
            downsample: true,
            max_points: maxPoints,
            aggregation: 'avg',
            aggregation_by_metric: AGGREGATION_BY_METRIC,
          })
          if (signal.aborted) return
          const built = buildFromSeries(payload, uuid)
          if (built.timestamps.length > 0) {
            setHistory(built)
            setLoading(false)
            return
          }
        } catch (cause) {
          if (signal.aborted) return
          if (import.meta.env.DEV) console.warn('[history] queryMetrics 失败', cause)
        }
      }

      // 降级：拿原始记录，前端抽稀。
      try {
        const records = await loadRecordsFallback(uuid, hours, signal)
        if (signal.aborted) return
        setHistory(buildFromRecords(thin(records, maxPoints)))
      } catch (cause) {
        if (signal.aborted) return
        setError(cause instanceof Error ? cause.message : String(cause))
        setHistory(EMPTY)
      } finally {
        if (!signal.aborted) setLoading(false)
      }
    },
    [uuid, hours, maxPoints],
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  return useMemo(() => ({ history, loading, error }), [history, loading, error])
}

async function loadRecordsFallback(
  uuid: string,
  hours: number,
  signal: AbortSignal,
): Promise<StatusRecord[]> {
  const capabilities = getCapabilities()
  const rpc = getRpcClient()

  if (capabilities.records && rpc) {
    const payload = await rpc.call<unknown>(METHODS.records, { uuid, hours })
    return groupRecords(payload, uuid)[uuid] ?? []
  }

  const payload = await request<unknown>(
    `/api/records/load?uuid=${encodeURIComponent(uuid)}&hours=${hours}`,
    { signal },
  )
  return groupRecords(payload, uuid)[uuid] ?? []
}

/**
 * 等步长抽稀，并保证最新那条一定保留。只在降级路径用；主路径由服务端降采样。
 */
function thin<T>(items: T[], limit: number): T[] {
  if (items.length <= limit) return items
  const step = items.length / limit
  const out: T[] = []
  for (let index = 0; index < limit; index += 1) {
    const item = items[Math.floor(index * step)]
    if (item !== undefined) out.push(item)
  }
  const last = items[items.length - 1]
  if (last !== undefined && out[out.length - 1] !== last) out.push(last)
  return out
}
