/**
 * 应用外壳：背景层、路由、页脚、传输层生命周期。
 *
 * 只有两条路由。`/admin` 和 `/terminal` 在这里永不匹配 —— 那两个属于 Komari
 * 内置 UI，主题不能遮挡 —— 未知路径统一重定向回首页，而不是自己渲染 404。
 */

import { useEffect, useSyncExternalStore } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import Footer from './components/Footer'
import { useThemeSettings } from './hooks/useThemeSettings'
import { configureTransport, startTransport, stopTransport } from './lib/transport'
import { getState, subscribe } from './lib/store'
import Index from './pages/Index'
import NodeDetail from './pages/NodeDetail'
import './i18n'

/** 设置加载完成后，把运营者配置的轮询间隔推给传输层。 */
function TransportConfigurator() {
  const settings = useThemeSettings()
  useEffect(() => {
    configureTransport({ refreshIntervalSeconds: settings.refreshInterval })
  }, [settings.refreshInterval])
  return null
}

function ThemedFooter() {
  const settings = useThemeSettings()
  return <Footer html={settings.footerHtml} />
}

/** 文档标题跟随运营者配置的站点名。 */
function DocumentTitle() {
  const readSitename = () => getState().publicInfo?.sitename ?? ''
  const sitename = useSyncExternalStore(subscribe, readSitename, readSitename)
  useEffect(() => {
    if (sitename) document.title = sitename
  }, [sitename])
  return null
}

export default function App() {
  useEffect(() => {
    void startTransport()
    return () => stopTransport()
  }, [])

  return (
    /*
     * 显式启用 v7 的两个行为标志。
     *
     * React Router 6 会为未启用的标志无条件打 console.warn（`warnOnce` 里没有
     * 环境判断），生产构建里同样会出现，所以不能靠「只是开发态噪音」放过。
     *
     * v7_startTransition 把路由状态更新包进 React.startTransition。store 走的是
     * useSyncExternalStore，那个 hook 本身强制同步渲染以避免撕裂，不参与
     * transition，两者不冲突。
     *
     * v7_relativeSplatPath 改的是 splat 路由内部的相对路径解析。下面的 `*`
     * 路由跳的是绝对路径 `/`，不受影响。
     */
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {/* 纯装饰层：固定定位且不接收事件，绝不会吃掉点击。 */}
      <div className="km-bg" aria-hidden="true">
        <i className="km-blob km-blob-a" />
        <i className="km-blob km-blob-b" />
      </div>

      <TransportConfigurator />
      <DocumentTitle />

      <div className="km-layout flex min-h-dvh flex-col">
        <div className="flex-1">
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/instance/:uuid" element={<NodeDetail />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
        <ThemedFooter />
      </div>
    </BrowserRouter>
  )
}
