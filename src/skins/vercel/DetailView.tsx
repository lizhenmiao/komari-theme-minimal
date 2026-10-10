/**
 * Vercel 皮肤的详情页。
 *
 * 结构：抬头 → 一句话状态 → 当前值六格 → 历史图 + 右侧信息栏。
 * 信息项与经典皮肤完全一致（见 shared/infoRows.ts），差别在排版。
 */

import { useTranslation } from 'react-i18next'

import OsIcon from '../../components/OsIcon'
import RegionFlag from '../../components/RegionFlag'
import StatusDot from '../../components/StatusDot'
import ChartGrid from '../shared/ChartGrid'
import Header from './Header'
import { valueClass, levelOf } from '../shared/Meter'
import { buildInfoGroups } from '../shared/infoRows'
import { nodeFacts } from '../shared/nodeFacts'
import { lastSeenText, uptimeText, uptimeUnits, verdict } from '../shared/text'
import { formatBytes, formatCores, formatSpeed } from '../../lib/format'
import { metricColor } from '../../lib/tokens'
import { useSyncExternalStore } from 'react'
import { getState, subscribe } from '../../lib/store'
import { tasksFor } from '../../lib/ping'
import type { DetailModel } from '../model'

/** 当前值一格：标签、大数字、细条、下方小字。 */
function Instant({
  label,
  percent,
  detail,
  placeholder = '—',
}: {
  label: string
  percent: number | null
  detail: string
  placeholder?: string
}) {
  const level = levelOf(percent)
  return (
    <div className="min-w-0 px-4 py-3.5">
      <p className="text-[12px] text-km-dim">{label}</p>
      <p
        className={`km-s-num mt-1 mb-2 text-[26px] leading-none font-semibold tracking-tight ${valueClass(
          percent,
        )}`}
      >
        {percent === null ? (
          <span className="text-[17px] text-km-faint">{placeholder}</span>
        ) : (
          <>
            {Math.round(percent)}
            <span className="ml-0.5 text-[15px]">%</span>
          </>
        )}
      </p>
      <span className="km-s-track block h-[4px]">
        {percent !== null && (
          <span
            className={`km-s-fill km-s-fill-${level} block`}
            style={{ width: `${Math.min(percent, 100).toFixed(1)}%` }}
          />
        )}
      </span>
      <p className="km-s-num mt-2 truncate text-[12px] text-km-faint">{detail}</p>
    </div>
  )
}

export default function VercelDetailView(model: DetailModel) {
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
        <main className="km-main km-page-instance mx-auto max-w-[1400px] px-4 py-16 lg:px-6">
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

  return (
    <>
      {/* 返回靠顶栏的面包屑（站点名回链首页），正文不再另设返回键。 */}
      <Header sitename={sitename} authEntry={authEntry} nodeName={client.name} />

      <main className="km-main km-page-instance mx-auto max-w-[1400px] px-4 pt-6 pb-2 lg:px-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <RegionFlag region={client.region} />
          <OsIcon os={client.os} />
          <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em]">
            {client.name}
          </h1>
          <span className="km-s-badge km-s-badge-mute gap-1.5">
            <StatusDot online={facts.online} />
            {facts.online ? uptimeText(facts, units) : t('node.offline')}
          </span>
          {facts.tags.map((tag) => (
            <span key={tag} className="km-s-tag">
              {tag}
            </span>
          ))}
          <span className="km-s-num ml-auto hidden text-[12px] text-km-faint sm:inline">
            {formatCores(client)} · {formatBytes(facts.memTotal)} · {formatBytes(facts.diskTotal)} ·{' '}
            {client.os}
          </span>
        </div>

        {/* 一句话状态。出问题时整条换底色，正常时保持中性。 */}
        <p
          className={`km-instance-verdict km-s-card mb-4 flex gap-2.5 px-4 py-3 text-[14px] ${
            status.level === 'ok' ? '' : 'km-s-verdict-alert'
          }`}
          data-level={status.level}
          role="status"
        >
          <b className="font-semibold">{status.title}。</b>
          {status.body && <span className="text-km-dim">{status.body}</span>}
        </p>

        <section
          className="km-instance-current km-s-card mb-5 grid grid-cols-2 overflow-hidden
            sm:grid-cols-3 xl:grid-cols-6 divide-km-hair divide-y sm:divide-y-0 sm:divide-x"
        >
          <Instant
            label={t('metric.cpu')}
            percent={facts.cpu}
            detail={`${facts.coresUsed === null ? '—' : facts.coresUsed.toFixed(1)}C / ${facts.cores}C`}
          />
          <Instant
            label={t('metric.memory')}
            percent={facts.mem}
            detail={`${formatBytes(facts.memUsed, true)} / ${formatBytes(facts.memTotal, true)}`}
          />
          <Instant
            label={t('metric.disk')}
            percent={facts.disk}
            detail={`${formatBytes(facts.diskUsed, true)} / ${formatBytes(facts.diskTotal, true)}`}
          />
          <Instant
            label={t('metric.swap')}
            percent={facts.swap}
            placeholder={facts.swapEnabled ? '—' : t('metric.swapOff')}
            detail={
              facts.swapEnabled
                ? `${formatBytes(facts.swapUsed, true)} / ${formatBytes(facts.swapTotal, true)}`
                : t('skin.swapOffHint')
            }
          />
          <div className="min-w-0 px-4 py-3.5">
            <p className="text-[12px] text-km-dim">{t('metric.liveSpeed')}</p>
            <p className="km-s-num mt-1.5 text-[17px] leading-snug font-semibold">
              <span className="mr-1 font-normal text-km-faint">&darr;</span>
              {facts.online ? formatSpeed(facts.netIn) : '—'}
            </p>
            <p className="km-s-num text-[17px] leading-snug font-semibold">
              <span className="mr-1 font-normal text-km-faint">&uarr;</span>
              {facts.online ? formatSpeed(facts.netOut) : '—'}
            </p>
          </div>
          <div className="min-w-0 px-4 py-3.5">
            <p className="text-[12px] text-km-dim">{t('metric.load')}</p>
            <p
              className={`km-s-num mt-1 text-[26px] leading-none font-semibold tracking-tight ${
                facts.load && facts.load[0] >= facts.cores ? 'km-s-text-warn' : ''
              }`}
            >
              {facts.load ? facts.load[0].toFixed(2) : '—'}
            </p>
            <p className="km-s-num mt-2 truncate text-[12px] text-km-faint">
              {facts.load
                ? `5m ${facts.load[1].toFixed(2)}  15m ${facts.load[2].toFixed(2)}`
                : '—'}
            </p>
          </div>
        </section>

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[17px] font-semibold tracking-tight">{t('skin.history')}</h2>
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
          </section>

          <aside className="km-instance-info grid gap-4 xl:sticky xl:top-[70px]">
            {groups.map((group) => (
              <section key={group.key} className="km-s-card overflow-hidden">
                <h3 className="border-b km-hair px-4 py-2.5 text-[13px] font-semibold">
                  {group.title}
                </h3>
                {group.items.length === 0 ? (
                  <p className="px-4 py-3 text-[13px] text-km-faint">{group.emptyHint}</p>
                ) : (
                  <dl className="px-4 py-1.5">
                    {group.items.map((item) => (
                      <div
                        key={item.label}
                        className="flex items-baseline gap-3 border-t km-hair py-2
                          first:border-t-0"
                      >
                        <dt className="flex shrink-0 items-center gap-2 text-[13px] text-km-dim">
                          {item.dot && (
                            <i
                              className="inline-block h-[2px] w-2.5 rounded-full"
                              style={{ background: item.dot }}
                              aria-hidden="true"
                            />
                          )}
                          {item.label}
                        </dt>
                        <dd
                          className={`km-s-num ml-auto min-w-0 text-right text-[13px] font-medium
                            break-words ${
                              item.level === 'bad'
                                ? 'km-s-text-bad'
                                : item.level === 'warn'
                                  ? 'km-s-text-warn'
                                  : ''
                            }`}
                        >
                          {item.value}
                          {item.sub && (
                            <span className="block text-[12px] font-normal text-km-faint">
                              {item.sub}
                            </span>
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </section>
            ))}
          </aside>
        </div>
      </main>
    </>
  )
}
