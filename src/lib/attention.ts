/**
 * 「需要注意」判定：一个节点现在有哪些值得说出来的问题。
 *
 * 三处共用同一份结果，各写一份必然漂移：
 *   - 首页的「需要注意」板块（apple / vercel，受 showAttention 控制）
 *   - 卡片上的问题徽章
 *   - 详情页顶部的一句话状态
 *
 * 阈值从 lib/tone.ts 取，不在这里重新定义。
 *
 * 判定只用元数据与当前状态，不发请求、不看历史 —— 首页上 N 个节点每次轮询
 * 都要重算一遍，任何 I/O 都会被放大 N 倍。
 */

import { daysUntil, ratio, trafficUsed } from './format'
import { BAD_AT, WARN_AT } from './tone'
import type { NodeView } from './types'

/** 剩余天数低于这个值就点名。和卡片上到期日转色的 14 天不是一回事：那只是染色。 */
export const EXPIRY_ATTENTION_DAYS = 7

export type IssueLevel = 'bad' | 'warn'

export type IssueKind = 'offline' | 'cpu' | 'mem' | 'disk' | 'quota' | 'expired' | 'expiring'

export interface Issue {
  kind: IssueKind
  level: IssueLevel
  /**
   * i18n 插值参数。这一层不碰文案 —— lib/ 不许 import React，也不该知道
   * 当前语言；取词交给调用方的 `t()`。
   */
  values: Record<string, number>
  /**
   * 次要问题：只给卡片染色，不进「需要注意」板块、也不进卡片徽章。
   * 占用在 75~90 之间的就属于这一类，否则一台长期跑在 80% 的机器会天天上榜。
   */
  minor: boolean
}

/** 占用类指标 → 问题。超过 90 点名，75~90 记为次要。 */
function usageIssue(kind: 'cpu' | 'mem' | 'disk', percent: number | null): Issue | null {
  if (percent === null) return null
  if (percent >= BAD_AT) {
    return { kind, level: 'bad', values: { percent: Math.round(percent) }, minor: false }
  }
  if (percent >= WARN_AT) {
    return { kind, level: 'warn', values: { percent: Math.round(percent) }, minor: true }
  }
  return null
}

/**
 * 按严重程度排好的问题列表。
 *
 * 离线时直接返回，不再累加别的问题：采样已经停了，拿最后一次采样的 CPU 去
 * 报「占用过高」是在报一个过去的事实。到期与否同理 —— 一台离线的机器，
 * 「离线」就是唯一值得说的事。
 */
export function nodeIssues(node: NodeView): Issue[] {
  const { client, status } = node

  if (!status?.online) {
    return [{ kind: 'offline', level: 'bad', values: {}, minor: false }]
  }

  const out: Issue[] = []

  // 配额排在占用之前：流量跑超要花钱，比 CPU 高一会儿更要紧。
  if (client.traffic_limit > 0) {
    const used = trafficUsed(status, client.traffic_limit_type)
    // 这里不能用 ratio()：它会把结果夹到 100，而超额多少正是要说的事。
    const percent = (used / client.traffic_limit) * 100
    if (Number.isFinite(percent) && percent >= BAD_AT) {
      out.push({
        kind: 'quota',
        level: 'bad',
        values: { percent: Math.round(percent) },
        minor: false,
      })
    }
  }

  const memTotal = status.ram_total || client.mem_total
  const diskTotal = status.disk_total || client.disk_total
  const usage = [
    usageIssue('cpu', ratio(status.cpu, 100)),
    usageIssue('mem', ratio(status.ram, memTotal)),
    usageIssue('disk', ratio(status.disk, diskTotal)),
  ]
  for (const issue of usage) if (issue) out.push(issue)

  /*
   * 到期。daysUntil 已经吸收了 null 和长期（当前时间 + 100 年）两种情况，
   * 这里不要再出现年份字面量。
   */
  const left = daysUntil(client.expired_at)
  if (left !== null) {
    if (left < 0) {
      out.push({ kind: 'expired', level: 'bad', values: { days: -left }, minor: false })
    } else if (left <= EXPIRY_ATTENTION_DAYS) {
      out.push({ kind: 'expiring', level: 'warn', values: { days: left }, minor: false })
    }
  }

  return out
}

/** 进「需要注意」板块和卡片徽章的那些，次要问题被滤掉。 */
export function majorIssues(node: NodeView): Issue[] {
  return nodeIssues(node).filter((issue) => !issue.minor)
}

export type NodeLevel = 'offline' | 'bad' | 'warn' | 'ok'

/** 整个节点的档位。卡片边框、表格行、详情页状态条用它。 */
export function nodeLevel(node: NodeView): NodeLevel {
  if (!node.status?.online) return 'offline'
  const issues = majorIssues(node)
  if (issues.some((issue) => issue.level === 'bad')) return 'bad'
  return issues.length > 0 ? 'warn' : 'ok'
}

export interface AttentionEntry {
  node: NodeView
  level: Exclude<IssueLevel, never>
  issues: Issue[]
}

/**
 * 需要注意的节点，严重的排前面。
 *
 * 排序只按档位，不按名字或占用高低：同档位内保持传入顺序，也就是首页已经
 * 算好的置顶 + 权重顺序，免得同一台机器在列表里的位置随轮询上下跳。
 */
export function attentionList(nodes: readonly NodeView[]): AttentionEntry[] {
  const bad: AttentionEntry[] = []
  const warn: AttentionEntry[] = []
  for (const node of nodes) {
    const issues = majorIssues(node)
    if (issues.length === 0) continue
    const entry: AttentionEntry = {
      node,
      level: issues.some((issue) => issue.level === 'bad') ? 'bad' : 'warn',
      issues,
    }
    ;(entry.level === 'bad' ? bad : warn).push(entry)
  }
  return [...bad, ...warn]
}
