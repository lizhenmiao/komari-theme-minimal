/**
 * uPlot 封装。
 *
 * 两个关键点。一是 uPlot 在构造时就把颜色写进选项里，所以切换深浅色只能
 * 销毁重建，改样式没用。二是 `spanGaps` 保持 false：null 采样是真实信息
 * （一次丢失的 ping 探测），必须渲染成断口，不能连过去，也不能画成向下的尖刺。
 */

import { useEffect, useRef } from 'react'
import uPlot from 'uplot'

import { tooltipPlugin } from '../lib/uplot-tooltip'

import 'uplot/dist/uPlot.min.css'

export interface ChartSeries {
  label: string
  /** null 会让线断开。 */
  data: (number | null)[]
  /** CSS 颜色值。由调用方解析，这样能跟随深浅色变化。 */
  stroke: string
  /** 只给第一条线填充；两处填充会让图变浑。传入时按纵向渐变绘制。 */
  fill?: string | undefined
  dash?: number[] | undefined
}

interface ChartProps {
  /** Unix 秒。 */
  timestamps: number[]
  series: ChartSeries[]
  /** 同时用于 y 轴刻度和十字准线的读数格式化。 */
  format: (value: number) => string
  /** y 轴刻度专用的短格式。轴外空间窄，`400.0 MB/s` 放不下。 */
  axisFormat?: ((value: number) => string) | undefined
  /** 十字准线上的时间标签。 */
  formatTime: (unixSeconds: number) => string
  height?: number
  /** 锁定 y 轴范围，比如百分比用 `[0, 100]`。 */
  range?: [number, number] | undefined
  /** 这个值变化会强制重建；传入解析后的深浅色与皮肤名。 */
  rebuildKey?: string
  axisColor: string
  gridColor: string
  /** 十字准线的竖线颜色。 */
  cursorColor: string
  lossLabel: string
  /**
   * 阈值染色。传入时，曲线越过 `warn` / `bad` 的那一段分别换色，并在两条
   * 高度上画虚线。只对锁定了 y 轴范围的占用类图表有意义 —— 没有固定范围的
   * 话，80% 这个高度会随数据峰值上下移动，染色就失去了参照。
   *
   * 经典皮肤不传，维持 1.0 的单色曲线。
   */
  thresholds?: ChartThresholds | undefined
}

export interface ChartThresholds {
  warn: number
  bad: number
  warnColor: string
  badColor: string
}

/**
 * 面积填充。
 *
 * uPlot 的 `fill` 接受一个取值函数，在这里拿到 canvas 上下文才能建渐变 ——
 * 传静态色值只能得到一整片实色，压住网格线。
 */
function areaFill(color: string) {
  return (self: uPlot) => {
    const ctx = self.ctx
    const top = self.bbox.top
    const gradient = ctx.createLinearGradient(0, top, 0, top + self.bbox.height)
    gradient.addColorStop(0, withAlpha(color, 0.26))
    gradient.addColorStop(1, withAlpha(color, 0))
    return gradient
  }
}

/**
 * 按阈值分段的描边。
 *
 * uPlot 的 `stroke` 和 `fill` 一样接受取值函数，在那里才拿得到 canvas 上下文。
 * 做法是建一个纵向渐变，在 warn 与 bad 对应的像素高度上各放一对同位置、不同
 * 颜色的色标 —— 两个 offset 相同的 stop 之间不会插值，于是得到硬边界，效果
 * 等同于把曲线按高度裁成三段分别着色，但只画一遍。
 */
function thresholdStroke(base: string, thresholds: ChartThresholds) {
  return (self: uPlot) => {
    const { top, height } = self.bbox
    const ctx = self.ctx
    const gradient = ctx.createLinearGradient(0, top, 0, top + height)

    /*
     * 值 → 渐变偏移。valToPos 的 canvas 空间坐标已经含了 top，所以要减掉再
     * 除以高度。夹到 [0,1]：阈值可能落在可视范围之外（比如负载图），
     * 超出范围的 offset 会被 addColorStop 判为非法并抛错。
     */
    const offsetOf = (value: number) => {
      const pos = self.valToPos(value, 'y', true)
      return Math.min(Math.max((pos - top) / height, 0), 1)
    }

    const badAt = offsetOf(thresholds.bad)
    const warnAt = offsetOf(thresholds.warn)

    // 从上往下：bad 段、warn 段、正常段。
    gradient.addColorStop(0, thresholds.badColor)
    gradient.addColorStop(badAt, thresholds.badColor)
    gradient.addColorStop(badAt, thresholds.warnColor)
    gradient.addColorStop(warnAt, thresholds.warnColor)
    gradient.addColorStop(warnAt, base)
    gradient.addColorStop(1, base)
    return gradient
  }
}

/** 把令牌解析出的 rgb()/hex 颜色调成半透明。 */
function withAlpha(color: string, alpha: number): string {
  const trimmed = color.trim()

  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1)
    const full =
      hex.length === 3
        ? hex
            .split('')
            .map((ch) => ch + ch)
            .join('')
        : hex
    const value = Number.parseInt(full, 16)
    const r = (value >> 16) & 255
    const g = (value >> 8) & 255
    const b = value & 255
    return `rgba(${r},${g},${b},${alpha})`
  }

  // getComputedStyle 解析出来的通常是 rgb(a, b, c) 形式。
  const nums = trimmed.match(/[\d.]+/g)
  if (nums && nums.length >= 3) {
    return `rgba(${nums[0]},${nums[1]},${nums[2]},${alpha})`
  }

  return trimmed
}

export default function Chart({
  timestamps,
  series,
  format,
  axisFormat,
  formatTime,
  height = 170,
  range,
  rebuildKey = '',
  axisColor,
  gridColor,
  cursorColor,
  lossLabel,
  thresholds,
}: ChartProps) {
  const container = useRef<HTMLDivElement | null>(null)
  const plot = useRef<uPlot | null>(null)

  useEffect(() => {
    const element = container.current
    if (!element) return

    const tickFormat = axisFormat ?? format

    const options: uPlot.Options = {
      width: element.clientWidth || 320,
      height,
      padding: [10, 10, 0, 0],
      // 只要竖向准线；这个尺寸下横线只会增加视觉噪音。
      cursor: {
        y: false,
        /*
         * 点的颜色从 series 数组取，不从 `self.series[i].stroke` 取 ——
         * 开了阈值染色之后那个字段是个函数，赋给 fillStyle 会被当成非法值。
         */
        points: {
          size: 7,
          width: 2,
          fill: (_self, i) => series[i - 1]?.stroke ?? axisColor,
        },
      },
      legend: { show: false },
      scales: range ? { y: { range } } : {},
      hooks: thresholds
        ? {
            // 虚线画在网格之后、曲线之前，不盖住数据。
            draw: [
              (self: uPlot) => {
                const ctx = self.ctx
                const { left, width } = self.bbox
                ctx.save()
                ctx.setLineDash([3, 4])
                ctx.lineWidth = 1
                for (const [value, color] of [
                  [thresholds.warn, thresholds.warnColor],
                  [thresholds.bad, thresholds.badColor],
                ] as const) {
                  const y = self.valToPos(value, 'y', true)
                  // 阈值落在可视范围外就不画，否则虚线会贴在图框边上。
                  if (y < self.bbox.top || y > self.bbox.top + self.bbox.height) continue
                  ctx.strokeStyle = color
                  ctx.globalAlpha = 0.55
                  ctx.beginPath()
                  ctx.moveTo(left, y)
                  ctx.lineTo(left + width, y)
                  ctx.stroke()
                }
                ctx.restore()
              },
            ],
          }
        : {},
      axes: [
        {
          stroke: axisColor,
          grid: { show: false },
          ticks: { show: false },
          font: '10px ui-monospace, monospace',
          size: 24,
          space: 74,
        },
        {
          stroke: axisColor,
          grid: { stroke: gridColor, width: 1 },
          ticks: { show: false },
          font: '10px ui-monospace, monospace',
          size: 46,
          values: (_self, ticks) => ticks.map((tick) => tickFormat(tick)),
        },
      ],
      series: [
        { value: (_self, raw) => (raw == null ? '' : formatTime(raw)) },
        ...series.map((entry, index) => ({
          label: entry.label,
          // 只给第一条线分段染色：两条线都染，就看不出哪段属于哪条。
          stroke:
            thresholds && index === 0 ? thresholdStroke(entry.stroke, thresholds) : entry.stroke,
          width: 1.5,
          // 辉光下衬：同一条线加粗铺一层低透明度，让主线从背景里浮出来。
          ...(index === 0 ? { shadow: true } : {}),
          ...(entry.fill ? { fill: areaFill(entry.stroke) } : {}),
          ...(entry.dash ? { dash: entry.dash } : {}),
          points: { show: false },
          spanGaps: false,
          value: (_self: uPlot, raw: number | null) => (raw == null ? lossLabel : format(raw)),
        })),
      ],
      plugins: [
        tooltipPlugin({
          strokes: series.map((entry) => entry.stroke),
          format,
          formatTime,
          lossLabel,
        }),
      ],
    }

    const data: uPlot.AlignedData = [
      timestamps,
      ...series.map((entry) => entry.data),
    ] as uPlot.AlignedData

    const instance = new uPlot(options, data, element)
    plot.current = instance

    // 竖线颜色只能从 CSS 改，options 里没有对应字段。
    const cursorLine = element.querySelector<HTMLElement>('.u-cursor-x')
    if (cursorLine) {
      cursorLine.style.borderRight = `1px dashed ${cursorColor}`
    }

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
  }, [
    timestamps,
    series,
    format,
    axisFormat,
    formatTime,
    height,
    range,
    rebuildKey,
    axisColor,
    gridColor,
    cursorColor,
    lossLabel,
    thresholds,
  ])

  return <div ref={container} className="km-load-chart relative" style={{ height }} />
}
