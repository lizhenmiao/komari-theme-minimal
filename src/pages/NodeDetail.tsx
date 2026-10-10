/**
 * 详情页容器：取数据、解析曲线颜色、装配图表声明，然后交给当前皮肤排版。
 *
 * 曲线颜色在这里解析而不是在图表组件里，因为 uPlot 在构造时就需要具体的 CSS
 * 颜色值，而这些值要跟随深浅色与皮肤变化。
 *
 * 三套皮肤共用同一批序列与格式化函数，所以同一条曲线的数值在任何皮肤下都
 * 一致，差异只在容器与配色令牌。
 */

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { useSyncExternalStore } from 'react'

import AppleDetailView from '../skins/apple/DetailView'
import ClassicDetailView from '../skins/classic/DetailView'
import VercelDetailView from '../skins/vercel/DetailView'
import { useAppearance } from '../hooks/useAppearance'
import { useAppliedSkin } from '../hooks/useSkin'
import { useNode, useTotals } from '../hooks/useNodes'
import { useNodeHistory } from '../hooks/useNodeHistory'
import { usePingStats } from '../hooks/usePingStats'
import { useThemeSettings } from '../hooks/useThemeSettings'
import { formatBytes, formatSpeed } from '../lib/format'
import { authEntryOf } from '../lib/auth'
import { getState, subscribe } from '../lib/store'
import { clearTokenCache, metricColor } from '../lib/tokens'
import type { RangeKey } from '../hooks/useNodeHistory'
import type { ChartSeries } from '../components/Chart'
import type { ChartSpec, DetailModel } from '../skins/model'

const RANGES: readonly RangeKey[] = ['1h', '4h', '24h', '7d', '30d']

export default function NodeDetail() {
  const { t } = useTranslation()
  const { uuid = '' } = useParams<{ uuid: string }>()
  const settings = useThemeSettings()
  const node = useNode(uuid)
  const totals = useTotals()
  const { resolved } = useAppearance(settings.defaultAppearance)

  const [range, setRange] = useState<RangeKey>(() => {
    // 用运营者配置的时间窗口作初值，就近吸附到某个选项。
    const hours = settings.historyHours
    if (hours <= 1) return '1h'
    if (hours <= 4) return '4h'
    if (hours <= 24) return '24h'
    if (hours <= 168) return '7d'
    return '30d'
  })

  const { history, loading } = useNodeHistory(uuid, range, settings.maxPoints)

  // 两个快照参数用同一个读取函数，原因见 hooks/useNodes.ts 的说明。
  const readPublicInfo = () => getState().publicInfo
  const readPingTasks = () => getState().pingTasks
  const readViewer = () => getState().viewer

  const publicInfo = useSyncExternalStore(subscribe, readPublicInfo, readPublicInfo)
  const allPingTasks = useSyncExternalStore(subscribe, readPingTasks, readPingTasks)
  const viewer = useSyncExternalStore(subscribe, readViewer, readViewer)

  const pingTaskIds = useMemo(() => allPingTasks.map((task) => task.id), [allPingTasks])
  const { series: ping } = usePingStats(
    uuid,
    pingTaskIds,
    range,
    settings.maxPoints,
    settings.showPing,
  )

  useEffect(() => {
    document.documentElement.classList.add('km-page-instance')
    return () => document.documentElement.classList.remove('km-page-instance')
  }, [])

  /*
   * 曲线颜色从 CSS 令牌读计算值：uPlot 只认具体颜色字符串，`var()` 传给
   * canvas 会被当成非法值忽略。深浅色或皮肤切换时同一个令牌解析出不同的值，
   * 所以缓存要先清掉，再把两者一起作为重建键传给图表。
   *
   * 这里跟的是 `useAppliedSkin()`（真正写在 `<html>` 上的那个），不是
   * `settings.style`。设置刚到达的那一次渲染里后者已经变了、DOM 属性还没写，
   * 此时读令牌会拿到上一套皮肤的颜色并缓存下来 —— 详见 hooks/useSkin.ts。
   */
  const skin = useAppliedSkin()
  const colors = useMemo(() => {
    clearTokenCache()
    return {
      cpu: metricColor('cpu'),
      mem: metricColor('mem'),
      swap: metricColor('swap'),
      disk: metricColor('disk'),
      up: metricColor('up'),
      down: metricColor('down'),
      warn: metricColor('warn'),
      // 延迟图每条线路一条线，专用的区分色见 index.css 的说明。
      series: [metricColor('series1'), metricColor('series2'), metricColor('series3')],
      axis: metricColor('faint'),
      grid: metricColor('track'),
      cursor: metricColor('border2'),
    }
  }, [resolved, skin])

  const percentFormat = useMemo(() => (value: number) => `${value.toFixed(0)}%`, [])
  const loadFormat = useMemo(() => (value: number) => value.toFixed(2), [])
  const speedFormat = useMemo(() => (value: number) => formatSpeed(value), [])
  const msFormat = useMemo(() => (value: number) => `${value.toFixed(0)}ms`, [])
  /** y 轴用短单位：轴外只有 46px，`400.0 MB/s` 会被截断。 */
  const speedAxisFormat = useMemo(() => (value: number) => formatBytes(value, true), [])

  /**
   * 十字准线的时间标签。跨度大于一天时补上日期，否则 24h 与 30d 两档的读数
   * 完全无法区分是哪一天。
   */
  const timeFormat = useMemo(() => {
    const longSpan = range === '7d' || range === '30d'
    return (unixSeconds: number) => {
      const date = new Date(unixSeconds * 1000)
      const pad = (n: number) => String(n).padStart(2, '0')
      const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`
      return longSpan ? `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${clock}` : clock
    }
  }, [range])

  const pingSeries = useMemo<ChartSeries[]>(() => {
    const tones = colors.series
    return allPingTasks
      .map((task, index) => {
        const data = ping.byTask[task.id]
        if (!data) return null
        return {
          label: task.name,
          data,
          // 用 || 而不是 ??：令牌缺失时读出来的是空串，不是 undefined。
          stroke: tones[index % tones.length] || colors.cpu,
        }
      })
      .filter((entry): entry is ChartSeries => entry !== null)
  }, [allPingTasks, ping.byTask, colors])

  /*
   * 图表声明。经典皮肤不开阈值染色（threshold），维持 1.0 的样子；
   * 另两套皮肤在越过 75 / 90 的线段上换色。
   */
  const charts = useMemo<ChartSpec[]>(() => {
    const threshold = skin !== 'classic'
    const specs: ChartSpec[] = [
      {
        key: 'cpu',
        title: t('metric.cpu'),
        timestamps: history.timestamps,
        series: [
          { label: t('metric.cpu'), data: history.values.cpu, stroke: colors.cpu, fill: colors.cpu },
        ],
        format: percentFormat,
        range: [0, 100],
        threshold,
      },
      {
        key: 'mem',
        title: t('detail.memorySwap'),
        timestamps: history.timestamps,
        series: [
          {
            label: t('metric.memory'),
            data: history.values.ram,
            stroke: colors.mem,
            fill: colors.mem,
          },
          { label: t('metric.swap'), data: history.values.swap, stroke: colors.swap },
        ],
        format: percentFormat,
        range: [0, 100],
        threshold,
      },
      {
        key: 'disk',
        title: t('metric.disk'),
        timestamps: history.timestamps,
        series: [
          {
            label: t('metric.disk'),
            data: history.values.disk,
            stroke: colors.disk,
            fill: colors.disk,
          },
        ],
        format: percentFormat,
        range: [0, 100],
        threshold,
      },
      {
        key: 'net',
        title: t('detail.network'),
        timestamps: history.timestamps,
        series: [
          {
            label: t('metric.download'),
            data: history.values.net_in,
            stroke: colors.down,
            fill: colors.down,
          },
          { label: t('metric.upload'), data: history.values.net_out, stroke: colors.up },
        ],
        format: speedFormat,
        axisFormat: speedAxisFormat,
      },
      {
        key: 'load',
        title: t('metric.load'),
        timestamps: history.timestamps,
        series: [
          {
            /*
             * 经典皮肤用告警琥珀，和 1.0 逐位一致。新皮肤的告警色专门留给
             * 「越过阈值」，负载图没有百分比阈值可依，所以走中性主色。
             */
            label: t('metric.load'),
            data: history.values.load,
            stroke: threshold ? colors.cpu : colors.warn,
            fill: threshold ? colors.cpu : colors.warn,
          },
        ],
        format: loadFormat,
      },
    ]

    if (settings.showPing && pingSeries.length > 0) {
      specs.push({
        key: 'ping',
        title: t('metric.latency'),
        note: t('detail.lossGap'),
        timestamps: ping.timestamps,
        series: pingSeries,
        format: msFormat,
      })
    }

    return specs
  }, [
    skin,
    history,
    colors,
    pingSeries,
    ping.timestamps,
    settings.showPing,
    percentFormat,
    speedFormat,
    speedAxisFormat,
    loadFormat,
    msFormat,
    t,
  ])

  const model: DetailModel = {
    sitename: publicInfo?.sitename || 'Komari',
    totals,
    authEntry: authEntryOf(viewer),
    settings,
    node,
    range,
    ranges: RANGES,
    onRangeChange: setRange,
    history,
    historyLoading: loading,
    ping,
    charts,
    chartChrome: {
      axisColor: colors.axis,
      gridColor: colors.grid,
      cursorColor: colors.cursor,
      formatTime: timeFormat,
      // 皮肤也要进重建键：同名令牌在另一套皮肤下是另一个颜色。
      rebuildKey: `${skin}-${resolved}`,
      lossLabel: t('metric.loss'),
    },
  }

  // 选哪套视图跟着设置走；颜色跟着已生效的皮肤走，两者在设置到达那一帧会
  // 短暂不同步，下一帧收敛。
  if (settings.style === 'classic') return <ClassicDetailView {...model} />
  if (settings.style === 'vercel') return <VercelDetailView {...model} />
  return <AppleDetailView {...model} />
}
