/**
 * 经典皮肤的首页：汇总条 + 节点网格或表格。
 *
 * 这是 1.0 版 `pages/Index.tsx` 的 JSX 原样搬移，刻意不做任何视觉调整 ——
 * 已经装了这个主题的站点把风格选回 classic 时，看到的必须和升级前一样。
 * 取数据与派生值已经上移到 `pages/Index.tsx`，这里只消费模型。
 */

import { useTranslation } from 'react-i18next'

import NodeCard from '../../components/NodeCard'
import NodeTable from '../../components/NodeTable'
import Navbar from '../../components/Navbar'
import { SkeletonGrid, SkeletonTable, SkeletonValue } from '../../components/Skeleton'
import { formatBytes, formatSpeed } from '../../lib/format'
import type { IndexModel } from '../model'

/** 「全部」不是真实分组名，用空串表示，免得和某个叫「全部」的组撞名。 */
const ALL_GROUPS = ''

export default function ClassicIndexView(model: IndexModel) {
  const { t } = useTranslation()
  const {
    sitename,
    totals,
    authEntry,
    settings,
    nodes,
    visibleNodes,
    groups,
    activeGroup,
    onGroupChange,
    view,
    onViewChange,
    cardTasks,
    pingLatest,
    firstLoad,
    empty,
  } = model

  return (
    <>
      <Navbar
        sitename={sitename}
        total={totals.total}
        online={totals.online}
        view={view}
        onViewChange={onViewChange}
        authEntry={authEntry}
      />
      <main className="km-main km-page-index mx-auto max-w-[1560px] px-3.5 pt-4.5 pb-2 lg:px-5">
        {/*
         * overflow-hidden 是必需的：分隔线用子元素的 border 画，不裁切的话
         * 直角边会露在面板圆角外面。
         */}
        <section
          className="km-index-summary km-card mb-3.5 grid grid-cols-2 overflow-hidden
            sm:grid-cols-4"
        >
          <div className="km-scell">
            <p className="km-label">{t('summary.nodes')}</p>
            {firstLoad ? (
              <SkeletonValue />
            ) : (
              <p className="km-num mt-1 text-[18px] leading-tight font-[650]">
                {totals.online}
                <span className="text-km-faint"> / {totals.total}</span>
              </p>
            )}
          </div>
          <div className="km-scell">
            <p className="km-label">{t('summary.speed')}</p>
            {firstLoad ? (
              <SkeletonValue />
            ) : (
              <p className="km-num mt-1 text-[15px] leading-snug font-[650]">
                <span className="km-text-up">&uarr;</span> {formatSpeed(totals.netOut)}
                <span className="ml-2 km-text-down">&darr;</span> {formatSpeed(totals.netIn)}
              </p>
            )}
          </div>
          <div className="km-scell">
            <p className="km-label">{t('summary.traffic')}</p>
            {firstLoad ? (
              <SkeletonValue />
            ) : (
              <p className="km-num mt-1 text-[15px] leading-snug font-[650]">
                <span className="km-text-up">&uarr;</span> {formatBytes(totals.trafficUp)}
                <span className="ml-2 km-text-down">&darr;</span>{' '}
                {formatBytes(totals.trafficDown)}
              </p>
            )}
          </div>
          <div className="km-scell">
            <p className="km-label">{t('summary.load')}</p>
            {firstLoad ? (
              <SkeletonValue />
            ) : (
              <p className="km-num mt-1 text-[18px] leading-tight font-[650]">
                {totals.averageLoad.toFixed(2)}
              </p>
            )}
          </div>
        </section>

        {/*
         * 分组筛选。用芯片而不是分区块：真实实例上常见「几个组各只有一台」的
         * 分布，每组一个标题会把页面拉得很长，而芯片不打断网格。
         *
         * 所有节点都没分组时整行不渲染，不留一个只有「全部」的空壳。
         */}
        {groups.length > 0 && !firstLoad && (
          <div className="km-index-groups mb-3.5 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              className={activeGroup === ALL_GROUPS ? 'km-seg-on' : 'km-seg-off'}
              onClick={() => onGroupChange(ALL_GROUPS)}
            >
              {t('group.all')}
              <span className="km-num ml-1.5 opacity-60">{nodes.length}</span>
            </button>
            {groups.map((entry) => (
              <button
                key={entry.name}
                type="button"
                className={activeGroup === entry.name ? 'km-seg-on' : 'km-seg-off'}
                onClick={() => onGroupChange(entry.name)}
              >
                {entry.name}
                <span className="km-num ml-1.5 opacity-60">{entry.count}</span>
              </button>
            ))}
          </div>
        )}

        {firstLoad && (view === 'grid' ? <SkeletonGrid /> : <SkeletonTable />)}

        {empty && <p className="py-16 text-center text-sm text-km-faint">{t('state.empty')}</p>}

        {visibleNodes.length > 0 &&
          (view === 'grid' ? (
            /*
             * 列数交给 auto-fill 自己算，不枚举断点。min(370px, 100%) 里的 100%
             * 是给窄于 370px 的视口兜底，否则单列会溢出容器。
             */
            <section
              className="km-index-grid grid gap-3"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(370px, 100%), 1fr))' }}
            >
              {visibleNodes.map((node) => {
                const values: Record<number, number | undefined> = {}
                for (const task of cardTasks) {
                  values[task.id] = pingLatest[`${node.client.uuid}:${task.id}`]
                }
                return (
                  <NodeCard
                    key={node.client.uuid}
                    node={node}
                    settings={settings}
                    pingTasks={cardTasks}
                    pingValues={values}
                  />
                )
              })}
            </section>
          ) : (
            <NodeTable
              nodes={visibleNodes}
              settings={settings}
              pingTasks={cardTasks}
              pingValues={pingLatest}
            />
          ))}
      </main>
    </>
  )
}
