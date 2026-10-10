/**
 * 问题 → 文案。
 *
 * `lib/attention.ts` 只产出 kind + level + 插值参数，不碰文案（lib/ 不许
 * import React，也不该知道当前语言）。取词在这一层完成，三套皮肤共用，
 * 保证同一个问题在卡片徽章、「需要注意」列表、详情页状态条里说的是同一句话。
 */

import { formatUptime } from '../../lib/format'
import { BAD_AT, WARN_AT } from '../../lib/tone'
import type { Issue } from '../../lib/attention'
import type { NodeFacts } from './nodeFacts'

/**
 * 取词函数。
 *
 * 写成两条重载而不是 `(key, values?) => string`：项目开了
 * `exactOptionalPropertyTypes`，可选参数的类型会带上 `| undefined`，而
 * i18next 的 `TFunction` 不接受 `undefined` 作为 options，直接赋值通不过。
 */
export type Translate = {
  (key: string): string
  (key: string, values: Record<string, unknown>): string
}

/** 占用与配额类问题的 i18n key，按档位分。 */
const KEYS: Record<'cpu' | 'mem' | 'disk' | 'quota', { bad: string; warn: string }> = {
  cpu: { bad: 'attention.cpuBad', warn: 'attention.cpuWarn' },
  mem: { bad: 'attention.memBad', warn: 'attention.memWarn' },
  disk: { bad: 'attention.diskBad', warn: 'attention.diskWarn' },
  quota: { bad: 'attention.quotaFull', warn: 'attention.quotaNear' },
}

export interface UptimeUnitLabels {
  day: string
  hour: string
  minute: string
}

/** 从 i18n 取在线时长的单位词。三处都要用，别各写一遍。 */
export function uptimeUnits(t: Translate): UptimeUnitLabels {
  return { day: t('node.day'), hour: t('node.hour'), minute: t('node.minute') }
}

/**
 * 一条问题的文案。
 *
 * 离线要带上时长，而时长不在 Issue 里（lib 层不做本地化，也拿不到单位词），
 * 所以从 facts 取。算不出时长时只说「离线」，不编一个数字。
 */
export function issueText(
  t: Translate,
  issue: Issue,
  facts: NodeFacts,
  units: UptimeUnitLabels,
): string {
  if (issue.kind === 'offline') {
    if (facts.offlineFor === null) return t('node.offline')
    return t('attention.offline', { duration: formatUptime(facts.offlineFor, units) })
  }
  if (issue.kind === 'expired' || issue.kind === 'expiring') {
    return t(issue.kind === 'expired' ? 'attention.expired' : 'attention.expiring', issue.values)
  }
  // 配额可能超过 100%，百分比原样显示。
  return t(KEYS[issue.kind][issue.level], issue.values)
}

/** 到期那一类问题。已经在别处说过的话，页脚就别再说一遍。 */
export function isExpiryIssue(issue: Issue): boolean {
  return issue.kind === 'expired' || issue.kind === 'expiring'
}

export interface Verdict {
  level: NodeFacts['level']
  title: string
  /** 可能是空串。 */
  body: string
}

/** 详情页顶部的一句话状态。 */
export function verdict(
  t: Translate,
  facts: NodeFacts,
  units: UptimeUnitLabels,
  lastSeenText: string | null,
): Verdict {
  if (!facts.online) {
    const title =
      facts.offlineFor === null
        ? t('node.offline')
        : t('attention.offlineLong', { duration: formatUptime(facts.offlineFor, units) })
    return {
      level: 'offline',
      title,
      body: [
        lastSeenText ? t('attention.lastSeen', { time: lastSeenText }) : '',
        t('attention.chartsBreak'),
      ]
        .filter(Boolean)
        .join('，'),
    }
  }

  const major = facts.issues.filter((issue) => !issue.minor)
  if (major.length === 0) {
    return {
      level: 'ok',
      title: t('attention.healthy'),
      body: t('attention.healthyBody', { threshold: WARN_AT }),
    }
  }

  // bad 在前，同档位保持 lib/attention.ts 给的顺序（配额 → 占用 → 到期）。
  const sorted = [...major].sort((a, b) => {
    if (a.level === b.level) return 0
    return a.level === 'bad' ? -1 : 1
  })
  const [first, ...rest] = sorted
  return {
    level: first?.level === 'bad' ? 'bad' : 'warn',
    title: first ? issueText(t, first, facts, units) : '',
    body: rest.map((issue) => issueText(t, issue, facts, units)).join('，'),
  }
}

/** 图表下方的阈值说明。 */
export function thresholdNote(t: Translate): string {
  return t('skin.thresholdNote', { warn: WARN_AT, bad: BAD_AT })
}

/** 在线时长；离线时给破折号。formatUptime 已经吸收了 undefined。 */
export function uptimeText(facts: NodeFacts, units: UptimeUnitLabels): string {
  if (!facts.online) return '—'
  return formatUptime(facts.uptime, units)
}

/** 最后上报时刻，`MM-DD HH:mm`。拿不到就是 null。 */
export function lastSeenText(facts: NodeFacts): string | null {
  if (facts.lastSeen === null) return null
  const date = new Date(facts.lastSeen * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
