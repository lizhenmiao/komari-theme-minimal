/**
 * Vercel 皮肤的节点卡片。
 *
 * 排布：CPU 大数字 + 趋势线在上，资源细条居中，网速 / 流量 / 延迟 / 到期
 * 收在下半部分的键值区。信息量与经典卡片一致，受同一批设置开关控制。
 *
 * `km-node-card` 是校验脚本数卡片数量的锚点，必须保留。
 */

import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import OsIcon from '../../components/OsIcon'
import RegionFlag from '../../components/RegionFlag'
import Sparkline from '../../components/Sparkline'
import Meter, { valueClass } from '../shared/Meter'
import { nodeFacts } from '../shared/nodeFacts'
import { isExpiryIssue, issueText, uptimeText, uptimeUnits } from '../shared/text'
import { useCpuTrend } from '../../hooks/useNodes'
import { formatBytes, formatSpeed } from '../../lib/format'
import { tasksFor } from '../../lib/ping'
import type { NodeView, PingTask, ThemeSettings } from '../../lib/types'

interface CardProps {
  node: NodeView
  settings: ThemeSettings
  pingTasks: PingTask[]
  pingValues: Record<number, number | undefined>
}

/** 下半部分的一行：左标签、右值。 */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 border-t km-hair py-[7px] first:border-t-0">
      <span className="shrink-0 text-[12px] text-km-faint">{label}</span>
      <span className="km-s-num ml-auto truncate text-right text-[13px] font-medium">
        {children}
      </span>
    </div>
  )
}

function VercelNodeCardInner({ node, settings, pingTasks, pingValues }: CardProps) {
  const { t } = useTranslation()
  const { client } = node
  const facts = nodeFacts(node)
  const units = uptimeUnits(t)
  const cpuTrend = useCpuTrend(client.uuid)

  // 运营者可以只给部分节点配探测，不过滤的话没配的节点会显示一排空药丸。
  const myTasks = useMemo(() => tasksFor(pingTasks, client.uuid), [pingTasks, client.uuid])

  const major = facts.issues.filter((issue) => !issue.minor)
  const flag = facts.level === 'bad' || facts.level === 'offline' ? 'bad' : facts.level === 'warn' ? 'warn' : null
  // 离线时各项读数都是上一次采样的残值，整块压暗，但布局不动，网格不会重排。
  const dim = facts.online ? '' : 'opacity-45'

  const cores = `${facts.cores}C`
  const coresUsed = facts.coresUsed === null ? '—' : `${facts.coresUsed.toFixed(1)}C`

  return (
    <Link
      to={`/instance/${client.uuid}`}
      className={`km-node-card km-s-card km-s-card-flag ${
        flag ? `km-s-card-flag-${flag}` : ''
      } block overflow-hidden`}
    >
      <div className="flex items-center gap-2.5 px-4 pt-3.5">
        <RegionFlag region={client.region} />
        <OsIcon os={client.os} />
        <h3 className="min-w-0 truncate text-[15px] font-semibold tracking-tight">
          {client.name}
        </h3>
        <span
          className={`km-s-num ml-auto shrink-0 text-[12px] ${
            facts.online ? 'text-km-dim' : 'km-s-text-bad font-semibold'
          }`}
        >
          {facts.online ? uptimeText(facts, units) : t('node.offline')}
        </span>
      </div>

      <p className="km-s-num mt-1 truncate px-4 text-[12px] text-km-faint">
        {client.os} · {cores} · {formatBytes(client.mem_total)} ·{' '}
        {formatBytes(client.disk_total)}
      </p>

      {(major.length > 0 || facts.tags.length > 0) && (
        <div className="mt-2.5 flex flex-wrap gap-1.5 px-4">
          {facts.online &&
            major.map((issue) => (
              <span
                key={issue.kind}
                className={`km-s-badge km-s-badge-${issue.level === 'bad' ? 'bad' : 'warn'}`}
              >
                {issueText(t, issue, facts, units)}
              </span>
            ))}
          {facts.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="km-s-tag">
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className={`mt-3 px-4 ${dim}`}>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[12px] text-km-dim">{t('metric.cpu')}</p>
            <p
              className={`km-s-num text-[26px] leading-none font-semibold tracking-tight ${valueClass(
                facts.cpu,
              )}`}
            >
              {facts.cpu === null ? '—' : Math.round(facts.cpu)}
              {facts.cpu !== null && <span className="ml-0.5 text-[15px]">%</span>}
            </p>
          </div>
          {settings.showLoad && (
            <p className="km-s-num pb-0.5 text-[12px] text-km-faint">
              {t('metric.load')}{' '}
              <b className="font-medium text-km-dim">
                {facts.load ? facts.load.map((value) => value.toFixed(2)).join(' / ') : '—'}
              </b>
            </p>
          )}
          <p className="km-s-num pb-0.5 text-[12px] text-km-faint">
            {coresUsed} / {cores}
          </p>
        </div>

        {/*
         * CPU 趋势。数据由轮询累积，刚打开页面时点数不够就整块不渲染 ——
         * 画一条只有两三个点的折线比不画更容易让人误读。
         *
         * 这是整张卡片唯一的一处活色：常态走强调蓝，越过阈值才转暖 / 烫，
         * 和「平时安静」一致。裸图铺满卡片宽度，比经典皮肤那个带框小图更显眼。
         */}
        {settings.showSparkline && cpuTrend.length >= 2 && (
          <div className="mt-2.5">
            <Sparkline
              data={cpuTrend}
              color={
                facts.cpu !== null && facts.cpu >= 90
                  ? 'var(--color-km-bad)'
                  : facts.cpu !== null && facts.cpu >= 75
                    ? 'var(--color-km-warn)'
                    : 'var(--color-km-accent)'
              }
              dimmed={!facts.online}
              bare
              height={48}
            />
          </div>
        )}
      </div>

      <div className={`mt-3 grid gap-2 px-4 ${dim}`}>
        <Meter
          label={t('metric.memory')}
          percent={facts.mem}
          detail={`${formatBytes(facts.memUsed, true)} / ${formatBytes(facts.memTotal, true)}`}
        />
        {settings.showDisk && (
          <Meter
            label={t('metric.disk')}
            percent={facts.disk}
            detail={`${formatBytes(facts.diskUsed, true)} / ${formatBytes(facts.diskTotal, true)}`}
          />
        )}
        <Meter
          label={t('metric.swap')}
          percent={facts.swap}
          placeholder={facts.swapEnabled ? '—' : t('metric.swapOff')}
          detail={
            facts.swapEnabled
              ? `${formatBytes(facts.swapUsed, true)} / ${formatBytes(facts.swapTotal, true)}`
              : ''
          }
        />
        {settings.showTraffic && facts.quota !== null && (
          <Meter
            label={t('metric.trafficLimit')}
            percent={facts.quota}
            detail={`${formatBytes(facts.quotaUsed, true)} / ${formatBytes(facts.quotaLimit, true)}`}
          />
        )}
      </div>

      <div className={`mt-2.5 px-4 pb-2 ${dim}`}>
        <Row label={t('skin.netSpeed')}>
          {facts.online ? (
            <>
              &darr; {formatSpeed(facts.netIn)}
              <span className="mx-1 text-km-faint">·</span>
              &uarr; {formatSpeed(facts.netOut)}
            </>
          ) : (
            '—'
          )}
        </Row>
        <Row label={t('skin.totalTraffic')}>
          &darr; {formatBytes(facts.totalDown, true)}
          <span className="mx-1 text-km-faint">·</span>
          &uarr; {formatBytes(facts.totalUp, true)}
        </Row>
        {settings.showPing && (
          <Row label={t('metric.latency')}>
            {myTasks.length === 0 ? (
              <span className="text-km-faint">{t('skin.noPingTask')}</span>
            ) : !facts.online ? (
              '—'
            ) : (
              <span className="inline-flex gap-2">
                {myTasks.map((task) => {
                  const value = pingValues[task.id]
                  const lost = value !== undefined && value < 0
                  return (
                    <span key={task.id}>
                      <span className="mr-1 text-[12px] font-normal text-km-faint">
                        {task.name}
                      </span>
                      {/* 负值是丢包的哨兵，绝不能当成毫秒显示出来。 */}
                      <b className={lost ? 'km-s-text-bad' : 'font-semibold'}>
                        {value === undefined ? '—' : lost ? t('metric.timeout') : Math.round(value)}
                      </b>
                    </span>
                  )
                })}
              </span>
            )}
          </Row>
        )}
        {/* 到期已经在上面的徽章里说过了，就别在这儿重复一遍。 */}
        {settings.showExpiry && !major.some(isExpiryIssue) && (
          <Row label={t('node.expires')}>
            {facts.expiryDate ? (
              <>
                {facts.expiryDate}
                {facts.daysLeft !== null && (
                  <span className="ml-1.5 text-[12px] font-normal text-km-faint">
                    {t('node.remaining', { days: facts.daysLeft })}
                  </span>
                )}
              </>
            ) : (
              <span className="text-km-faint">
                {facts.longTerm ? t('node.longTerm') : t('node.never')}
              </span>
            )}
          </Row>
        )}
      </div>
    </Link>
  )
}

export default memo(VercelNodeCardInner)
