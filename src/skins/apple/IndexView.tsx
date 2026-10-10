/**
 * Apple 皮肤的首页。
 *
 * 结构：毛玻璃顶栏 → 大标题与一句话摘要 → 汇总条 → 需要注意 → 节点卡片
 * 或表格。和经典皮肤的差别只在排版与配色，数据、开关、锚点类名全部一致。
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

export default function AppleIndexView(model: IndexModel) {
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
   * 大标题下的一句话摘要。有问题就说几台需要注意，没有就说全部正常。
   *
   * 这里只看 attention.length，不看 showAttention —— 那个开关只控制下面的
   * 「需要注意」板块显不显示，不该让摘要在关了板块后谎称「全部正常」。
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
      <main className="km-main km-page-index mx-auto max-w-[1340px] px-5 pt-9 pb-2 lg:px-7">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[40px] leading-[1.08] font-bold tracking-[-0.02em]">
              {t('skin.overview')}
            </h1>
            <p className="mt-2 text-[19px] leading-snug font-medium tracking-[-0.015em] text-km-dim">
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
             * 列数交给 auto-fill 自己算，不枚举断点。min(340px, 100%) 里的 100%
             * 是给窄于 340px 的视口兜底，否则单列会溢出容器。
             */
            <section
              className="km-index-grid grid gap-5"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))' }}
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
