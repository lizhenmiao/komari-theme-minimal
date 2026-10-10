/**
 * 迷你趋势图。
 *
 * 自绘 SVG 而不是引图表库：这里只画一条折线加一层渐变，不需要坐标轴、
 * 刻度、交互，用库反而要为关掉那些东西写更多配置。
 *
 * `viewBox` 固定逻辑尺寸配 `preserveAspectRatio="none"`，让曲线横向拉满
 * 容器宽度。线宽用 `vector-effect="non-scaling-stroke"` 抵消这个拉伸，
 * 否则线会被横向拉粗。
 */

const WIDTH = 300
const HEIGHT = 40
/** 上下留白，免得峰值和谷底贴着边缘看不清。 */
const PAD_TOP = 5
const PAD_BOTTOM = 3

interface SparklineProps {
  /** 时间正序的采样值，0-100。 */
  data: number[]
  /** 折线与渐变的颜色，传 CSS 颜色值或 `currentColor`。 */
  color: string
  /** 图上角的说明文字。 */
  label?: string
  /** 离线节点画成贴底的平线，不显示末点。 */
  dimmed?: boolean
  /**
   * 去掉边框盒子与标签、透明底、全宽铺满。给新皮肤用 —— 它们的卡片上方
   * 已经有大号 CPU 数字，不需要再套一个带标签的盒子。经典皮肤不传，保持原样。
   */
  bare?: boolean
  /** 像素高度，默认 40（等于经典皮肤原来的 h-10）。 */
  height?: number
}

export default function Sparkline({
  data,
  color,
  label,
  dimmed = false,
  bare = false,
  height = 40,
}: SparklineProps) {
  // 一个点画不出线段，两点起才有意义。
  if (data.length < 2) return null

  const step = WIDTH / (data.length - 1)
  const usable = HEIGHT - PAD_TOP - PAD_BOTTOM
  const points = data.map((value, index) => {
    const clamped = Math.min(Math.max(value, 0), 100)
    const x = index * step
    const y = HEIGHT - PAD_BOTTOM - (clamped / 100) * usable
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const line = `M${points.join('L')}`
  const area = `${line}L${WIDTH},${HEIGHT}L0,${HEIGHT}Z`
  const last = points[points.length - 1]?.split(',') ?? []

  // 同一页面上多个 spark 各自要有独立的渐变 id，否则后者会覆盖前者。
  const gradientId = `km-spark-${Math.abs(hash(data.join(','))).toString(36)}`

  const svg = (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className="block w-full"
      style={{ height: `${height}px` }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity={bare ? '0.22' : '0.3'} />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="1.4"
        vectorEffect="non-scaling-stroke"
        opacity={dimmed ? 0.5 : 1}
      />
      {!dimmed && last.length === 2 && (
        <circle cx={last[0]} cy={last[1]} r="2" fill={color} vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  )

  // 新皮肤：裸图，不套盒子也不加标签。
  if (bare) return <div className="relative overflow-hidden">{svg}</div>

  return (
    <div className="relative overflow-hidden rounded-md border km-hair bg-km-panel2">
      {label && (
        <span className="absolute top-1 left-2 z-[1] km-section text-[9.5px]">{label}</span>
      )}
      {svg}
    </div>
  )
}

/** 只用来生成稳定的渐变 id，不要求分布质量。 */
function hash(input: string): number {
  let value = 7
  for (let index = 0; index < input.length; index += 1) {
    value = (value * 33 + input.charCodeAt(index)) | 0
  }
  return value
}
