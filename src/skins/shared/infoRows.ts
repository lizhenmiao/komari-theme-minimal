/**
 * 详情页的信息分组：硬件、系统、账单、流量、延迟、运行。
 *
 * 只产出「标签 + 值」的数据，不产出 JSX —— 两套新皮肤的列表长相不同
 * （vercel 是细线键值行，apple 是 iOS 分组列表），但内容必须一字不差。
 */

import { formatBytes, formatCores, formatGpu, formatPrice, formatSpeed } from '../../lib/format'
import { uptimeText } from './text'
import type { Translate, UptimeUnitLabels } from './text'
import type { NodeFacts } from './nodeFacts'
import type { Client, PingTask, ThemeSettings } from '../../lib/types'


export interface InfoItem {
  label: string
  value: string
  /** 值下方的小字，例如「354 GB / 2.00 TB」。 */
  sub?: string
  /** 值的档位，决定文字颜色。 */
  level?: 'warn' | 'bad'
  /** 色点，延迟分组里标出对应曲线的颜色。 */
  dot?: string
}

export interface InfoGroup {
  key: string
  title: string
  items: InfoItem[]
  /** 整组为空时的提示语，例如没有配置探测任务。 */
  emptyHint?: string
}

interface BuildArgs {
  t: Translate
  client: Client
  facts: NodeFacts
  settings: ThemeSettings
  units: UptimeUnitLabels
  /** 探测任务与最新延迟。键是任务 ID。 */
  pingTasks: PingTask[]
  pingValues: Record<number, number | undefined>
  /** 各条延迟曲线的颜色，和图表里的顺序一致。 */
  pingColors: string[]
  lastSeen: string | null
}

export function buildInfoGroups({
  t,
  client,
  facts,
  settings,
  units,
  pingTasks,
  pingValues,
  pingColors,
  lastSeen,
}: BuildArgs): InfoGroup[] {
  const groups: InfoGroup[] = []

  // ---------- 流量 ----------
  const traffic: InfoItem[] = [
    { label: `${t('metric.download')}`, value: formatBytes(facts.totalDown) },
    { label: `${t('metric.upload')}`, value: formatBytes(facts.totalUp) },
  ]
  if (facts.quota === null) {
    traffic.push({ label: t('metric.trafficLimit'), value: t('metric.unlimited') })
  } else {
    const over = facts.quotaUsed - facts.quotaLimit
    traffic.push({
      label: t('metric.trafficLimit'),
      value: `${Math.round(facts.quota)}%`,
      sub: [
        `${formatBytes(facts.quotaUsed)} / ${formatBytes(facts.quotaLimit)}`,
        over > 0 ? t('skin.quotaOver', { amount: formatBytes(over) }) : '',
      ]
        .filter(Boolean)
        .join('，'),
      ...(facts.quota >= 90 ? { level: 'bad' as const } : {}),
    })
  }
  groups.push({ key: 'traffic', title: t('metric.totalTraffic'), items: traffic })

  // ---------- 延迟 ----------
  if (settings.showPing) {
    const items: InfoItem[] = pingTasks.map((task, index) => {
      const value = pingValues[task.id]
      const lost = value !== undefined && value < 0
      return {
        label: task.name,
        value:
          !facts.online || value === undefined
            ? '—'
            : lost
              ? t('metric.timeout')
              : `${Math.round(value)} ms`,
        ...(lost ? { level: 'bad' as const } : {}),
        ...(pingColors[index] ? { dot: pingColors[index] } : {}),
      }
    })
    groups.push({
      key: 'ping',
      title: t('metric.latency'),
      items,
      ...(items.length === 0 ? { emptyHint: t('skin.noPingTaskHint') } : {}),
    })
  }

  // ---------- 运行 ----------
  groups.push({
    key: 'runtime',
    title: t('detail.runtime'),
    items: [
      { label: t('node.uptime'), value: uptimeText(facts, units) },
      { label: t('node.processes'), value: facts.online ? String(facts.processes) : '—' },
      { label: t('node.connections'), value: facts.online ? String(facts.connections) : '—' },
      {
        label: t('skin.lastSeen'),
        value: facts.online ? t('skin.justNow') : (lastSeen ?? '—'),
        ...(facts.online ? {} : { level: 'bad' as const }),
      },
    ],
  })

  // ---------- 账单 ----------
  const billing: InfoItem[] = []
  // 价格对任何访客都是公开的，所以默认不显示，由运营者主动开启。
  const price = formatPrice(client)
  if (settings.showPrice && price) billing.push({ label: t('node.price'), value: price })
  if (client.billing_cycle > 0) {
    billing.push({ label: t('node.billingCycle'), value: `${client.billing_cycle}d` })
  }
  billing.push({
    label: t('node.expires'),
    value: facts.expiryDate ?? (facts.longTerm ? t('node.longTerm') : t('node.never')),
    ...(facts.daysLeft !== null
      ? {
          sub:
            facts.daysLeft < 0
              ? t('node.expired', { days: -facts.daysLeft })
              : t('node.remaining', { days: facts.daysLeft }),
          ...(facts.daysLeft < 0
            ? { level: 'bad' as const }
            : facts.daysLeft <= 7
              ? { level: 'warn' as const }
              : {}),
        }
      : {}),
  })
  groups.push({ key: 'billing', title: t('detail.billing'), items: billing })

  // ---------- 硬件 ----------
  groups.push({
    key: 'hardware',
    title: t('detail.hardware'),
    items: [
      { label: t('node.cpuModel'), value: client.cpu_name || '—' },
      { label: t('metric.cores'), value: formatCores(client) },
      { label: t('metric.memory'), value: formatBytes(facts.memTotal) },
      {
        label: t('metric.swap'),
        value: facts.swapEnabled ? formatBytes(facts.swapTotal) : t('metric.swapOff'),
      },
      { label: t('metric.disk'), value: formatBytes(facts.diskTotal) },
      { label: t('node.gpu'), value: formatGpu(client.gpu_name) ?? t('node.none') },
    ],
  })

  // ---------- 系统 ----------
  groups.push({
    key: 'system',
    title: t('detail.system'),
    items: [
      { label: 'OS', value: client.os || '—' },
      { label: t('node.arch'), value: client.arch || '—' },
      { label: t('node.virtualization'), value: client.virtualization || '—' },
      { label: t('node.kernel'), value: client.kernel_version || '—' },
      { label: t('node.region'), value: client.region || '—' },
    ],
  })

  return groups
}

/** 当前网速那一对读数，详情页顶部用。 */
export function speedPair(facts: NodeFacts): { up: string; down: string } {
  return {
    down: facts.online ? formatSpeed(facts.netIn) : '—',
    up: facts.online ? formatSpeed(facts.netOut) : '—',
  }
}
