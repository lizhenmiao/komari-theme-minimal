/**
 * 新皮肤的表格视图。两套皮肤共用同一套 DOM，形状差异全在 skins.css 里。
 *
 * 列与经典皮肤的 `NodeTable` 对齐，但多了「状态」一列：新皮肤把问题前置，
 * 一眼要能看出哪一行出事了。可选列照样受主题设置控制。
 *
 * `km-ui-table-row` 是校验脚本的锚点，必须保留。
 */

import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import RegionFlag from '../../components/RegionFlag'
import { valueClass } from './Meter'
import { levelOf } from './Meter'
import { nodeFacts } from './nodeFacts'
import { issueText, uptimeText, uptimeUnits } from './text'
import { formatBytes, formatExpiry, formatSpeed } from '../../lib/format'
import type { NodeView, PingTask, ThemeSettings } from '../../lib/types'

interface SkinNodeTableProps {
  nodes: NodeView[]
  settings: ThemeSettings
  pingTasks: PingTask[]
  /** 键是 `${uuid}:${taskId}`，负值表示丢包。 */
  pingValues: Record<string, number>
}

/** 一个占用单元格：百分比 + 细条。 */
function Cell({ percent }: { percent: number | null }) {
  const level = levelOf(percent)
  return (
    <div className="grid grid-cols-[2.3rem_3.5rem] items-center gap-2">
      <b className={`km-s-num text-right font-semibold ${valueClass(percent)}`}>
        {percent === null ? '—' : `${Math.round(percent)}%`}
      </b>
      <span className="km-s-track h-[5px]">
        {percent !== null && (
          <span
            className={`km-s-fill km-s-fill-${level} block`}
            style={{ width: `${Math.min(percent, 100).toFixed(1)}%` }}
          />
        )}
      </span>
    </div>
  )
}

function SkinNodeTableInner({ nodes, settings, pingTasks, pingValues }: SkinNodeTableProps) {
  const { t } = useTranslation()
  const units = uptimeUnits(t)

  return (
    <div className="km-index-table km-s-table-wrap">
      <table className="km-s-table">
        <thead>
          <tr>
            <th>{t('skin.nodes')}</th>
            <th>{t('skin.status')}</th>
            <th>{t('metric.cpu')}</th>
            <th>{t('metric.memory')}</th>
            {settings.showDisk && <th>{t('metric.disk')}</th>}
            <th className="text-right">{t('skin.netSpeed')}</th>
            <th className="text-right">{t('skin.totalTraffic')}</th>
            {settings.showTraffic && <th className="text-right">{t('skin.quota')}</th>}
            {settings.showPing && <th className="text-right">{t('metric.latency')}</th>}
            {settings.showExpiry && <th className="text-right">{t('node.expires')}</th>}
          </tr>
        </thead>
        <tbody>
          {nodes.map((node) => {
            const { client } = node
            const facts = nodeFacts(node)
            const major = facts.issues.filter((issue) => !issue.minor)
            const first = major[0]
            const expiry = formatExpiry(client.expired_at)
            const myPing = pingTasks
              .map((task) => ({ task, value: pingValues[`${client.uuid}:${task.id}`] }))
              .filter((entry) => entry.value !== undefined)

            return (
              <tr key={client.uuid} className="km-ui-table-row">
                <td>
                  <Link
                    to={`/instance/${client.uuid}`}
                    className="flex items-center gap-2.5 text-km-text"
                  >
                    <RegionFlag region={client.region} />
                    <span className="min-w-0">
                      <b className="block font-semibold">{client.name}</b>
                      <span className="text-[12px] text-km-faint">
                        {client.os}，{client.cpu_cores} {t('metric.cores')}
                      </span>
                    </span>
                  </Link>
                </td>
                <td>
                  {/* 没问题时显示在线时长 —— 一行里总有东西，不留空格。 */}
                  {first ? (
                    <span
                      className={`km-s-badge km-s-badge-${first.level === 'bad' ? 'bad' : 'warn'}`}
                    >
                      {issueText(t, first, facts, units)}
                    </span>
                  ) : (
                    <span className="km-s-badge km-s-badge-ok km-s-num">
                      {uptimeText(facts, units)}
                    </span>
                  )}
                </td>
                <td>
                  <Cell percent={facts.cpu} />
                </td>
                <td>
                  <Cell percent={facts.mem} />
                </td>
                {settings.showDisk && (
                  <td>
                    <Cell percent={facts.disk} />
                  </td>
                )}
                <td className="km-s-num text-right">
                  {facts.online ? (
                    <>
                      <span className="block">&darr; {formatSpeed(facts.netIn)}</span>
                      <span className="block text-[12px] text-km-faint">
                        &uarr; {formatSpeed(facts.netOut)}
                      </span>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="km-s-num text-right">
                  <span className="block">&darr; {formatBytes(facts.totalDown, true)}</span>
                  <span className="block text-[12px] text-km-faint">
                    &uarr; {formatBytes(facts.totalUp, true)}
                  </span>
                </td>
                {settings.showTraffic && (
                  <td className="km-s-num text-right">
                    {facts.quota === null ? (
                      <span className="text-km-faint">{t('metric.unlimited')}</span>
                    ) : (
                      <b className={`font-semibold ${valueClass(facts.quota)}`}>
                        {Math.round(facts.quota)}%
                      </b>
                    )}
                  </td>
                )}
                {settings.showPing && (
                  <td className="km-s-num text-right">
                    {myPing.length === 0 ? (
                      <span className="text-km-faint">{t('skin.noPingTask')}</span>
                    ) : (
                      <span className="inline-flex gap-1.5">
                        {myPing.map(({ task, value }) => (
                          <span
                            key={task.id}
                            title={task.name}
                            // 负值是丢包的哨兵，绝不能当成毫秒显示出来。
                            className={value !== undefined && value < 0 ? 'km-s-text-bad' : ''}
                          >
                            {value !== undefined && value < 0
                              ? t('metric.timeout')
                              : Math.round(value ?? 0)}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                )}
                {settings.showExpiry && (
                  <td className="km-s-num text-right">
                    {expiry ? (
                      <span
                        className={
                          facts.daysLeft !== null && facts.daysLeft < 0
                            ? 'km-s-text-bad'
                            : facts.daysLeft !== null && facts.daysLeft <= 7
                              ? 'km-s-text-warn'
                              : ''
                        }
                      >
                        {expiry}
                      </span>
                    ) : (
                      <span className="text-km-faint">
                        {facts.longTerm ? t('node.longTerm') : t('node.never')}
                      </span>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default memo(SkinNodeTableInner)
