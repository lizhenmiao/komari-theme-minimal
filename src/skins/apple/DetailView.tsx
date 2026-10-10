/**
 * Apple 皮肤的详情页。
 *
 * 结构：大标题抬头 → 通知式状态横幅 → 大三环 + 小组件 → 历史图 → 底部三列
 * iOS 分组列表。信息项与经典皮肤完全一致（见 shared/infoRows.ts）。
 */

import { useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'

import Header from './Header'
import RegionFlag from '../../components/RegionFlag'
import ChartGrid from '../shared/ChartGrid'
import Rings from '../shared/Rings'
import { valueClass } from '../shared/Meter'
import { buildInfoGroups } from '../shared/infoRows'
import { nodeFacts } from '../shared/nodeFacts'
import { lastSeenText, uptimeText, uptimeUnits, verdict } from '../shared/text'
import { formatBytes, formatSpeed } from '../../lib/format'
import { getState, subscribe } from '../../lib/store'
import { tasksFor } from '../../lib/ping'
import { metricColor } from '../../lib/tokens'
import type { DetailModel } from '../model'

/** 小组件：标签 + 大数字 + 可选的条与小字。 */
function Widget({
  label,
  value,
  sub,
  percent,
  tone,
}: {
  label: string
  value: React.ReactNode
  sub?: string | undefined
  percent?: number | null | undefined
  tone?: string | undefined
}) {
  return (
    <div className="km-s-card p-5">
      <p className="text-[13px] font-semibold text-km-dim">{label}</p>
      <p
        className={`km-s-num mt-2 text-[28px] leading-[1.15] font-bold tracking-[-0.03em] ${tone ?? ''}`}
      >
        {value}
      </p>
      {percent !== undefined && percent !== null && (
        <span className="km-s-track mt-2.5 block h-2">
          <span
            className={`km-s-fill block ${
              valueClass(percent) === 'km-s-text-bad'
                ? 'km-s-fill-bad'
                : valueClass(percent) === 'km-s-text-warn'
                  ? 'km-s-fill-warn'
                  : 'bg-km-disk'
            }`}
            style={{ width: `${Math.min(percent, 100).toFixed(1)}%` }}
          />
        </span>
      )}
      {sub && <p className="km-s-num mt-2 text-[13px] text-km-dim">{sub}</p>}
    </div>
  )
}

export default function AppleDetailView(model: DetailModel) {
  const { t } = useTranslation()
  const {
    node,
    sitename,
    authEntry,
    settings,
    range,
    ranges,
    onRangeChange,
    history,
    historyLoading,
    charts,
    chartChrome,
  } = model

  // 两个快照参数用同一个读取函数，原因见 hooks/useNodes.ts 的说明。
  const readPingTasks = () => getState().pingTasks
  const readPingLatest = () => getState().pingLatest
  const allPingTasks = useSyncExternalStore(subscribe, readPingTasks, readPingTasks)
  const pingLatest = useSyncExternalStore(subscribe, readPingLatest, readPingLatest)

  if (!node) {
    return (
      <>
        <Header sitename={sitename} authEntry={authEntry} />
        <main className="km-main km-page-instance mx-auto max-w-[1340px] px-5 py-16 lg:px-7">
          <p className="text-center text-sm text-km-faint">{t('state.loading')}</p>
        </main>
      </>
    )
  }

  const { client } = node
  const facts = nodeFacts(node)
  const units = uptimeUnits(t)
  const seen = lastSeenText(facts)
  const status = verdict(t, facts, units, seen)

  const myTasks = tasksFor(allPingTasks, client.uuid)
  const pingValues: Record<number, number | undefined> = {}
  for (const task of myTasks) {
    pingValues[task.id] = pingLatest[`${client.uuid}:${task.id}`]
  }
  // 和图表里的配色顺序保持一致，色点才对得上曲线。
  const pingColors = [metricColor('cpu'), metricColor('mem'), metricColor('swap')]

  const groups = buildInfoGroups({
    t,
    client,
    facts,
    settings,
    units,
    pingTasks: myTasks,
    pingValues,
    pingColors,
    lastSeen: seen,
  })

  const rings = [
    { percent: facts.cpu, color: 'var(--color-km-cpu)' },
    { percent: facts.mem, color: 'var(--color-km-mem)' },
    { percent: facts.disk, color: 'var(--color-km-disk)' },
  ]
  const legend: { label: string; sub: string; percent: number | null; color: string }[] = [
    {
      label: t('metric.cpu'),
      sub: `${facts.cores} ${t('metric.cores')}，${client.cpu_name || '—'}`,
      percent: facts.cpu,
      color: rings[0]?.color ?? '',
    },
    {
      label: t('metric.memory'),
      sub: `${formatBytes(facts.memUsed, true)} / ${formatBytes(facts.memTotal, true)}`,
      percent: facts.mem,
      color: rings[1]?.color ?? '',
    },
    {
      label: t('metric.disk'),
      sub: `${formatBytes(facts.diskUsed, true)} / ${formatBytes(facts.diskTotal, true)}`,
      percent: facts.disk,
      color: rings[2]?.color ?? '',
    },
  ]

  return (
    <>
      {/* 返回键在顶栏（iOS 习惯），正文直接是节点大标题。 */}
      <Header sitename={sitename} authEntry={authEntry} nodeName={client.name} />

      <main className="km-main km-page-instance mx-auto max-w-[1340px] px-5 pt-7 pb-2 lg:px-7">
        <div className="mb-5 flex flex-wrap items-center gap-4">
          <RegionFlag region={client.region} />
          <div className="min-w-0">
            <h1 className="text-[34px] leading-[1.1] font-bold tracking-[-0.02em]">
              {client.name}
            </h1>
            <p className="mt-1 text-[16px] text-km-dim">
              {client.os}，{client.arch || '—'}，
              {facts.online
                ? `${t('node.uptime')} ${uptimeText(facts, units)}`
                : t('node.offline')}
            </p>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            {facts.tags.map((tag) => (
              <span key={tag} className="km-s-badge km-s-badge-mute">
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* 通知式状态横幅。出问题时左侧竖条换色。 */}
        <div
          className={`km-instance-verdict km-s-card mb-5 flex items-center gap-4 px-5 py-4 ${
            status.level === 'ok' ? '' : 'km-s-verdict-alert'
          }`}
          data-level={status.level}
          role="status"
        >
          <span
            className={`grid size-9 shrink-0 place-items-center rounded-full text-[17px]
              font-bold text-white ${
                status.level === 'ok'
                  ? 'bg-km-good'
                  : status.level === 'warn'
                    ? 'bg-km-warn'
                    : 'bg-km-bad'
              }`}
            aria-hidden="true"
          >
            {status.level === 'ok' ? '✓' : '!'}
          </span>
          <span className="min-w-0">
            <b className="block text-[17px] font-semibold">{status.title}</b>
            {status.body && <span className="text-[14px] text-km-dim">{status.body}</span>}
          </span>
        </div>

        <section className="km-instance-current mb-6 grid gap-5 lg:grid-cols-3">
          <div className="km-s-card p-5 lg:row-span-2">
            <p className="text-[13px] font-semibold text-km-dim">{t('skin.resources')}</p>
            <div className="mt-3 flex items-center gap-6">
              <Rings items={rings} size={168} stroke={15} gap={4} />
              <div className="grid min-w-0 flex-1 gap-4">
                {legend.map((entry) => (
                  <div
                    key={entry.label}
                    className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-x-2.5"
                  >
                    <i
                      className="size-2.5 rounded-full"
                      style={{ background: entry.color }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 leading-tight">
                      <b className="block text-[15px] font-semibold">{entry.label}</b>
                      <span className="km-s-num block truncate text-[12px] text-km-dim">
                        {entry.sub}
                      </span>
                    </span>
                    <b
                      className={`km-s-num text-[26px] leading-none font-bold tracking-tight ${valueClass(
                        entry.percent,
                      )}`}
                    >
                      {entry.percent === null ? (
                        <span className="text-[17px] text-km-faint">—</span>
                      ) : (
                        <>
                          {Math.round(entry.percent)}
                          <span className="text-[15px]">%</span>
                        </>
                      )}
                    </b>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <Widget
            label={t('metric.liveSpeed')}
            value={
              <>
                <span className="mr-1.5 font-medium text-km-dim">&darr;</span>
                {facts.online ? formatSpeed(facts.netIn) : '—'}
              </>
            }
            sub={facts.online ? `↑ ${formatSpeed(facts.netOut)}` : undefined}
          />
          <Widget
            label={t('metric.load')}
            value={facts.load ? facts.load[0].toFixed(2) : '—'}
            tone={facts.load && facts.load[0] >= facts.cores ? 'km-s-text-warn' : ''}
            sub={
              facts.load
                ? `5m ${facts.load[1].toFixed(2)}　15m ${facts.load[2].toFixed(2)}　${facts.cores} ${t('metric.cores')}`
                : undefined
            }
          />
          <Widget
            label={t('metric.swap')}
            value={
              facts.swapEnabled ? (
                facts.swap === null ? (
                  '—'
                ) : (
                  <>
                    {Math.round(facts.swap)}
                    <span className="text-[15px]">%</span>
                  </>
                )
              ) : (
                <span className="text-[20px] text-km-faint">{t('metric.swapOff')}</span>
              )
            }
            tone={facts.swapEnabled ? valueClass(facts.swap) : ''}
            percent={facts.swapEnabled ? facts.swap : undefined}
            sub={
              facts.swapEnabled
                ? `${formatBytes(facts.swapUsed, true)} / ${formatBytes(facts.swapTotal, true)}`
                : t('skin.swapOffHint')
            }
          />
          <Widget
            label={t('metric.trafficLimit')}
            value={
              facts.quota === null ? (
                <span className="text-[20px] text-km-faint">{t('metric.unlimited')}</span>
              ) : (
                <>
                  {Math.round(facts.quota)}
                  <span className="text-[15px]">%</span>
                </>
              )
            }
            tone={valueClass(facts.quota)}
            percent={facts.quota}
            sub={
              facts.quota === null
                ? `↓ ${formatBytes(facts.totalDown, true)}　↑ ${formatBytes(facts.totalUp, true)}`
                : `${formatBytes(facts.quotaUsed, true)} / ${formatBytes(facts.quotaLimit, true)}`
            }
          />
        </section>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-[26px] font-bold tracking-[-0.02em]">{t('skin.history')}</h2>
          <div className="km-index-groups flex flex-wrap gap-2">
            {ranges.map((key) => (
              <button
                key={key}
                type="button"
                className="km-s-chip"
                aria-pressed={range === key}
                onClick={() => onRangeChange(key)}
              >
                {t(`range.${key}`)}
              </button>
            ))}
          </div>
        </div>
        <ChartGrid
          charts={charts}
          chrome={chartChrome}
          loading={historyLoading && history.timestamps.length === 0}
          noData={!historyLoading && history.timestamps.length === 0}
        />

        <h2 className="mt-9 mb-4 text-[26px] font-bold tracking-[-0.02em]">{t('skin.info')}</h2>
        <section className="km-instance-info grid items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => (
            <section key={group.key}>
              <h3 className="mb-2 ml-4 text-[13px] font-medium text-km-dim">{group.title}</h3>
              {group.items.length === 0 ? (
                <p className="km-s-card px-4 py-3.5 text-[14px] text-km-dim">{group.emptyHint}</p>
              ) : (
                <ul className="km-s-card px-4">
                  {group.items.map((item) => (
                    <li
                      key={item.label}
                      className="flex items-baseline gap-3 border-t km-hair py-3
                        first:border-t-0"
                    >
                      <span className="flex shrink-0 items-center gap-2 text-[15px]">
                        {item.dot && (
                          <i
                            className="inline-block size-2 rounded-full"
                            style={{ background: item.dot }}
                            aria-hidden="true"
                          />
                        )}
                        {item.label}
                      </span>
                      <span
                        className={`km-s-num ml-auto min-w-0 text-right text-[15px] break-words ${
                          item.level === 'bad'
                            ? 'km-s-text-bad'
                            : item.level === 'warn'
                              ? 'km-s-text-warn'
                              : 'text-km-dim'
                        }`}
                      >
                        {item.value}
                        {item.sub && (
                          <span className="block text-[12px] text-km-faint">{item.sub}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </section>
      </main>
    </>
  )
}
