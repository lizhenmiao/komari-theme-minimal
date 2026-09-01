/**
 * 把另外两种非规范结构转成 `NodeStatus`。
 *
 * 源结构里没有的字段填 0 而不是留 undefined，这样组件做算术时不必对每次
 * 取值都做防御。真正可选的两个字段（`uptime`、`message`）保持可选，
 * 因为它们只存在于嵌套结构，UI 必须能够隐藏它们。
 */

import type { NestedStatus, NodeStatus, StatusRecord } from './types'

/**
 * 嵌套结构（WS `/api/clients`、`GET /api/recent/{uuid}`）-> NodeStatus。
 *
 * `online` 不在嵌套载荷里，它在同级的 `data.online` 数组中，所以要由
 * 调用方 join 回来后传进来。
 */
export function fromNested(uuid: string, nested: NestedStatus, online: boolean): NodeStatus {
  return {
    client: uuid,
    time: nested.updated_at,
    online,
    cpu: nested.cpu?.usage ?? 0,
    gpu: nested.gpu?.average_usage ?? 0,
    ram: nested.ram?.used ?? 0,
    ram_total: nested.ram?.total ?? 0,
    swap: nested.swap?.used ?? 0,
    swap_total: nested.swap?.total ?? 0,
    disk: nested.disk?.used ?? 0,
    disk_total: nested.disk?.total ?? 0,
    load: nested.load?.load1 ?? 0,
    load5: nested.load?.load5 ?? 0,
    load15: nested.load?.load15 ?? 0,
    temp: nested.temp ?? 0,
    net_in: nested.network?.down ?? 0,
    net_out: nested.network?.up ?? 0,
    net_total_up: nested.network?.totalUp ?? 0,
    net_total_down: nested.network?.totalDown ?? 0,
    process: nested.process ?? 0,
    connections: nested.connections?.tcp ?? 0,
    connections_udp: nested.connections?.udp ?? 0,
    uptime: nested.uptime,
    message: nested.message,
  }
}

/**
 * StatusRecord（`common:getRecords`）-> NodeStatus。
 *
 * 历史记录不含在线状态，所以 `online` 一律 false —— 过去某一刻的采样说明
 * 不了节点现在的死活。这个结构也没有 `load5` / `load15`，统一退化成
 * 单个 `load` 值。
 */
export function fromStatusRecord(record: StatusRecord): NodeStatus {
  return {
    ...record,
    online: false,
    load5: record.load,
    load15: record.load,
  }
}

/**
 * `common:getRecords` 有三种返回形状，全都要认：
 *
 *   1. `{ count, records: { [uuid]: StatusRecord[] }, from, to }`
 *      —— 真实实例的实际返回，即便指定了 uuid 也会包这层信封。
 *   2. `{ [uuid]: StatusRecord[] }`
 *   3. `StatusRecord[]`（配合 `fallbackUuid`）
 *
 * 漏掉第 1 种的后果是静默的：请求 200、没有异常，只是取不到任何一条记录，
 * 详情页的曲线永远空白。
 */
export function groupRecords(
  payload: unknown,
  fallbackUuid?: string,
): Record<string, StatusRecord[]> {
  if (Array.isArray(payload)) {
    if (!fallbackUuid) return {}
    return { [fallbackUuid]: payload as StatusRecord[] }
  }
  if (!payload || typeof payload !== 'object') return {}

  // 先剥掉信封。records 自身可能是数组，也可能已经是按 uuid 分组的 map。
  const inner = (payload as { records?: unknown }).records
  if (inner !== undefined) return groupRecords(inner, fallbackUuid)

  return payload as Record<string, StatusRecord[]>
}
