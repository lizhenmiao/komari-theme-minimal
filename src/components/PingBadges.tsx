/**
 * 延迟药丸，每个选中的探测任务一个。
 *
 * 采样为负表示探测丢失，不是负延迟，所以显示"超时"而不是数字。单位 ms 只在
 * 区块标题上写一次，不在每个药丸上重复。
 */

import { useTranslation } from 'react-i18next'

import type { PingTask } from '../lib/types'

/** 轮换使用，保证相邻任务视觉上能区分。 */
const TONES = ['km-pill-cpu', 'km-pill-mem', 'km-pill-swap'] as const

/** 达到或超过这个值就算慢，需要标出来。 */
const SLOW_MS = 200

interface PingBadgesProps {
  tasks: PingTask[]
  /** 按任务 ID 索引的延迟。负值表示丢包；undefined 表示还没有采样。 */
  values: Record<number, number | undefined>
  compact?: boolean
}

export default function PingBadges({ tasks, values, compact = false }: PingBadgesProps) {
  const { t } = useTranslation()
  if (tasks.length === 0) return null

  return (
    <div className="km-ui-ping-badges flex flex-wrap gap-1">
      {tasks.map((task, index) => {
        const value = values[task.id]
        const missing = value === undefined
        const lost = !missing && value < 0
        const slow = !missing && !lost && value >= SLOW_MS

        const tone = lost
          ? 'km-pill-bad'
          : slow
            ? 'km-pill-warn'
            : missing
              ? 'km-pill-neutral'
              : (TONES[index % TONES.length] ?? 'km-pill-neutral')

        // 紧凑模式把标签截成首字，给表格单元格用。
        const label = compact ? task.name.slice(0, 1) : task.name

        return (
          <span key={task.id} className={`km-pill ${tone}`} title={task.name}>
            <span className="opacity-60">{label}</span>
            <span className="km-num text-[13px] font-semibold">
              {missing ? '—' : lost ? t('metric.timeout') : Math.round(value)}
            </span>
          </span>
        )
      })}
    </div>
  )
}
