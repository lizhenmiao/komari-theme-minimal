/**
 * 详情页：当前值、历史曲线、完整配置。
 *
 * 曲线颜色在这里解析而不是在图表组件里，因为 uPlot 在构造时就需要具体的 CSS
 * 颜色值，而这些值要跟随深浅色设置变化。
 */

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { useSyncExternalStore } from 'react'

import Chart from '../components/Chart'
import Navbar from '../components/Navbar'
import OsIcon from '../components/OsIcon'
import RegionFlag from '../components/RegionFlag'
import StatusDot from '../components/StatusDot'
import UsageBar from '../components/UsageBar'
import { useAppearance } from '../hooks/useAppearance'
import { useNode, useTotals } from '../hooks/useNodes'
import { useNodeHistory } from '../hooks/useNodeHistory'
import { usePingStats } from '../hooks/usePingStats'
import { useThemeSettings } from '../hooks/useThemeSettings'
import {
  daysUntil,
  isLongTerm,
  formatBytes,
  formatCores,
  formatExpiry,
  formatGpu,
  formatPrice,
  formatSpeed,
  formatUptime,
  parseTags,
  ratio,
  trafficUsed,
} from '../lib/format'
import { getState, subscribe } from '../lib/store'
import type { RangeKey } from '../hooks/useNodeHistory'
import type { ChartSeries } from '../components/Chart'

const RANGES: RangeKey[] = ['1h', '4h', '24h', '7d', '30d']

/** 和卡片上的逐指标配色保持一致。 */
const LINE_COLORS = {
  cpu: ['#6366f1', '#818cf8'],
  mem: ['#8b5cf6', '#a78bfa'],
  swap: ['#14b8a6', '#2dd4bf'],
  disk: ['#f59e0b', '#fbbf24'],
  down: ['#0ea5e9', '#38bdf8'],
  up: ['#6366f1', '#818cf8'],
  load: ['#f97316', '#fb923c'],
  ping1: ['#6366f1', '#818cf8'],
  ping2: ['#8b5cf6', '#a78bfa'],
  ping3: ['#14b8a6', '#2dd4bf'],
} as const

function withAlpha(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16)
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  return `rgba(${r},${g},${b},${alpha})`
}

/** 配置卡片里的一行「标签 - 值」。 */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[3px] text-[13px]">
      <dt className="shrink-0 text-slate-400 dark:text-slate-500">{label}</dt>
      <dd className="km-num truncate text-right">{value}</dd>
    </div>
  )
}
export default function NodeDetail() {
  const { t } = useTranslation()
  const { uuid = '' } = useParams<{ uuid: string }>()
  const settings = useThemeSettings()
  const node = useNode(uuid)
  const totals = useTotals()
  const { resolved } = useAppearance()
  const dark = resolved === 'dark'

  const [range, setRange] = useState<RangeKey>(() => {
    // 用运营者配置的时间窗口作初值，就近吸附到某个选项。
    const hours = settings.historyHours
    if (hours <= 1) return '1h'
    if (hours <= 4) return '4h'
    if (hours <= 24) return '24h'
    if (hours <= 168) return '7d'
    return '30d'
  })

  const { history, loading } = useNodeHistory(uuid, range, settings.maxPoints)

  // 两个快照参数用同一个读取函数，原因见 hooks/useNodes.ts 的说明。
  const readPublicInfo = () => getState().publicInfo
  const readPingTasks = () => getState().pingTasks

  const publicInfo = useSyncExternalStore(subscribe, readPublicInfo, readPublicInfo)
  const allPingTasks = useSyncExternalStore(subscribe, readPingTasks, readPingTasks)

  const pingTaskIds = useMemo(() => allPingTasks.map((task) => task.id), [allPingTasks])
  const { series: ping } = usePingStats(
    uuid,
    pingTaskIds,
    range,
    settings.maxPoints,
    settings.showPing,
  )

  useEffect(() => {
    document.documentElement.classList.add('km-page-instance')
    return () => document.documentElement.classList.remove('km-page-instance')
  }, [])

  const pick = (pair: readonly [string, string]) => (dark ? pair[1] : pair[0])
  const axisColor = dark ? '#64748b' : '#94a3b8'
  const gridColor = dark ? '#1e293b' : '#f1f5f9'

  const percentFormat = useMemo(() => (value: number) => `${value.toFixed(0)}%`, [])
  const loadFormat = useMemo(() => (value: number) => value.toFixed(2), [])
  const speedFormat = useMemo(() => (value: number) => formatSpeed(value), [])
  const msFormat = useMemo(() => (value: number) => `${value.toFixed(0)}ms`, [])

  const cpuSeries = useMemo<ChartSeries[]>(
    () => [
      {
        label: t('metric.cpu'),
        data: history.values.cpu,
        stroke: pick(LINE_COLORS.cpu),
        fill: withAlpha(pick(LINE_COLORS.cpu), dark ? 0.16 : 0.11),
      },
    ],
    [history.values.cpu, dark, t],
  )

  const memSeries = useMemo<ChartSeries[]>(
    () => [
      {
        label: t('metric.memory'),
        data: history.values.ram,
        stroke: pick(LINE_COLORS.mem),
        fill: withAlpha(pick(LINE_COLORS.mem), dark ? 0.16 : 0.11),
      },
      { label: t('metric.swap'), data: history.values.swap, stroke: pick(LINE_COLORS.swap) },
    ],
    [history.values.ram, history.values.swap, dark, t],
  )

  const diskSeries = useMemo<ChartSeries[]>(
    () => [
      {
        label: t('metric.disk'),
        data: history.values.disk,
        stroke: pick(LINE_COLORS.disk),
        fill: withAlpha(pick(LINE_COLORS.disk), dark ? 0.16 : 0.11),
      },
    ],
    [history.values.disk, dark, t],
  )

  const netSeries = useMemo<ChartSeries[]>(
    () => [
      {
        label: t('metric.download'),
        data: history.values.net_in,
        stroke: pick(LINE_COLORS.down),
        fill: withAlpha(pick(LINE_COLORS.down), dark ? 0.16 : 0.11),
      },
      {
        label: t('metric.upload'),
        data: history.values.net_out,
        stroke: pick(LINE_COLORS.up),
        dash: [3, 3],
      },
    ],
    [history.values.net_in, history.values.net_out, dark, t],
  )

  const loadSeries = useMemo<ChartSeries[]>(
    () => [
      {
        label: t('metric.load'),
        data: history.values.load,
        stroke: pick(LINE_COLORS.load),
        fill: withAlpha(pick(LINE_COLORS.load), dark ? 0.16 : 0.11),
      },
    ],
    [history.values.load, dark, t],
  )

  const pingSeries = useMemo<ChartSeries[]>(() => {
    const tones = [LINE_COLORS.ping1, LINE_COLORS.ping2, LINE_COLORS.ping3] as const
    return allPingTasks
      .map((task, index) => {
        const data = ping.byTask[task.id]
        if (!data) return null
        return {
          label: task.name,
          data,
          stroke: pick(tones[index % tones.length] ?? LINE_COLORS.ping1),
        }
      })
      .filter((entry): entry is ChartSeries => entry !== null)
  }, [allPingTasks, ping.byTask, dark])
  const sitename = publicInfo?.sitename || 'Komari'

  if (!node) {
    return (
      <>
        <Navbar sitename={sitename} total={totals.total} online={totals.online} backTo="/" />
        <main className="km-main km-page-instance mx-auto max-w-[1600px] px-4 py-16 sm:px-6">
          <p className="text-center text-sm text-slate-400">{t('state.loading')}</p>
        </main>
      </>
    )
  }

  const { client, status } = node
  const memTotal = status?.ram_total || client.mem_total
  const diskTotal = status?.disk_total || client.disk_total
  const swapTotal = status?.swap_total || client.swap_total
  const used = status ? trafficUsed(status, client.traffic_limit_type) : 0
  const expiry = formatExpiry(client.expired_at)
  const left = daysUntil(client.expired_at)
  // 没有日期时区分「永久」（expired_at 为 null）和「长期」（>= 100 年后）
  const longTerm = isLongTerm(client.expired_at)
  const expiryText = expiry ?? (longTerm ? t('node.longTerm') : t('node.never'))
  const price = formatPrice(client)
  const tags = parseTags(client.tags)

  const chartProps = {
    axisColor,
    gridColor,
    rebuildKey: resolved,
    lossLabel: t('metric.loss'),
  }

  return (
    <>
      <Navbar sitename={sitename} total={totals.total} online={totals.online} backTo="/" />

      <main className="km-main km-page-instance mx-auto max-w-[1600px] px-4 py-5 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <RegionFlag region={client.region} />
          <OsIcon os={client.os} />
          <StatusDot online={status?.online ?? false} />
          <h1 className="ml-1 text-[17px] font-semibold tracking-tight">{client.name}</h1>
          {tags.map((tag) => (
            <span
              key={tag}
              className="km-chip bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10
                dark:text-indigo-400"
            >
              {tag}
            </span>
          ))}
          <span className="km-num hidden text-[12px] text-slate-400 sm:inline">
            {formatCores(client)} · {formatBytes(client.mem_total)} ·{' '}
            {formatBytes(client.disk_total)} · {client.os}
          </span>
        </div>

        {/* 当前值区块，进度条的视觉语言和卡片保持一致。 */}
        <section className="km-instance-current mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="km-card p-4">
            <UsageBar
              label={t('metric.cpu')}
              tone="cpu"
              percent={status ? ratio(status.cpu, 100) : null}
              usedText={status ? `${((client.cpu_cores * status.cpu) / 100).toFixed(1)}C` : '—'}
              totalText={`${client.cpu_cores}C`}
            />
            <p className="km-num mt-2 truncate text-[12px] text-slate-400">{client.cpu_name}</p>
          </div>
          <div className="km-card p-4">
            <UsageBar
              label={t('metric.memory')}
              tone="mem"
              percent={status ? ratio(status.ram, memTotal) : null}
              usedText={status ? formatBytes(status.ram) : '—'}
              totalText={formatBytes(memTotal)}
            />
          </div>
          <div className="km-card p-4">
            <UsageBar
              label={t('metric.disk')}
              tone="disk"
              percent={status ? ratio(status.disk, diskTotal) : null}
              usedText={status ? formatBytes(status.disk) : '—'}
              totalText={formatBytes(diskTotal)}
            />
          </div>
          <div className="km-card p-4">
            <UsageBar
              label={t('metric.swap')}
              tone="swap"
              percent={status && swapTotal > 0 ? ratio(status.swap, swapTotal) : null}
              usedText={swapTotal > 0 && status ? formatBytes(status.swap) : t('metric.swapOff')}
              totalText={swapTotal > 0 ? formatBytes(swapTotal) : ''}
            />
          </div>
        </section>

        <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="km-card p-4">
            <p className="km-section mb-2">{t('metric.liveSpeed')}</p>
            <dl>
              <Row
                label={`↑ ${t('metric.upload')}`}
                value={status ? formatSpeed(status.net_out) : '—'}
              />
              <Row
                label={`↓ ${t('metric.download')}`}
                value={status ? formatSpeed(status.net_in) : '—'}
              />
            </dl>
          </div>
          <div className="km-card p-4">
            <p className="km-section mb-2">{t('metric.totalTraffic')}</p>
            <dl>
              <Row
                label={`↑ ${t('metric.upload')}`}
                value={status ? formatBytes(status.net_total_up) : '—'}
              />
              <Row
                label={`↓ ${t('metric.download')}`}
                value={status ? formatBytes(status.net_total_down) : '—'}
              />
              <Row
                label={t('metric.trafficLimit')}
                value={
                  client.traffic_limit > 0
                    ? `${formatBytes(used)} / ${formatBytes(client.traffic_limit)}`
                    : t('metric.unlimited')
                }
              />
            </dl>
          </div>
          <div className="km-card p-4">
            <p className="km-section mb-2">{t('metric.load')}</p>
            <dl>
              <Row label="1m" value={status ? status.load.toFixed(2) : '—'} />
              <Row label="5m" value={status ? status.load5.toFixed(2) : '—'} />
              <Row label="15m" value={status ? status.load15.toFixed(2) : '—'} />
            </dl>
          </div>
          <div className="km-card p-4">
            <p className="km-section mb-2">{t('node.uptime')}</p>
            <dl>
              <Row label={t('node.uptime')} value={formatUptime(status?.uptime)} />
              <Row label={t('node.expires')} value={expiryText} />
              {left !== null && (
                <Row
                  label={left < 0 ? t('node.expired', { days: -left }) : t('node.remaining', { days: left })}
                  value=""
                />
              )}
            </dl>
          </div>
        </section>

        <div className="mb-2.5 flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold tracking-tight">{t('detail.history')}</h2>
          <div className="km-seg">
            {RANGES.map((key) => (
              <button
                key={key}
                type="button"
                className={range === key ? 'km-seg-on' : 'km-seg-off'}
                onClick={() => setRange(key)}
              >
                {t(`range.${key}`)}
              </button>
            ))}
          </div>
        </div>

        {loading && history.timestamps.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">{t('state.loading')}</p>
        ) : history.timestamps.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">{t('detail.noData')}</p>
        ) : (
          <section className="km-instance-charts grid gap-3 xl:grid-cols-2">
            <div className="km-card p-4">
              <p className="km-section mb-2.5">{t('metric.cpu')}</p>
              <Chart
                timestamps={history.timestamps}
                series={cpuSeries}
                format={percentFormat}
                range={[0, 100]}
                {...chartProps}
              />
            </div>
            <div className="km-card p-4">
              <p className="km-section mb-2.5">{t('detail.memorySwap')}</p>
              <Chart
                timestamps={history.timestamps}
                series={memSeries}
                format={percentFormat}
                range={[0, 100]}
                {...chartProps}
              />
            </div>
            <div className="km-card p-4">
              <p className="km-section mb-2.5">{t('metric.disk')}</p>
              <Chart
                timestamps={history.timestamps}
                series={diskSeries}
                format={percentFormat}
                range={[0, 100]}
                {...chartProps}
              />
            </div>
            <div className="km-card p-4">
              <p className="km-section mb-2.5">{t('detail.network')}</p>
              <Chart
                timestamps={history.timestamps}
                series={netSeries}
                format={speedFormat}
                {...chartProps}
              />
            </div>
            <div className="km-card p-4">
              <p className="km-section mb-2.5">{t('metric.load')}</p>
              <Chart
                timestamps={history.timestamps}
                series={loadSeries}
                format={loadFormat}
                {...chartProps}
              />
            </div>
            {settings.showPing && pingSeries.length > 0 && (
              <div className="km-card p-4">
                <p className="km-section mb-2.5">
                  {t('metric.latency')}{' '}
                  <span className="normal-case opacity-60">{t('detail.lossGap')}</span>
                </p>
                <Chart
                  timestamps={ping.timestamps}
                  series={pingSeries}
                  format={msFormat}
                  {...chartProps}
                />
              </div>
            )}
          </section>
        )}

        <section className="km-instance-info mt-4 grid gap-3 lg:grid-cols-3">
          <div className="km-card p-4">
            <p className="km-section mb-2">{t('detail.hardware')}</p>
            <dl>
              <Row label={t('node.cpuModel')} value={client.cpu_name || '—'} />
              <Row label={t('metric.cores')} value={formatCores(client)} />
              <Row label={t('metric.memory')} value={formatBytes(client.mem_total)} />
              <Row
                label={t('metric.swap')}
                value={swapTotal > 0 ? formatBytes(swapTotal) : t('metric.swapOff')}
              />
              <Row label={t('metric.disk')} value={formatBytes(client.disk_total)} />
              <Row label={t('node.gpu')} value={formatGpu(client.gpu_name) ?? t('node.none')} />
            </dl>
          </div>
          <div className="km-card p-4">
            <p className="km-section mb-2">{t('detail.system')}</p>
            <dl>
              <Row label="OS" value={client.os || '—'} />
              <Row label={t('node.arch')} value={client.arch || '—'} />
              <Row label={t('node.virtualization')} value={client.virtualization || '—'} />
              <Row label={t('node.kernel')} value={client.kernel_version || '—'} />
              <Row label={t('node.region')} value={client.region || '—'} />
              <Row label={t('node.processes')} value={String(status?.process ?? '—')} />
            </dl>
          </div>
          <div className="km-card p-4">
            <p className="km-section mb-2">{t('detail.billing')}</p>
            <dl>
              {/* 价格对任何访客都是公开的，所以默认不显示，由运营者主动开启。 */}
              {settings.showPrice && price && <Row label={t('node.price')} value={price} />}
              {client.billing_cycle > 0 && (
                <Row label={t('node.billingCycle')} value={`${client.billing_cycle}d`} />
              )}
              <Row label={t('node.expires')} value={expiryText} />
              <Row label={t('node.connections')} value={String(status?.connections ?? '—')} />
            </dl>
          </div>
        </section>
      </main>
    </>
  )
}
