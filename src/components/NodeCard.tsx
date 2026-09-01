/**
 * 一个节点一张卡片。
 *
 * 排布顺序是刻意的：所有进度条形态的指标集中在上半部分，让眼睛只读一种视觉
 * 语言，然后是纯数字、延迟与负载、最后是日期。可选区块由主题设置控制。
 */

import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import InfoPopover, { InfoRow } from './InfoPopover'
import OsIcon from './OsIcon'
import PingBadges from './PingBadges'
import RegionFlag from './RegionFlag'
import StatusDot from './StatusDot'
import UsageBar from './UsageBar'
import {
  daysUntil,
  isLongTerm,
  formatBytes,
  formatExpiry,
  formatGpu,
  formatSpeed,
  formatUptime,
  parseTags,
  ratio,
  trafficUsed,
} from '../lib/format'
import type { NodeView, PingTask, ThemeSettings } from '../lib/types'

/** 在一个节点的多个标签间轮换，保证相邻标签颜色不同。 */
const TAG_TONES = [
  'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400',
  'bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400',
  'bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-500/10 dark:text-fuchsia-400',
] as const

/** 剩余天数低于这个值，到期日转橙色预警。 */
const EXPIRY_WARN_DAYS = 14

interface NodeCardProps {
  node: NodeView
  settings: ThemeSettings
  pingTasks: PingTask[]
  pingValues: Record<number, number | undefined>
}

function NodeCardInner({ node, settings, pingTasks, pingValues }: NodeCardProps) {
  const { t } = useTranslation()
  const { client, status } = node

  const tags = parseTags(client.tags).slice(0, 3)
  const expiry = formatExpiry(client.expired_at)
  const left = daysUntil(client.expired_at)
  const expired = left !== null && left < 0
  const expiringSoon = left !== null && left >= 0 && left <= EXPIRY_WARN_DAYS
  /*
   * 没有日期时有两种情况，文案不同：
   *   - `expired_at` 为 null      -> 永久
   *   - 判定为长期（>= 100 年后）  -> 长期
   * formatExpiry 两种都返回 null，所以这里要单独问一次。
   */
  const longTerm = isLongTerm(client.expired_at)

  // 还没有采样到达时，总量回退到元数据里的数字，这样首屏显示的是真实容量
  // 而不是一堆 0。
  const memTotal = status?.ram_total || client.mem_total
  const diskTotal = status?.disk_total || client.disk_total
  const swapTotal = status?.swap_total || client.swap_total
  const swapEnabled = swapTotal > 0

  const used = status ? trafficUsed(status, client.traffic_limit_type) : 0
  const quotaPercent = client.traffic_limit > 0 ? ratio(used, client.traffic_limit) : null

  // 离线节点保持布局只是变暗，这样网格不会重排。
  const dim = status?.online ? '' : 'opacity-45'

  return (
    <article className="km-node-card km-card km-card-link flex flex-col p-3.5">
      <Link to={`/instance/${client.uuid}`} className="contents">
        <header className="flex items-center gap-2">
          {/* 国旗、系统、在线状态聚成一簇，和名称拉开距离。 */}
          <span className="flex shrink-0 items-center gap-1.5">
            <RegionFlag region={client.region} />
            <OsIcon os={client.os} />
            <StatusDot online={status?.online ?? false} />
          </span>
          <h3 className="ml-1 truncate text-[15px] font-semibold tracking-tight">{client.name}</h3>
          {tags.map((tag, index) => (
            <span
              key={tag}
              className={`km-chip shrink-0 ${TAG_TONES[index % TAG_TONES.length] ?? ''}`}
            >
              {tag}
            </span>
          ))}
          <span className="flex-1" />
          <InfoPopover>
            <InfoRow label={t('node.cpuModel')} value={client.cpu_name || '—'} />
            <InfoRow label={t('node.arch')} value={client.arch || '—'} />
            <InfoRow label={t('node.virtualization')} value={client.virtualization || '—'} />
            <InfoRow label={t('node.gpu')} value={formatGpu(client.gpu_name) ?? t('node.none')} />
            <InfoRow label={t('node.processes')} value={status?.process ?? '—'} />
            <InfoRow label={t('node.connections')} value={status?.connections ?? '—'} />
          </InfoPopover>
        </header>

        <p className="km-num mt-1 truncate text-[12px] text-slate-400 dark:text-slate-500">
          {client.cpu_cores}C · {formatBytes(client.mem_total)} · {formatBytes(client.disk_total)} ·{' '}
          {client.os}
        </p>
        {/* 所有进度条形态的指标都放在这一块里。 */}
        <div className={`mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2 ${dim}`}>
          <UsageBar
            label={t('metric.cpu')}
            tone="cpu"
            percent={status ? ratio(status.cpu, 100) : null}
            usedText={
              status ? `${((client.cpu_cores * status.cpu) / 100).toFixed(1)}C` : '—'
            }
            totalText={`${client.cpu_cores}C`}
          />
          <UsageBar
            label={t('metric.memory')}
            tone="mem"
            percent={status ? ratio(status.ram, memTotal) : null}
            usedText={status ? formatBytes(status.ram, true) : '—'}
            totalText={formatBytes(memTotal, true)}
          />
          {settings.showDisk && (
            <UsageBar
              label={t('metric.disk')}
              tone="disk"
              percent={status ? ratio(status.disk, diskTotal) : null}
              usedText={status ? formatBytes(status.disk, true) : '—'}
              totalText={formatBytes(diskTotal, true)}
            />
          )}
          <UsageBar
            label={t('metric.swap')}
            tone="swap"
            percent={status && swapEnabled ? ratio(status.swap, swapTotal) : null}
            usedText={swapEnabled && status ? formatBytes(status.swap, true) : t('metric.swapOff')}
            totalText={swapEnabled ? formatBytes(swapTotal, true) : ''}
          />
        </div>

        {/* 同样是进度条，所以流量限额跟上面那组放在一起。 */}
        {settings.showTraffic && client.traffic_limit > 0 && (
          <div className={`mt-2 ${dim}`}>
            <UsageBar
              label={t('metric.trafficLimit')}
              tone="quota"
              percent={quotaPercent}
              usedText={formatBytes(used, true)}
              totalText={formatBytes(client.traffic_limit, true)}
            />
          </div>
        )}

        <div className={`mt-2.5 grid grid-cols-2 gap-x-4 border-t km-hair pt-2 ${dim}`}>
          <div>
            <p className="km-section mb-1">{t('metric.liveSpeed')}</p>
            <p className="km-num text-[13px]">
              <span className="km-text-cpu">&uarr;</span>
              <b className="font-semibold">{status ? formatSpeed(status.net_out) : '—'}</b>
              <span className="ml-2 km-text-quota">&darr;</span>
              <b className="font-semibold">{status ? formatSpeed(status.net_in) : '—'}</b>
            </p>
          </div>
          <div>
            <p className="km-section mb-1">{t('metric.totalTraffic')}</p>
            <p className="km-num text-[13px]">
              <span className="km-text-cpu">&uarr;</span>
              <b className="font-semibold">
                {status ? formatBytes(status.net_total_up, true) : '—'}
              </b>
              <span className="ml-2 km-text-quota">&darr;</span>
              <b className="font-semibold">
                {status ? formatBytes(status.net_total_down, true) : '—'}
              </b>
            </p>
          </div>
        </div>

        {(settings.showPing || settings.showLoad) && (
          <div className={`mt-2.5 grid grid-cols-2 gap-x-4 border-t km-hair pt-2 ${dim}`}>
            {settings.showPing && pingTasks.length > 0 && (
              <div>
                <p className="km-section mb-1">
                  {t('metric.latency')} <span className="normal-case opacity-60">ms</span>
                </p>
                <PingBadges tasks={pingTasks} values={pingValues} />
              </div>
            )}
            {settings.showLoad && (
              <div>
                <p className="km-section mb-1 flex items-center gap-1">
                  {t('metric.load')}
                  {/* 单独一个 group 名，这样悬停这里不会把卡片上的 popover 一起打开。 */}
                  <InfoPopover group="tip" width="w-52">
                    <span className="leading-relaxed text-slate-600 dark:text-slate-300">
                      {t('metric.loadHint', { cores: client.cpu_cores })}
                    </span>
                  </InfoPopover>
                </p>
                <p className="km-num text-[13px]">
                  <b className="font-semibold">{status ? status.load.toFixed(2) : '—'}</b>
                  <span className="mx-1 text-slate-300 dark:text-slate-600">/</span>
                  <b className="font-semibold">{status ? status.load5.toFixed(2) : '—'}</b>
                  <span className="mx-1 text-slate-300 dark:text-slate-600">/</span>
                  <b className="font-semibold">{status ? status.load15.toFixed(2) : '—'}</b>
                </p>
              </div>
            )}
          </div>
        )}

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t km-hair pt-2 text-[12px]">
          {settings.showExpiry && (
            <span className="km-num flex items-center gap-1.5">
              <span className="text-slate-400">{t('node.expires')}:</span>
              {expiry ? (
                <span
                  className={
                    expired
                      ? 'km-text-bad font-semibold'
                      : expiringSoon
                        ? 'km-text-warn font-semibold'
                        : ''
                  }
                >
                  {expiry}
                </span>
              ) : (
                <span className="text-slate-400">
                  {longTerm ? t('node.longTerm') : t('node.never')}
                </span>
              )}
              {/* 绝不显示负的天数，改成换一套措辞。 */}
              {expired && left !== null && (
                <span className="km-pill bg-rose-500 text-white">
                  {t('node.expired', { days: -left })}
                </span>
              )}
              {expiringSoon && left !== null && (
                <span className="km-pill km-pill-warn">{t('node.remaining', { days: left })}</span>
              )}
            </span>
          )}
          <span className={`km-num ${dim}`}>
            <span className="text-slate-400">{t('node.uptime')}:</span>{' '}
            {formatUptime(status?.uptime)}
          </span>
        </div>
      </Link>
    </article>
  )
}

export default memo(NodeCardInner)
