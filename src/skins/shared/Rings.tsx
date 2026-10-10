/**
 * Apple Watch 式同心环。
 *
 * 环色只表达状态：平时走系统蓝 / 靛 / 青三色区分指标，越过阈值的那一环转橙
 * 或转红。轨道是同色 18% 透明，不另外定义灰色轨道变量。
 */

import { levelOf } from './Meter'

export interface RingItem {
  /** null 表示没有数据，只画轨道不画弧。 */
  percent: number | null
  /** 常态下的颜色，CSS 颜色值或 `var()`。 */
  color: string
}

interface RingsProps {
  items: RingItem[]
  size?: number
  stroke?: number
  /** 环与环之间的间隙。 */
  gap?: number
}

/** 越过阈值就换成告警色，否则用指标自己的颜色。 */
function colorOf(item: RingItem): string {
  const level = levelOf(item.percent)
  if (level === 'bad') return 'var(--color-km-bad)'
  if (level === 'warn') return 'var(--color-km-warn)'
  return item.color
}

export default function Rings({ items, size = 104, stroke = 10, gap = 2.5 }: RingsProps) {
  const center = size / 2

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="km-ui-rings shrink-0"
      aria-hidden="true"
    >
      {items.map((item, index) => {
        const radius = center - stroke / 2 - index * (stroke + gap)
        // 半径收到 0 以下说明环太多或尺寸太小，画出来是一团墨点，不如不画。
        if (radius <= stroke / 2) return null
        const circumference = 2 * Math.PI * radius
        const color = colorOf(item)
        /*
         * 下限 0.5%：圆头线帽在长度为 0 时会退化成一个点，看起来像「有一点点
         * 占用」。真的没有数据（null）走下面的分支，整条弧不画。
         */
        const value =
          item.percent === null ? null : Math.min(Math.max(item.percent, 0.5), 100)

        return (
          <g key={index}>
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={color}
              strokeOpacity={0.18}
              strokeWidth={stroke}
            />
            {value !== null && (
              <circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={color}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${((value / 100) * circumference).toFixed(2)} ${circumference.toFixed(2)}`}
                // 从十二点钟方向开始，顺时针。
                transform={`rotate(-90 ${center} ${center})`}
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}
