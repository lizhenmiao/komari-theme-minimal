/**
 * 一个指标占三行：标签 + 百分比、满宽仪表条、下面一行已用靠左总量靠右。
 *
 * 绝对值不放在条两侧，条就能占满整列宽度 —— 四列布局下这点很关键。
 */

import { DISABLED_TONE_CLASS, fillToneClass, valueToneClass } from '../lib/tone'
import type { MetricTone } from '../lib/tone'

export type { MetricTone }

interface UsageBarProps {
  label: string
  tone: MetricTone
  /** 传 null 渲染成禁用行，比如没开 swap 的节点。 */
  percent: number | null
  usedText: string
  totalText: string
  /** 补充说明，显示在标签右侧，比如 CPU 的核数折算。 */
  detail?: string
}

export default function UsageBar({
  label,
  tone,
  percent,
  usedText,
  totalText,
  detail,
}: UsageBarProps) {
  const disabled = percent === null
  const valueClass = disabled ? DISABLED_TONE_CLASS : valueToneClass(percent, tone)

  return (
    <div className="km-ui-usage-bar">
      <div className="flex items-baseline gap-2 leading-tight">
        <span className="km-label w-[52px] shrink-0">{label}</span>
        {detail && <span className="km-num ml-auto text-[11px] text-km-faint">{detail}</span>}
        <span
          className={`km-num w-[46px] shrink-0 text-right text-[13px] font-semibold ${valueClass} ${
            detail ? '' : 'ml-auto'
          }`}
        >
          {disabled ? '—' : `${percent.toFixed(0)}%`}
        </span>
      </div>
      <div className="km-track mt-1">
        {!disabled && (
          <div
            className={`km-bar ${fillToneClass(tone)}`}
            style={{ width: `${Math.min(percent, 100).toFixed(1)}%` }}
          />
        )}
      </div>
      <div className="mt-0.5 flex items-baseline justify-between leading-tight">
        <span className={`km-num text-[12px] ${valueClass}`}>{usedText}</span>
        <span className="km-num text-[12px] text-km-faint">{totalText}</span>
      </div>
    </div>
  )
}
