/**
 * 环形仪表。
 *
 * 进度靠 `stroke-dasharray` 表达：值圈的实线段长度 = 周长 × 百分比。整圈旋转
 * -90 度，让 0% 的起点落在正上方而不是右侧。
 *
 * 中心读数取整，环外另给一行「已用 / 总量」—— 环本身只表达比例，具体数字
 * 交给文字，两者分工不重叠。
 */

import { DISABLED_TONE_CLASS, valueToneClass } from '../lib/tone'
import type { MetricTone } from '../lib/tone'

/** viewBox 里的半径，与 stroke-width 一起决定环的粗细比例。 */
const RADIUS = 40
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

interface RingGaugeProps {
  label: string
  tone: MetricTone
  /** 传 null 渲染成禁用态，比如没开 swap 的节点。 */
  percent: number | null
  usedText: string
  totalText: string
  /** 环右侧的补充说明，比如 CPU 型号或剩余量。 */
  sub?: string
  /** 标签后缀，用于标注「已开启」这类状态。 */
  suffix?: string
}

export default function RingGauge({
  label,
  tone,
  percent,
  usedText,
  totalText,
  sub,
  suffix,
}: RingGaugeProps) {
  const disabled = percent === null
  const valueClass = disabled ? DISABLED_TONE_CLASS : valueToneClass(percent, tone)
  const filled = disabled ? 0 : (Math.min(percent, 100) / 100) * CIRCUMFERENCE

  return (
    <div className="km-card p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="km-label">
          {label}
          {suffix && <span className="ml-1 km-text-swap">{suffix}</span>}
        </span>
        <span className={`km-num text-[13px] font-semibold ${valueClass}`}>
          {disabled ? '—' : `${percent.toFixed(1)}%`}
        </span>
      </div>

      <div className="mt-2.5 flex items-center gap-3.5">
        <div className="relative size-[76px] shrink-0">
          <svg viewBox="0 0 96 96" className="size-full" aria-hidden="true">
            <circle
              cx="48"
              cy="48"
              r={RADIUS}
              fill="none"
              strokeWidth="7"
              className="stroke-km-track"
            />
            {!disabled && (
              <circle
                cx="48"
                cy="48"
                r={RADIUS}
                fill="none"
                strokeWidth="7"
                strokeLinecap="round"
                className={`origin-center -rotate-90 transition-[stroke-dasharray] duration-500
                  ${fillStrokeClass(tone)}`}
                strokeDasharray={`${filled.toFixed(1)} ${CIRCUMFERENCE.toFixed(1)}`}
              />
            )}
          </svg>
          {/*
           * 外层负责居中，内层负责基线对齐。
           * `place-items-center` 会把子元素排成网格行，直接把 % 放进去会掉到
           * 数字下面一行，所以百分号必须包在一个 flex 行里。
           */}
          <span className="absolute inset-0 grid place-items-center">
            <span
              className={`km-num flex items-baseline gap-px text-[17px] font-semibold
                ${valueClass}`}
            >
              {disabled ? '—' : percent.toFixed(0)}
              {!disabled && <i className="text-[10px] font-normal text-km-faint">%</i>}
            </span>
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="km-num truncate text-[13px] font-semibold">
            {usedText}
            {totalText && <span className="font-normal text-km-faint"> / {totalText}</span>}
          </p>
          {sub && <p className="mt-0.5 truncate text-[11.5px] text-km-faint">{sub}</p>}
        </div>
      </div>
    </div>
  )
}

/**
 * 环的描边色。
 *
 * 与仪表条一致：颜色只跟指标走，示警交给数值文字。SVG 描边要用 stroke-*
 * 工具类，`km-fill-*` 那套是 background-color，用在这里不生效。
 */
function fillStrokeClass(tone: MetricTone): string {
  const map: Record<MetricTone, string> = {
    cpu: 'stroke-km-cpu',
    mem: 'stroke-km-mem',
    disk: 'stroke-km-disk',
    swap: 'stroke-km-swap',
    quota: 'stroke-km-quota',
  }
  return map[tone]
}
