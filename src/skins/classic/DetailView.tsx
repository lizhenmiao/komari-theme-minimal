/**
 * 经典皮肤的详情页：当前值、历史曲线、完整配置。
 *
 * 1.0 版 `pages/NodeDetail.tsx` 的 JSX 原样搬移，不做视觉调整。曲线颜色与
 * 序列装配已上移到 `pages/NodeDetail.tsx`，这里只按声明渲染。
 */

import { useTranslation } from 'react-i18next'

import Chart from '../../components/Chart'
import Navbar from '../../components/Navbar'
import OsIcon from '../../components/OsIcon'
import RegionFlag from '../../components/RegionFlag'
import RingGauge from '../../components/RingGauge'
import StatusDot from '../../components/StatusDot'
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
} from '../../lib/format'
import type { DetailModel } from '../model'

/** 配置卡片里的一行「标签 - 值」。 */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[3px] text-[13px]">
      <dt className="shrink-0 text-km-faint">{label}</dt>
      <dd className="km-num truncate text-right">{value}</dd>
    </div>
  )
}

export default function ClassicDetailView(model: DetailModel) {
  const { t } = useTranslation()
  const {
    node,
    sitename,
    totals,
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

  const shell = (
    <Navbar
      sitename={sitename}
      total={totals.total}
      online={totals.online}
      backTo="/"
      authEntry={authEntry}
    />
  )

  if (!node) {
    return (
      <>
        {shell}
        <main className="km-main km-page-instance mx-auto max-w-[1560px] px-3.5 py-16 lg:px-5">
          <p className="text-center text-sm text-km-faint">{t('state.loading')}</p>
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

  return (
    <>
      {shell}

      <main className="km-main km-page-instance mx-auto max-w-[1560px] px-3.5 pt-4.5 pb-2 lg:px-5">
        <div className="mb-3.5 flex flex-wrap items-center gap-2">
          <RegionFlag region={client.region} />
          <OsIcon os={client.os} />
          <StatusDot online={status?.online ?? false} />
          <h1 className="ml-1 text-[17px] font-semibold tracking-tight">{client.name}</h1>
          {tags.map((tag) => (
            <span key={tag} className="km-pill km-pill-cpu">
              {tag}
            </span>
          ))}
          <span className="km-num hidden text-[12px] text-km-faint sm:inline">
            {formatCores(client)} · {formatBytes(client.mem_total)} ·{' '}
            {formatBytes(client.disk_total)} · {client.os}
          </span>
        </div>

        {/*
         * 当前值用环形仪表：详情页只看一个节点，环比条更醒目，也和首页卡片的
         * 条形拉开区分，让人一眼知道自己在哪一层。
         */}
        <section
          className="km-instance-current mb-3.5 grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))' }}
        >
          <RingGauge
            label={t('metric.cpu')}
            tone="cpu"
            percent={status ? ratio(status.cpu, 100) : null}
            usedText={status ? `${((client.cpu_cores * status.cpu) / 100).toFixed(1)}C` : '—'}
            totalText={`${client.cpu_cores}C`}
            sub={client.cpu_name}
          />
          <RingGauge
            label={t('metric.memory')}
            tone="mem"
            percent={status ? ratio(status.ram, memTotal) : null}
            usedText={status ? formatBytes(status.ram) : '—'}
            totalText={formatBytes(memTotal)}
            {...(status ? { sub: `${t('metric.free')} ${formatBytes(memTotal - status.ram)}` } : {})}
          />
          <RingGauge
            label={t('metric.disk')}
            tone="disk"
            percent={status ? ratio(status.disk, diskTotal) : null}
            usedText={status ? formatBytes(status.disk) : '—'}
            totalText={formatBytes(diskTotal)}
            {...(status
              ? { sub: `${t('metric.free')} ${formatBytes(diskTotal - status.disk)}` }
              : {})}
          />
          <RingGauge
            label={t('metric.swap')}
            tone="swap"
            percent={status && swapTotal > 0 ? ratio(status.swap, swapTotal) : null}
            usedText={swapTotal > 0 && status ? formatBytes(status.swap) : t('metric.swapOff')}
            totalText={swapTotal > 0 ? formatBytes(swapTotal) : ''}
            {...(swapTotal > 0 ? { suffix: t('metric.swapOn') } : {})}
          />
        </section>

        {/*
         * 五格并成一块面板，用竖线分隔而不是各自成卡：这些都是「当前一瞬」的
         * 读数，同属一类，分成五张卡会显得它们互不相干。
         *
         * 列间距要留够，让分隔线两侧都有空白。gap 是 28px、`pl-3.5` 把内容从
         * 线上推开 14px，线正好落在两列中间。
         *
         * 边框色必须用 `border-km-hair` 这种 Tailwind 工具类，不能写
         * `[&>section+section]:km-hair` —— 变体只能修饰 Tailwind 自己生成的
         * 工具类，套在手写的 component 类上会被直接丢弃，线会落到 currentColor。
         */}
        <section
          className="km-card mb-3.5 grid gap-x-7 gap-y-4 p-4 sm:grid-cols-2
            xl:grid-cols-5 xl:[&>section+section]:-ml-3.5 xl:[&>section+section]:border-l
            xl:[&>section+section]:border-km-hair xl:[&>section+section]:pl-3.5"
        >
          <section>
            <p className="km-section mb-1.5">{t('metric.liveSpeed')}</p>
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
          </section>
          <section>
            <p className="km-section mb-1.5">{t('metric.totalTraffic')}</p>
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
          </section>
          <section>
            <p className="km-section mb-1.5">{t('metric.load')}</p>
            <dl>
              <Row label="1m" value={status ? status.load.toFixed(2) : '—'} />
              <Row label="5m" value={status ? status.load5.toFixed(2) : '—'} />
              <Row label="15m" value={status ? status.load15.toFixed(2) : '—'} />
            </dl>
          </section>
          <section>
            <p className="km-section mb-1.5">{t('detail.runtime')}</p>
            <dl>
              <Row
                label={t('node.uptime')}
                value={formatUptime(status?.uptime, {
                  day: t('node.day'),
                  hour: t('node.hour'),
                  minute: t('node.minute'),
                })}
              />
              <Row label={t('node.processes')} value={String(status?.process ?? '—')} />
              <Row label={t('node.connections')} value={String(status?.connections ?? '—')} />
            </dl>
          </section>
          <section>
            <p className="km-section mb-1.5">{t('node.expires')}</p>
            <dl>
              <Row label={t('node.expires')} value={expiryText} />
              {left !== null && (
                <Row
                  label={t('metric.remaining')}
                  value={
                    left < 0
                      ? t('node.expired', { days: -left })
                      : t('node.remaining', { days: left })
                  }
                />
              )}
            </dl>
          </section>
        </section>

        <div className="mb-2.5 flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold tracking-tight">{t('detail.history')}</h2>
          <div className="km-seg">
            {ranges.map((key) => (
              <button
                key={key}
                type="button"
                className={range === key ? 'km-seg-on' : 'km-seg-off'}
                onClick={() => onRangeChange(key)}
              >
                {t(`range.${key}`)}
              </button>
            ))}
          </div>
        </div>

        {historyLoading && history.timestamps.length === 0 ? (
          <p className="py-16 text-center text-sm text-km-faint">{t('state.loading')}</p>
        ) : history.timestamps.length === 0 ? (
          <p className="py-16 text-center text-sm text-km-faint">{t('detail.noData')}</p>
        ) : (
          /*
           * min-w-0 是必需的：网格项默认 min-width:auto，uPlot 生成的固定宽度
           * canvas 会把列宽顶起来，窗口缩小时容器再也缩不回去。
           */
          <section className="km-instance-charts grid gap-3 xl:grid-cols-2">
            {charts.map((spec) => (
              <div key={spec.key} className="km-card min-w-0 p-3.5">
                <p className="km-section mb-2.5">
                  {spec.title}
                  {spec.note && <span className="normal-case text-km-faint"> {spec.note}</span>}
                </p>
                <Chart
                  timestamps={spec.timestamps}
                  series={spec.series}
                  format={spec.format}
                  axisFormat={spec.axisFormat}
                  range={spec.range}
                  {...chartChrome}
                />
              </div>
            ))}
          </section>
        )}

        <section className="km-instance-info mt-3.5 grid gap-3 lg:grid-cols-3">
          <div className="km-card p-3.5">
            <p className="km-section mb-1.5">{t('detail.hardware')}</p>
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
          <div className="km-card p-3.5">
            <p className="km-section mb-1.5">{t('detail.system')}</p>
            <dl>
              <Row label="OS" value={client.os || '—'} />
              <Row label={t('node.arch')} value={client.arch || '—'} />
              <Row label={t('node.virtualization')} value={client.virtualization || '—'} />
              <Row label={t('node.kernel')} value={client.kernel_version || '—'} />
              <Row label={t('node.region')} value={client.region || '—'} />
              <Row label={t('node.processes')} value={String(status?.process ?? '—')} />
            </dl>
          </div>
          <div className="km-card p-3.5">
            <p className="km-section mb-1.5">{t('detail.billing')}</p>
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
