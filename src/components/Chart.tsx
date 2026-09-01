/**
 * uPlot 封装。
 *
 * 两个关键点。一是 uPlot 在构造时就把颜色写进选项里，所以切换深浅色只能
 * 销毁重建，改样式没用。二是 `spanGaps` 保持 false：null 采样是真实信息
 * （一次丢失的 ping 探测），必须渲染成断口，不能连过去，也不能画成向下的尖刺。
 */

import { useEffect, useRef } from 'react'
import uPlot from 'uplot'

import 'uplot/dist/uPlot.min.css'

export interface ChartSeries {
  label: string
  /** null 会让线断开。 */
  data: (number | null)[]
  /** CSS 颜色值。由调用方解析，这样能跟随深浅色变化。 */
  stroke: string
  /** 一般只给第一条线填充；两处填充会让图变浑。 */
  fill?: string | undefined
  dash?: number[] | undefined
}

interface ChartProps {
  /** Unix 秒。 */
  timestamps: number[]
  series: ChartSeries[]
  /** 同时用于 y 轴刻度和十字准线的读数格式化。 */
  format: (value: number) => string
  height?: number
  /** 锁定 y 轴范围，比如百分比用 `[0, 100]`。 */
  range?: [number, number] | undefined
  /** 这个值变化会强制重建；传入解析后的深浅色。 */
  rebuildKey?: string
  axisColor: string
  gridColor: string
  lossLabel: string
}

export default function Chart({
  timestamps,
  series,
  format,
  height = 170,
  range,
  rebuildKey = '',
  axisColor,
  gridColor,
  lossLabel,
}: ChartProps) {
  const container = useRef<HTMLDivElement | null>(null)
  const plot = useRef<uPlot | null>(null)

  useEffect(() => {
    const element = container.current
    if (!element) return

    const options: uPlot.Options = {
      width: element.clientWidth || 320,
      height,
      padding: [8, 8, 0, 0],
      // 只要竖向准线；这个尺寸下横线只会增加视觉噪音。
      cursor: { y: false, points: { size: 6, width: 1 } },
      legend: { show: false },
      scales: range ? { y: { range } } : {},
      axes: [
        {
          stroke: axisColor,
          grid: { stroke: gridColor, width: 1 },
          ticks: { show: false },
          font: '12px ui-monospace, monospace',
          size: 30,
          space: 74,
        },
        {
          stroke: axisColor,
          grid: { stroke: gridColor, width: 1 },
          ticks: { show: false },
          font: '12px ui-monospace, monospace',
          size: 52,
          values: (_self, ticks) => ticks.map((tick) => format(tick)),
        },
      ],
      series: [
        { value: (_self, raw) => (raw == null ? '' : new Date(raw * 1000).toLocaleTimeString()) },
        ...series.map((entry) => ({
          label: entry.label,
          stroke: entry.stroke,
          width: 1.6,
          ...(entry.fill ? { fill: entry.fill } : {}),
          ...(entry.dash ? { dash: entry.dash } : {}),
          points: { show: false },
          spanGaps: false,
          value: (_self: uPlot, raw: number | null) => (raw == null ? lossLabel : format(raw)),
        })),
      ],
    }

    const data: uPlot.AlignedData = [
      timestamps,
      ...series.map((entry) => entry.data),
    ] as uPlot.AlignedData

    const instance = new uPlot(options, data, element)
    plot.current = instance

    const onResize = () => {
      instance.setSize({ width: element.clientWidth || 320, height })
    }
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      instance.destroy()
      plot.current = null
    }
    // uPlot 的颜色和几何尺寸都是构造时确定的，所以这里整体重建。
  }, [timestamps, series, format, height, range, rebuildKey, axisColor, gridColor, lossLabel])

  return <div ref={container} className="km-load-chart" style={{ height }} />
}
