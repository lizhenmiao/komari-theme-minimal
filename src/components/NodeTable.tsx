/**
 * 表格视图，列可由访客自行勾选。
 *
 * 默认只开七列；再多就会在笔记本屏幕上把表格挤到横向滚动，而那些数据还没有
 * 值得占这个位置。勾选结果按访客存在 localStorage 里。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import OsIcon from './OsIcon'
import PingBadges from './PingBadges'
import RegionFlag from './RegionFlag'
import StatusDot from './StatusDot'
import {
  daysUntil,
  isLongTerm,
  formatBytes,
  formatExpiry,
  formatSpeed,
  formatUptime,
  ratio,
  trafficUsed,
} from '../lib/format'
import type { MetricTone } from './UsageBar'
import type { NodeView, PingTask, ThemeSettings } from '../lib/types'

const STORAGE_KEY = 'km-minimal-columns'
const EXPIRY_WARN_DAYS = 14

export type ColumnKey =
  | 'name'
  | 'spec'
  | 'cpu'
  | 'memory'
  | 'disk'
  | 'swap'
  | 'speed'
  | 'traffic'
  | 'quota'
  | 'load'
  | 'ping'
  | 'uptime'
  | 'expiry'

const ALL_COLUMNS: ColumnKey[] = [
  'name',
  'spec',
  'cpu',
  'memory',
  'disk',
  'swap',
  'speed',
  'traffic',
  'quota',
  'load',
  'ping',
  'uptime',
  'expiry',
]

/**
 * 默认全部展示。
 *
 * 列开关仍然保留，用户可以自己关掉不想看的；只是默认值不再替他做减法。
 * `name` 是必选列，`readStored` 会在任何情况下把它补回来。
 */
const DEFAULT_VISIBLE: ColumnKey[] = ALL_COLUMNS

function readStored(): ColumnKey[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_VISIBLE
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return DEFAULT_VISIBLE
    const valid = parsed.filter((entry): entry is ColumnKey =>
      ALL_COLUMNS.includes(entry as ColumnKey),
    )
    // 名称列必须始终存在，即使旧的存储数据里把它丢了也要补回来。
    return valid.includes('name') ? valid : ['name', ...valid]
  } catch {
    return DEFAULT_VISIBLE
  }
}

/** 进度条和百分比一行，已用与总量分列在下一行左右。 */
function MetricCell({
  tone,
  percent,
  usedText,
  totalText,
}: {
  tone: MetricTone
  percent: number | null
  usedText: string
  totalText: string
}) {
  const disabled = percent === null
  const fill =
    disabled ? '' : percent >= 90 ? 'km-fill-bad' : percent >= 75 ? 'km-fill-warn' : `km-fill-${tone}`
  const text =
    disabled
      ? 'text-slate-400'
      : percent >= 90
        ? 'km-text-bad'
        : percent >= 75
          ? 'km-text-warn'
          : `km-text-${tone}`

  return (
    <div className="w-[120px]">
      <div className="flex items-center gap-1.5">
        <div className="km-track flex-1">
          {!disabled && (
            <div className={`km-bar ${fill}`} style={{ width: `${Math.min(percent, 100).toFixed(1)}%` }} />
          )}
        </div>
        <span className={`km-num w-8 text-right text-[12px] font-semibold ${text}`}>
          {disabled ? '—' : `${percent.toFixed(0)}%`}
        </span>
      </div>
      <div className="mt-0.5 flex items-baseline justify-between">
        <span className={`km-num text-[12px] ${text}`}>{usedText}</span>
        <span className="km-num text-[12px] text-slate-400">{totalText}</span>
      </div>
    </div>
  )
}
interface NodeTableProps {
  nodes: NodeView[]
  settings: ThemeSettings
  pingTasks: PingTask[]
  /** 按 `${uuid}:${taskId}` 索引的延迟。 */
  pingValues: Record<string, number | undefined>
}

export default function NodeTable({ nodes, settings, pingTasks, pingValues }: NodeTableProps) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState<ColumnKey[]>(readStored)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(visible))
    } catch {
      // 存不进去也要让本次会话的勾选生效。
    }
  }, [visible])

  // 点击外部任何位置就关闭；菜单自身阻止冒泡。
  useEffect(() => {
    if (!menuOpen) return
    const onDocumentClick = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return
      setMenuOpen(false)
    }
    document.addEventListener('click', onDocumentClick)
    return () => document.removeEventListener('click', onDocumentClick)
  }, [menuOpen])

  const toggle = useCallback((key: ColumnKey) => {
    if (key === 'name') return
    setVisible((current) =>
      current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key],
    )
  }, [])

  const labels = useMemo<Record<ColumnKey, string>>(
    () => ({
      name: t('summary.nodes'),
      spec: t('detail.hardware'),
      cpu: t('metric.cpu'),
      memory: t('metric.memory'),
      disk: t('metric.disk'),
      swap: t('metric.swap'),
      speed: t('metric.liveSpeed'),
      traffic: t('metric.totalTraffic'),
      quota: t('metric.trafficLimit'),
      load: t('metric.load'),
      ping: t('metric.latency'),
      uptime: t('node.uptime'),
      expiry: t('node.expires'),
    }),
    [t],
  )

  // 按固定顺序渲染，不受勾选先后影响。
  const columns = ALL_COLUMNS.filter((key) => visible.includes(key))

  return (
    <div className="km-index-table km-card overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b km-hair px-4 py-2">
        <span className="km-section">{t('nav.table')}</span>
        <div ref={menuRef} className="relative">
          <button
            type="button"
            className="km-iconbtn"
            title={t('nav.columns')}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              className="size-4.5"
            >
              <path d="M4 6h16M4 12h16M4 18h10" />
            </svg>
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-11 z-30 w-44 rounded-xl border border-slate-200
                bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-800"
            >
              {ALL_COLUMNS.map((key) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5
                    text-[13px] hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  <input
                    type="checkbox"
                    className="size-3.5 accent-indigo-500"
                    checked={visible.includes(key)}
                    disabled={key === 'name'}
                    onChange={() => toggle(key)}
                  />
                  <span className={key === 'name' ? 'text-slate-400' : ''}>{labels[key]}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead
            className="border-b km-hair bg-slate-50/70 text-left text-[12px] font-medium
              text-slate-400 dark:bg-slate-800/40"
          >
            <tr>
              {columns.map((key, index) => (
                <th key={key} className={`${index === 0 ? 'px-4' : 'px-2.5'} py-2.5`}>
                  {labels[key]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {nodes.map((node) => (
              <TableRow
                key={node.client.uuid}
                node={node}
                columns={columns}
                settings={settings}
                pingTasks={pingTasks}
                pingValues={pingValues}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
function TableRow({
  node,
  columns,
  settings,
  pingTasks,
  pingValues,
}: {
  node: NodeView
  columns: ColumnKey[]
  settings: ThemeSettings
  pingTasks: PingTask[]
  pingValues: Record<string, number | undefined>
}) {
  const { t } = useTranslation()
  const { client, status } = node

  const memTotal = status?.ram_total || client.mem_total
  const diskTotal = status?.disk_total || client.disk_total
  const swapTotal = status?.swap_total || client.swap_total
  const used = status ? trafficUsed(status, client.traffic_limit_type) : 0
  const expiry = formatExpiry(client.expired_at)
  const left = daysUntil(client.expired_at)
  const expired = left !== null && left < 0
  // 没有日期时区分「永久」（expired_at 为 null）和「长期」（>= 100 年后）
  const longTerm = isLongTerm(client.expired_at)

  const rowPing: Record<number, number | undefined> = {}
  for (const task of pingTasks) {
    rowPing[task.id] = pingValues[`${client.uuid}:${task.id}`]
  }

  const cell = (key: ColumnKey) => {
    switch (key) {
      case 'name':
        return (
          <Link to={`/instance/${client.uuid}`} className="flex items-center gap-2">
            <span className="flex shrink-0 items-center gap-1.5">
              <RegionFlag region={client.region} />
              <OsIcon os={client.os} />
              <StatusDot online={status?.online ?? false} />
            </span>
            <span className="ml-1 whitespace-nowrap text-[14px] font-medium">{client.name}</span>
          </Link>
        )
      case 'spec':
        return (
          <span className="km-num whitespace-nowrap text-[12px] text-slate-400">
            {client.cpu_cores}C {formatBytes(client.mem_total, true)}{' '}
            {formatBytes(client.disk_total, true)}
          </span>
        )
      case 'cpu':
        return (
          <MetricCell
            tone="cpu"
            percent={status ? ratio(status.cpu, 100) : null}
            usedText={status ? `${((client.cpu_cores * status.cpu) / 100).toFixed(1)}C` : '—'}
            totalText={`${client.cpu_cores}C`}
          />
        )
      case 'memory':
        return (
          <MetricCell
            tone="mem"
            percent={status ? ratio(status.ram, memTotal) : null}
            usedText={status ? formatBytes(status.ram, true) : '—'}
            totalText={formatBytes(memTotal, true)}
          />
        )
      case 'disk':
        return (
          <MetricCell
            tone="disk"
            percent={status ? ratio(status.disk, diskTotal) : null}
            usedText={status ? formatBytes(status.disk, true) : '—'}
            totalText={formatBytes(diskTotal, true)}
          />
        )
      case 'swap':
        return (
          <MetricCell
            tone="swap"
            percent={status && swapTotal > 0 ? ratio(status.swap, swapTotal) : null}
            usedText={
              swapTotal > 0 && status ? formatBytes(status.swap, true) : t('metric.swapOff')
            }
            totalText={swapTotal > 0 ? formatBytes(swapTotal, true) : ''}
          />
        )
      case 'speed':
        return (
          <div className="km-num whitespace-nowrap text-[12px]">
            <span className="km-text-cpu">&uarr;</span> {status ? formatSpeed(status.net_out) : '—'}
            <br />
            <span className="km-text-quota">&darr;</span> {status ? formatSpeed(status.net_in) : '—'}
          </div>
        )
      case 'traffic':
        return (
          <div className="km-num whitespace-nowrap text-[12px]">
            <span className="km-text-cpu">&uarr;</span>{' '}
            {status ? formatBytes(status.net_total_up, true) : '—'}
            <br />
            <span className="km-text-quota">&darr;</span>{' '}
            {status ? formatBytes(status.net_total_down, true) : '—'}
          </div>
        )
      case 'quota':
        return client.traffic_limit > 0 ? (
          <MetricCell
            tone="quota"
            percent={ratio(used, client.traffic_limit)}
            usedText={formatBytes(used, true)}
            totalText={formatBytes(client.traffic_limit, true)}
          />
        ) : (
          <MetricCell
            tone="quota"
            percent={null}
            usedText={formatBytes(used, true)}
            totalText={t('metric.unlimited')}
          />
        )
      case 'load':
        return (
          <div className="km-num whitespace-nowrap text-[12px]">
            <b className="text-[13px] font-semibold">{status ? status.load.toFixed(2) : '—'}</b>
            <br />
            <span className="text-slate-400">
              {status ? `${status.load5.toFixed(2)}/${status.load15.toFixed(2)}` : '—'}
            </span>
          </div>
        )
      case 'ping':
        return settings.showPing ? (
          <PingBadges tasks={pingTasks} values={rowPing} compact />
        ) : null
      case 'uptime':
        return (
          <span className="km-num whitespace-nowrap text-[12px]">
            {formatUptime(status?.uptime)}
          </span>
        )
      case 'expiry':
        return (
          <div className="km-num whitespace-nowrap text-[12px]">
            <span className={expired ? 'km-text-bad' : ''}>
              {expiry ?? (longTerm ? t('node.longTerm') : t('node.never'))}
            </span>
            <br />
            {left === null ? (
              <span className="text-slate-400">—</span>
            ) : expired ? (
              <span className="km-text-bad font-semibold">
                {t('node.expired', { days: -left })}
              </span>
            ) : (
              <span
                className={
                  left <= EXPIRY_WARN_DAYS ? 'km-text-warn font-semibold' : 'text-slate-400'
                }
              >
                {t('node.remaining', { days: left })}
              </span>
            )}
          </div>
        )
      default:
        return null
    }
  }

  return (
    <tr
      className={`km-ui-table-row transition hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
        status?.online ? '' : 'opacity-45'
      }`}
    >
      {columns.map((key, index) => (
        <td key={key} className={`${index === 0 ? 'px-4' : 'px-2.5'} py-2.5 align-middle`}>
          {cell(key)}
        </td>
      ))}
    </tr>
  )
}
