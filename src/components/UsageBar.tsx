/**
 * 一个指标占三行：标签 + 百分比、满宽进度条、下面一行已用靠左总量靠右。
 *
 * 绝对值不放在进度条两侧，条就能占满整列宽度 —— 四列布局下这点很关键。
 */

export type MetricTone = 'cpu' | 'mem' | 'disk' | 'swap' | 'quota'

interface UsageBarProps {
  label: string
  tone: MetricTone
  /** 传 null 渲染成禁用行，比如没开 swap 的节点。 */
  percent: number | null
  usedText: string
  totalText: string
}

/** 告警阈值会覆盖掉指标自己的色系。 */
function fillClass(percent: number, tone: MetricTone): string {
  if (percent >= 90) return 'km-fill-bad'
  if (percent >= 75) return 'km-fill-warn'
  return `km-fill-${tone}`
}

function textClass(percent: number, tone: MetricTone): string {
  if (percent >= 90) return 'km-text-bad'
  if (percent >= 75) return 'km-text-warn'
  return `km-text-${tone}`
}

export default function UsageBar({ label, tone, percent, usedText, totalText }: UsageBarProps) {
  const disabled = percent === null
  const mutedText = 'text-slate-300 dark:text-slate-600'
  const valueClass = disabled ? mutedText : textClass(percent, tone)

  return (
    <div className="km-ui-usage-bar">
      <div className="flex items-baseline justify-between leading-tight">
        <span className="km-label">{label}</span>
        <span className={`km-num text-[13px] font-semibold ${valueClass}`}>
          {disabled ? '—' : `${percent.toFixed(0)}%`}
        </span>
      </div>
      <div className="km-track mt-1">
        {!disabled && (
          <div
            className={`km-bar ${fillClass(percent, tone)}`}
            style={{ width: `${Math.min(percent, 100).toFixed(1)}%` }}
          />
        )}
      </div>
      <div className="mt-0.5 flex items-baseline justify-between leading-tight">
        <span className={`km-num text-[12px] ${valueClass}`}>{usedText}</span>
        <span className="km-num text-[12px] text-slate-400 dark:text-slate-500">{totalText}</span>
      </div>
    </div>
  )
}
