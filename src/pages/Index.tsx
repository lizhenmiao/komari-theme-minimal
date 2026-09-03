/**
 * 首页：汇总条 + 节点网格或表格。
 *
 * 视图选择属于访客，存在本地；运营者配置的 `defaultView` 只决定首次访问的
 * 初始值。
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSyncExternalStore } from 'react'

import NodeCard from '../components/NodeCard'
import NodeTable from '../components/NodeTable'
import Navbar from '../components/Navbar'
import { SkeletonGrid, SkeletonTable, SkeletonValue } from '../components/Skeleton'
import { useNodes, useGroups, useTotals } from '../hooks/useNodes'
import { useThemeSettings } from '../hooks/useThemeSettings'
import { formatBytes, formatSpeed } from '../lib/format'
import { authEntryOf } from '../lib/auth'
import { getState, subscribe } from '../lib/store'

const VIEW_STORAGE_KEY = 'km-minimal-view'
const GROUP_STORAGE_KEY = 'km-minimal-group'

/** 「全部」不是真实分组名，用空串表示，免得和某个叫「全部」的组撞名。 */
const ALL_GROUPS = ''

type View = 'grid' | 'table'

function readStoredView(): View | null {
  try {
    const raw = localStorage.getItem(VIEW_STORAGE_KEY)
    return raw === 'grid' || raw === 'table' ? raw : null
  } catch {
    return null
  }
}

function readStoredGroup(): string {
  try {
    return localStorage.getItem(GROUP_STORAGE_KEY) ?? ALL_GROUPS
  } catch {
    return ALL_GROUPS
  }
}

export default function Index() {
  const { t } = useTranslation()
  const settings = useThemeSettings()
  const nodes = useNodes(settings.featuredNodes)
  const totals = useTotals()
  const groups = useGroups()

  // 两个快照参数用同一个读取函数，原因见 hooks/useNodes.ts 的说明。
  const readPublicInfo = () => getState().publicInfo
  const readLoading = () => getState().loading
  const readPingTasks = () => getState().pingTasks
  const readPingLatest = () => getState().pingLatest
  const readViewer = () => getState().viewer

  const publicInfo = useSyncExternalStore(subscribe, readPublicInfo, readPublicInfo)
  const loading = useSyncExternalStore(subscribe, readLoading, readLoading)
  const allPingTasks = useSyncExternalStore(subscribe, readPingTasks, readPingTasks)
  const pingLatest = useSyncExternalStore(subscribe, readPingLatest, readPingLatest)
  const viewer = useSyncExternalStore(subscribe, readViewer, readViewer)

  const [view, setView] = useState<View | null>(readStoredView)
  const [group, setGroup] = useState<string>(readStoredGroup)

  // 访客没表达偏好之前，用运营者配置的默认值。
  const activeView: View = view ?? settings.defaultView

  const changeView = useCallback((next: View) => {
    setView(next)
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next)
    } catch {
      // 存不进去也要让本次会话生效。
    }
  }, [])

  const changeGroup = useCallback((next: string) => {
    setGroup(next)
    try {
      localStorage.setItem(GROUP_STORAGE_KEY, next)
    } catch {
      // 存不进去也要让本次会话生效。
    }
  }, [])

  /*
   * 选中的组可能已经不存在了（节点被移出或改名）。在派生时兜住而不是用 effect
   * 纠正 —— effect 里 setState 会多渲染一次，而且 store 更新时机不定容易抖。
   */
  const activeGroup = groups.some((entry) => entry.name === group) ? group : ALL_GROUPS

  const visibleNodes = useMemo(
    () =>
      activeGroup === ALL_GROUPS
        ? nodes
        : nodes.filter((node) => node.client.group?.trim() === activeGroup),
    [nodes, activeGroup],
  )

  useEffect(() => {
    document.documentElement.classList.add('km-page-index')
    return () => document.documentElement.classList.remove('km-page-index')
  }, [])

  /** 运营者勾选的子集；没勾就取全部任务的前几个。 */
  const cardTasks = useMemo(() => {
    if (settings.featuredPingTasks.length === 0) return allPingTasks.slice(0, 3)
    const wanted = new Set(settings.featuredPingTasks)
    return allPingTasks.filter((task) => wanted.has(task.id))
  }, [allPingTasks, settings.featuredPingTasks])

  const sitename = publicInfo?.sitename || 'Komari'

  /*
   * 首屏骨架的条件是「还在加载且一个节点都没有」。
   * 不能只看 loading —— 轮询期间它会反复置位，已有数据时退回骨架会整页闪。
   */
  const firstLoad = loading && nodes.length === 0

  return (
    <>
      <Navbar
        sitename={sitename}
        total={totals.total}
        online={totals.online}
        view={activeView}
        onViewChange={changeView}
        authEntry={authEntryOf(viewer)}
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
              onClick={() => changeGroup(ALL_GROUPS)}
            >
              {t('group.all')}
              <span className="km-num ml-1.5 opacity-60">{nodes.length}</span>
            </button>
            {groups.map((entry) => (
              <button
                key={entry.name}
                type="button"
                className={activeGroup === entry.name ? 'km-seg-on' : 'km-seg-off'}
                onClick={() => changeGroup(entry.name)}
              >
                {entry.name}
                <span className="km-num ml-1.5 opacity-60">{entry.count}</span>
              </button>
            ))}
          </div>
        )}

        {firstLoad && (activeView === 'grid' ? <SkeletonGrid /> : <SkeletonTable />)}

        {!loading && nodes.length === 0 && (
          <p className="py-16 text-center text-sm text-km-faint">{t('state.empty')}</p>
        )}

        {visibleNodes.length > 0 &&
          (activeView === 'grid' ? (
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
