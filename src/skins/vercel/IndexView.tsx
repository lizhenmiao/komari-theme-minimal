/**
 * Vercel 皮肤的首页。
 *
 * 结构：顶栏 → 标题与分组筛选 → 汇总条 → 需要注意 → 节点卡片或表格。
 * 和经典皮肤的差别只在排版与配色，数据、开关、锚点类名全部一致。
 */

import { useTranslation } from 'react-i18next'

import { SkeletonGrid, SkeletonTable } from '../../components/Skeleton'
import AttentionPanel from '../shared/AttentionPanel'
import GroupChips from '../shared/GroupChips'
import SkinNodeTable from '../shared/NodeTable'
import Summary from '../shared/Summary'
import Header from './Header'
import NodeCard from './NodeCard'
import type { IndexModel } from '../model'

export default function VercelIndexView(model: IndexModel) {
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
    attention,
    firstLoad,
    empty,
  } = model

  /*
   * 副标题顺带报出有几台需要注意。只看 attention.length，不看 showAttention ——
   * 那个开关只控制下面的「需要注意」板块显不显示，不该让副标题在关了板块后
   * 失去异常提示。和 Apple 概览一致。
   */
  const summaryLine = firstLoad
    ? ''
    : attention.length > 0
      ? t('attention.count', { count: attention.length })
      : t('attention.allGood')

  return (
    <>
      <Header
        sitename={sitename}
        authEntry={authEntry}
        view={view}
        onViewChange={onViewChange}
      />
      <main className="km-main km-page-index mx-auto max-w-[1400px] px-4 pt-7 pb-2 lg:px-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em]">
              {t('skin.overview')}
            </h1>
            <p className="mt-1 text-[14px] text-km-dim">
              {t('skin.nodeCount', { online: totals.online, total: totals.total })}
              {summaryLine && <span>，{summaryLine}</span>}
            </p>
          </div>
          <GroupChips
            groups={groups}
            active={activeGroup}
            total={nodes.length}
            onChange={onGroupChange}
          />
        </div>

        <Summary totals={totals} nodes={nodes} firstLoad={firstLoad} />

        {settings.showAttention && !firstLoad && <AttentionPanel entries={attention} />}

        {firstLoad && (view === 'grid' ? <SkeletonGrid /> : <SkeletonTable />)}

        {empty && <p className="py-16 text-center text-sm text-km-faint">{t('state.empty')}</p>}

        {visibleNodes.length > 0 &&
          (view === 'grid' ? (
            /*
             * 列数交给 auto-fill 自己算，不枚举断点。min(360px, 100%) 里的 100%
             * 是给窄于 360px 的视口兜底，否则单列会溢出容器。
             */
            <section
              className="km-index-grid grid gap-4"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(360px, 100%), 1fr))' }}
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
            <SkinNodeTable
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
