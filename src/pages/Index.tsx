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
import { useNodes, useTotals } from '../hooks/useNodes'
import { useThemeSettings } from '../hooks/useThemeSettings'
import { formatBytes, formatSpeed } from '../lib/format'
import { getState, subscribe } from '../lib/store'

const VIEW_STORAGE_KEY = 'km-minimal-view'

type View = 'grid' | 'table'

function readStoredView(): View | null {
  try {
    const raw = localStorage.getItem(VIEW_STORAGE_KEY)
    return raw === 'grid' || raw === 'table' ? raw : null
  } catch {
    return null
  }
}

export default function Index() {
  const { t } = useTranslation()
  const settings = useThemeSettings()
  const nodes = useNodes(settings.featuredNodes)
  const totals = useTotals()

  // 两个快照参数用同一个读取函数，原因见 hooks/useNodes.ts 的说明。
  const readPublicInfo = () => getState().publicInfo
  const readLoading = () => getState().loading
  const readPingTasks = () => getState().pingTasks
  const readPingLatest = () => getState().pingLatest

  const publicInfo = useSyncExternalStore(subscribe, readPublicInfo, readPublicInfo)
  const loading = useSyncExternalStore(subscribe, readLoading, readLoading)
  const allPingTasks = useSyncExternalStore(subscribe, readPingTasks, readPingTasks)
  const pingLatest = useSyncExternalStore(subscribe, readPingLatest, readPingLatest)

  const [view, setView] = useState<View | null>(readStoredView)

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

  return (
    <>
      <Navbar
        sitename={sitename}
        total={totals.total}
        online={totals.online}
        view={activeView}
        onViewChange={changeView}
      />

      <main className="km-main km-page-index mx-auto max-w-[1600px] px-4 py-5 sm:px-6">
        <section
          className="km-index-summary km-card mb-4 grid grid-cols-2 divide-slate-100 p-0
            sm:grid-cols-4 sm:divide-x dark:divide-slate-800"
        >
          <div className="px-4 py-3.5">
            <p className="km-label">{t('summary.nodes')}</p>
            <p className="km-num mt-1 text-2xl leading-tight font-semibold">
              {totals.online}
              <span className="text-sm font-normal text-slate-400">/{totals.total}</span>
            </p>
          </div>
          <div className="px-4 py-3.5">
            <p className="km-label">{t('summary.speed')}</p>
            <p className="km-num mt-1 text-[15px] leading-snug font-semibold">
              <span className="km-text-cpu">&uarr;</span> {formatSpeed(totals.netOut)}
              <span className="ml-1.5 km-text-quota">&darr;</span> {formatSpeed(totals.netIn)}
            </p>
          </div>
          <div className="px-4 py-3.5">
            <p className="km-label">{t('summary.traffic')}</p>
            <p className="km-num mt-1 text-[15px] leading-snug font-semibold">
              <span className="km-text-cpu">&uarr;</span> {formatBytes(totals.trafficUp)}
              <span className="ml-1.5 km-text-quota">&darr;</span> {formatBytes(totals.trafficDown)}
            </p>
          </div>
          <div className="px-4 py-3.5">
            <p className="km-label">{t('summary.load')}</p>
            <p className="km-num mt-1 text-2xl leading-tight font-semibold">
              {totals.averageLoad.toFixed(2)}
            </p>
          </div>
        </section>

        {loading && nodes.length === 0 && (
          <p className="py-16 text-center text-sm text-slate-400">{t('state.loading')}</p>
        )}

        {!loading && nodes.length === 0 && (
          <p className="py-16 text-center text-sm text-slate-400">{t('state.empty')}</p>
        )}

        {nodes.length > 0 &&
          (activeView === 'grid' ? (
            // 只在 1920px 以上开四列：1536px 时单卡宽度掉到 360px 左右，
            // 2x2 的指标格子会开始换行。
            <section
              className="km-index-grid grid gap-3 lg:grid-cols-2 2xl:grid-cols-3
                min-[1920px]:grid-cols-4"
            >
              {nodes.map((node) => {
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
              nodes={nodes}
              settings={settings}
              pingTasks={cardTasks}
              pingValues={pingLatest}
            />
          ))}
      </main>
    </>
  )
}
