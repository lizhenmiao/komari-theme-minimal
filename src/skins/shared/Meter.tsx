/**
 * 新皮肤的细条指标：一行里是标签、百分比、细条、已用 / 总量。
 *
 * 和经典皮肤的 `UsageBar` 并存而不是替换：那个是三行布局 + LED 分段条，
 * 经典皮肤要保持原样。两者共用 `lib/tone.ts` 的阈值，所以同一个百分比在
 * 两套皮肤里的告警档位一致。
 */

import { BAD_AT, WARN_AT } from '../../lib/tone'

/** 档位 → 填充与文字的类名。平时中性灰，越过阈值才上色。 */
export function levelOf(percent: number | null): 'ok' | 'warn' | 'bad' {
  if (percent === null) return 'ok'
  if (percent >= BAD_AT) return 'bad'
  if (percent >= WARN_AT) return 'warn'
  return 'ok'
}

export function valueClass(percent: number | null): string {
  const level = levelOf(percent)
  if (level === 'bad') return 'km-s-text-bad'
  if (level === 'warn') return 'km-s-text-warn'
  return ''
}

interface MeterProps {
  label: string
  /** null 渲染成禁用行，比如没开 Swap 的节点。 */
  percent: number | null
  /** 条下方或右侧的「已用 / 总量」，调用方自己拼好。 */
  detail?: string | undefined
  /** 百分比缺失时显示的文案，默认破折号。 */
  placeholder?: string | undefined
  /** 细条高度，默认 4px。 */
  thickness?: number
}

export default function Meter({
  label,
  percent,
  detail,
  placeholder = '—',
  thickness = 4,
}: MeterProps) {
  const level = levelOf(percent)

  return (
    <div className="km-ui-usage-bar grid grid-cols-[auto_2.6rem_minmax(2.5rem,1fr)_auto] items-center gap-2.5">
      <span className="text-[13px] text-km-dim">{label}</span>
      <b className={`km-s-num text-right text-[13px] font-semibold ${valueClass(percent)}`}>
        {percent === null ? placeholder : `${Math.round(percent)}%`}
      </b>
      <span className="km-s-track" style={{ height: `${thickness}px` }}>
        {percent !== null && (
          <span
            className={`km-s-fill km-s-fill-${level} block`}
            // 条最多画到满格，超额多少由数值文字负责表达。
            style={{ width: `${Math.min(percent, 100).toFixed(1)}%` }}
          />
        )}
      </span>
      <span className="km-s-num text-right text-[12px] whitespace-nowrap text-km-faint">
        {detail ?? ''}
      </span>
    </div>
  )
}
