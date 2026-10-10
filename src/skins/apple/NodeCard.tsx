/**
 * Apple 皮肤的节点卡片。
 *
 * 三环表示 CPU / 内存 / 磁盘，旁边的图例给出百分比与「已用 / 总量」；
 * 其余读数走 iOS「设置」式的分组列表。信息量与经典卡片一致。
 *
 * `km-node-card` 是校验脚本数卡片数量的锚点，必须保留。
 */

import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import RegionFlag from '../../components/RegionFlag'
import Rings from '../shared/Rings'
import { valueClass } from '../shared/Meter'
import { nodeFacts } from '../shared/nodeFacts'
import { isExpiryIssue, issueText, uptimeText, uptimeUnits } from '../shared/text'
import { formatBytes, formatSpeed } from '../../lib/format'
import { tasksFor } from '../../lib/ping'
import type { NodeFacts } from '../shared/nodeFacts'
import type { NodeView, PingTask, ThemeSettings } from '../../lib/types'

interface CardProps {
  node: NodeView
  settings: ThemeSettings
  pingTasks: PingTask[]
  pingValues: Record<number, number | undefined>
}

/** 三环旁边的一行图例：色点、名称、小字、百分比。 */
function Legend({
  color,
  label,
  sub,
  percent,
  placeholder = '—',
}: {
  color: string
  label: string
  sub: string
  percent: number | null
  placeholder?: string
}) {
  return (
    <div className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-x-2.5">
      <i className="size-2.5 rounded-full" style={{ background: color }} aria-hidden="true" />
      <span className="min-w-0 leading-tight">
        <b className="block text-[14px] font-semibold">{label}</b>
        <span className="km-s-num block truncate text-[11px] text-km-dim">{sub}</span>
      </span>
      <b className={`km-s-num text-[22px] leading-none font-bold tracking-tight ${valueClass(percent)}`}>
        {percent === null ? (
          <span className="text-[15px] font-semibold text-km-faint">{placeholder}</span>
        ) : (
          <>
            {Math.round(percent)}
            <span className="text-[14px]">%</span>
          </>
        )}
      </b>
    </div>
  )
}

/** iOS 分组列表里的一行。 */
function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="flex items-baseline gap-3 border-t km-hair py-2.5 first:border-t-0">
      <span className="shrink-0 text-[13px] text-km-dim">{label}</span>
      <span className="km-s-num ml-auto truncate text-right text-[13px] font-semibold">
        {children}
      </span>
    </li>
  )
}

/** 环与图例共用的三项配色。 */
function ringItems(facts: NodeFacts) {
  return [
    { percent: facts.cpu, color: 'var(--color-km-cpu)' },
    { percent: facts.mem, color: 'var(--color-km-mem)' },
    { percent: facts.disk, color: 'var(--color-km-disk)' },
  ]
}

function AppleNodeCardInner({ node, settings, pingTasks, pingValues }: CardProps) {
  const { t } = useTranslation()
  const { client } = node
  const facts = nodeFacts(node)
  const units = uptimeUnits(t)

  // 运营者可以只给部分节点配探测，不过滤的话没配的节点会显示一排空药丸。
  const myTasks = useMemo(() => tasksFor(pingTasks, client.uuid), [pingTasks, client.uuid])

  const major = facts.issues.filter((issue) => !issue.minor)
  const first = major[0]
  const rings = ringItems(facts)
  // 离线时各项读数都是上一次采样的残值，整块压暗，但布局不动，网格不会重排。
  const dim = facts.online ? '' : 'opacity-40'

  return (
    <Link
      to={`/instance/${client.uuid}`}
      className="km-node-card km-s-card block p-5"
      // 卡片是整块可点的入口，锚点类名保留在最外层。
    >
      <div className="flex items-center gap-2.5">
        <RegionFlag region={client.region} />
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[17px] leading-tight font-semibold tracking-tight">
            {client.name}
          </b>
          <span className="block truncate text-[12px] text-km-dim">
            {client.os}，{facts.cores} {t('metric.cores')}，
            {facts.online ? uptimeText(facts, units) : t('node.offline')}
          </span>
        </span>
        {!facts.online ? (
          <span className="km-s-badge km-s-badge-mute">{t('node.offline')}</span>
        ) : first ? (
          <span className={`km-s-badge km-s-badge-${first.level === 'bad' ? 'bad' : 'warn'}`}>
            {issueText(t, first, facts, units)}
          </span>
        ) : (
          <span className="km-s-badge km-s-badge-ok">{t('nav.online')}</span>
        )}
      </div>

      <div className={`mt-4 mb-4 flex items-center gap-5 ${dim}`}>
        <Rings items={rings} />
        <div className="grid min-w-0 flex-1 gap-3">
          <Legend
            color={rings[0]?.color ?? ''}
            label={t('metric.cpu')}
            sub={`${facts.coresUsed === null ? '—' : facts.coresUsed.toFixed(1)}C / ${facts.cores}C`}
            percent={facts.cpu}
          />
          <Legend
            color={rings[1]?.color ?? ''}
            label={t('metric.memory')}
            sub={`${formatBytes(facts.memUsed, true)} / ${formatBytes(facts.memTotal, true)}`}
            percent={facts.mem}
          />
          {settings.showDisk && (
            <Legend
              color={rings[2]?.color ?? ''}
              label={t('metric.disk')}
              sub={`${formatBytes(facts.diskUsed, true)} / ${formatBytes(facts.diskTotal, true)}`}
              percent={facts.disk}
            />
          )}
        </div>
      </div>

      <ul className={`km-a-list rounded-[14px] px-4 ${dim}`}>
        <Item label={t('skin.netSpeed')}>
          {facts.online ? (
            <>
              &darr; {formatSpeed(facts.netIn)}
              <span className="mx-1.5 font-normal text-km-faint">·</span>
              &uarr; {formatSpeed(facts.netOut)}
            </>
          ) : (
            '—'
          )}
        </Item>
        {settings.showPing && (
          <Item label={t('metric.latency')}>
            {myTasks.length === 0 ? (
              <span className="font-normal text-km-faint">{t('skin.noPingTask')}</span>
            ) : !facts.online ? (
              '—'
            ) : (
              <span className="inline-flex gap-2.5">
                {myTasks.map((task) => {
                  const value = pingValues[task.id]
                  const lost = value !== undefined && value < 0
                  return (
                    <span key={task.id}>
                      <span className="mr-1 text-[12px] font-normal text-km-dim">{task.name}</span>
                      {/* 负值是丢包的哨兵，绝不能当成毫秒显示出来。 */}
                      <span className={lost ? 'km-s-text-bad' : ''}>
                        {value === undefined ? '—' : lost ? t('metric.timeout') : Math.round(value)}
                      </span>
                    </span>
                  )
                })}
              </span>
            )}
          </Item>
        )}
        <Item label={t('skin.totalTraffic')}>
          &darr; {formatBytes(facts.totalDown, true)}
          <span className="mx-1.5 font-normal text-km-faint">·</span>
          &uarr; {formatBytes(facts.totalUp, true)}
        </Item>
        {settings.showTraffic && facts.quota !== null && (
          <Item label={t('metric.trafficLimit')}>
            <span className="mr-2 text-[12px] font-normal text-km-dim">
              {formatBytes(facts.quotaUsed, true)} / {formatBytes(facts.quotaLimit, true)}
            </span>
            <span className={valueClass(facts.quota)}>{Math.round(facts.quota)}%</span>
          </Item>
        )}
        {facts.swapEnabled && (
          <Item label={t('metric.swap')}>
            {facts.swap === null ? (
              '—'
            ) : (
              <>
                <span className="mr-2 text-[12px] font-normal text-km-dim">
                  {formatBytes(facts.swapUsed, true)} / {formatBytes(facts.swapTotal, true)}
                </span>
                <span className={valueClass(facts.swap)}>{Math.round(facts.swap)}%</span>
              </>
            )}
          </Item>
        )}
        {settings.showLoad && (
          <Item label={`${t('metric.load')} ${t('skin.loadTriple')}`}>
            {facts.load ? facts.load.map((value) => value.toFixed(2)).join('　') : '—'}
          </Item>
        )}
        {/* 到期已经在上面的徽章里说过了，就别在这儿重复一遍。 */}
        {settings.showExpiry && !major.some(isExpiryIssue) && (
          <Item label={t('node.expires')}>
            {facts.expiryDate ? (
              <>
                <span className="mr-2 text-[12px] font-normal text-km-dim">
                  {facts.expiryDate}
                </span>
                {facts.daysLeft !== null && t('node.remaining', { days: facts.daysLeft })}
              </>
            ) : (
              <span className="font-normal text-km-faint">
                {facts.longTerm ? t('node.longTerm') : t('node.never')}
              </span>
            )}
          </Item>
        )}
      </ul>
    </Link>
  )
}

export default memo(AppleNodeCardInner)
