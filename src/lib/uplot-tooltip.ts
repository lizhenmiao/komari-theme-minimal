/**
 * 十字准线读数浮层。
 *
 * uPlot 自带的 legend 只能显示在图外，且样式受限。这里改成跟随光标的浮层：
 * 顶部一行时间，下面每条 series 一行「色点 标签 值」。
 *
 * 浮层贴着光标右侧，靠近右边缘时翻到左侧 —— 否则会被绘图区裁掉，正好在
 * 最需要读数的位置看不见。
 */

import type uPlot from 'uplot'

export interface TooltipOptions {
  /** 每条 series 的取色，与主线颜色一致。 */
  strokes: string[]
  /** 数值格式化，与 y 轴共用一套。 */
  format: (value: number) => string
  /** 时间轴标签。 */
  formatTime: (unixSeconds: number) => string
  /** 采样缺失时的文案，表示这一刻探测丢了。 */
  lossLabel: string
}

/** 浮层与光标的水平间距。 */
const GAP = 12

export function tooltipPlugin(options: TooltipOptions): uPlot.Plugin {
  let root: HTMLDivElement | null = null

  return {
    hooks: {
      init: (self: uPlot) => {
        root = document.createElement('div')
        root.className = 'km-chart-tip km-num'
        self.over.appendChild(root)

        // 光标离开绘图区就收起，否则会残留在最后的位置上。
        self.over.addEventListener('mouseleave', () => {
          if (root) root.style.display = 'none'
        })
      },

      setCursor: (self: uPlot) => {
        if (!root) return

        const { idx, left, top } = self.cursor
        if (idx == null || left == null || top == null || left < 0 || top < 0) {
          root.style.display = 'none'
          return
        }

        const stamp = self.data[0]?.[idx]
        if (stamp == null) {
          root.style.display = 'none'
          return
        }

        const rows: string[] = [
          `<div class="km-chart-tip-time">${options.formatTime(Number(stamp))}</div>`,
        ]

        for (let seriesIndex = 1; seriesIndex < self.series.length; seriesIndex += 1) {
          const series = self.series[seriesIndex]
          if (!series?.show) continue

          const raw = self.data[seriesIndex]?.[idx]
          const color = options.strokes[seriesIndex - 1] ?? 'currentColor'
          const label = series.label ?? ''

          // null 不是 0：那一刻没有采样，读数要说明「丢了」而不是显示一个值。
          const missing = raw == null
          const value = missing ? options.lossLabel : options.format(Number(raw))

          rows.push(
            `<div class="km-chart-tip-row">` +
              `<i style="background:${color}${missing ? ';opacity:.4' : ''}"></i>` +
              `<span>${label}</span>` +
              `<b${missing ? ' class="km-chart-tip-missing"' : ''}>${value}</b>` +
              `</div>`,
          )
        }

        root.innerHTML = rows.join('')
        root.style.display = 'block'

        // 先显示再量宽度，否则 offsetWidth 是 0，翻转判断永远不成立。
        const width = root.offsetWidth
        const flip = left + GAP + width > self.over.clientWidth
        root.style.left = `${flip ? left - width - GAP : left + GAP}px`
      },

      destroy: () => {
        root?.remove()
        root = null
      },
    },
  }
}
