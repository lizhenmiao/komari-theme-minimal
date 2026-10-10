/**
 * 新皮肤共用的汇总条：在线数、实时网速、累计流量、平均 CPU。
 *
 * 和经典皮肤的四格汇总条内容相近但不相同：这里把「平均负载」换成「平均
 * CPU」—— 负载的量纲跟着核数走，不同机型混在一起求平均没有意义；而两套新
 * 皮肤的卡片上已经逐台显示负载了。
 */

import { useTranslation } from 'react-i18next'

import { SkeletonValue } from '../../components/Skeleton'
import { formatBytes, formatSpeed } from '../../lib/format'
import { valueClass } from './Meter'
import type { NodeView } from '../../lib/types'
import type { NodeTotals } from '../../hooks/useNodes'

interface SummaryProps {
  totals: NodeTotals
  nodes: NodeView[]
  firstLoad: boolean
}

/** 在线节点的 CPU 平均值。没有在线节点时返回 null。 */
function averageCpu(nodes: NodeView[]): number | null {
  let sum = 0
  let count = 0
  for (const node of nodes) {
    const status = node.status
    if (!status?.online) continue
    if (!Number.isFinite(status.cpu)) continue
    sum += status.cpu
    count += 1
  }
  return count === 0 ? null : sum / count
}

function Cell({
  label,
  children,
  firstLoad,
}: {
  label: string
  children: React.ReactNode
  firstLoad: boolean
}) {
  return (
    <div className="px-5 py-4">
      <p className="text-[12px] text-km-dim">{label}</p>
      {firstLoad ? (
        <SkeletonValue />
      ) : (
        <p className="km-s-num mt-1.5 text-[22px] leading-tight font-semibold tracking-tight">
          {children}
        </p>
      )}
    </div>
  )
}

export default function Summary({ totals, nodes, firstLoad }: SummaryProps) {
  const { t } = useTranslation()
  const cpu = averageCpu(nodes)

  return (
    <section
      className="km-index-summary km-s-card mb-4 grid grid-cols-2 overflow-hidden
        md:grid-cols-4 md:divide-x divide-y md:divide-y-0 divide-km-hair"
      aria-label={t('skin.overview')}
    >
      <Cell label={t('nav.online')} firstLoad={firstLoad}>
        {totals.online}
        <span className="text-[15px] font-medium text-km-faint"> / {totals.total}</span>
      </Cell>
      <Cell label={t('summary.speed')} firstLoad={firstLoad}>
        <span className="text-[17px]">&darr;</span> {formatSpeed(totals.netIn)}
        <span className="ml-2 block text-[13px] font-medium text-km-dim">
          &uarr; {formatSpeed(totals.netOut)}
        </span>
      </Cell>
      <Cell label={t('summary.traffic')} firstLoad={firstLoad}>
        <span className="text-[17px]">&darr;</span> {formatBytes(totals.trafficDown)}
        <span className="ml-2 block text-[13px] font-medium text-km-dim">
          &uarr; {formatBytes(totals.trafficUp)}
        </span>
      </Cell>
      <Cell label={t('skin.avgCpu')} firstLoad={firstLoad}>
        {cpu === null ? (
          '—'
        ) : (
          <span className={valueClass(cpu)}>
            {Math.round(cpu)}
            <span className="text-[15px]">%</span>
          </span>
        )}
      </Cell>
    </section>
  )
}
