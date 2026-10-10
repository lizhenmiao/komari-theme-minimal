/**
 * 首页容器：取数据、算派生值、持有交互状态，然后交给当前皮肤排版。
 *
 * 视图选择属于访客，存在本地；运营者配置的 `defaultView` 只决定首次访问的
 * 初始值。风格则相反 —— 由运营者决定，访客没有切换入口。
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSyncExternalStore } from 'react'

import AppleIndexView from '../skins/apple/IndexView'
import ClassicIndexView from '../skins/classic/IndexView'
import VercelIndexView from '../skins/vercel/IndexView'
import { useNodes, useGroups, useTotals } from '../hooks/useNodes'
import { useThemeSettings } from '../hooks/useThemeSettings'
import { attentionList } from '../lib/attention'
import { authEntryOf } from '../lib/auth'
import { getState, subscribe } from '../lib/store'
import type { IndexModel, View } from '../skins/model'

const VIEW_STORAGE_KEY = 'km-minimal-view'
const GROUP_STORAGE_KEY = 'km-minimal-group'

/** 「全部」不是真实分组名，用空串表示，免得和某个叫「全部」的组撞名。 */
const ALL_GROUPS = ''

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

  /*
   * 「需要注意」算的是全部节点，不是当前分组：筛了 Oracle 组之后，另一个组
   * 里有台机器离线，照样该被看见。
   */
  const attention = useMemo(() => attentionList(nodes), [nodes])

  const sitename = publicInfo?.sitename || 'Komari'

  /*
   * 首屏骨架的条件是「还在加载且一个节点都没有」。
   * 不能只看 loading —— 轮询期间它会反复置位，已有数据时退回骨架会整页闪。
   */
  const firstLoad = loading && nodes.length === 0

  const model: IndexModel = {
    sitename,
    totals,
    authEntry: authEntryOf(viewer),
    settings,
    nodes,
    visibleNodes,
    groups,
    activeGroup,
    onGroupChange: changeGroup,
    view: activeView,
    onViewChange: changeView,
    cardTasks,
    pingLatest,
    attention,
    firstLoad,
    empty: !loading && nodes.length === 0,
  }

  if (settings.style === 'classic') return <ClassicIndexView {...model} />
  if (settings.style === 'vercel') return <VercelIndexView {...model} />
  return <AppleIndexView {...model} />
}
