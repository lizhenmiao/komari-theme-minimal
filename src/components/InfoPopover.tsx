/**
 * 悬停浮层，放卡片正面挤不下的次要信息。
 *
 * 用 group 修饰符纯 CSS 实现，没有开合状态要管，也没有东西要清理。右对齐是
 * 因为触发点在卡片右上角，左对齐的面板会溢出卡片。
 */

import type { ReactNode } from 'react'

interface InfoPopoverProps {
  children: ReactNode
  /** 区分嵌套的浮层，避免悬停内层时把外层也一起展开。 */
  group?: 'pop' | 'tip'
  width?: string
}

export default function InfoPopover({
  children,
  group = 'pop',
  width = 'w-56',
}: InfoPopoverProps) {
  const groupClass = group === 'tip' ? 'group/tip' : 'group/pop'
  const visibility =
    group === 'tip'
      ? 'group-hover/tip:visible group-hover/tip:opacity-100'
      : 'group-hover/pop:visible group-hover/pop:opacity-100'
  const trigger =
    group === 'tip'
      ? 'inline-grid size-3.5 translate-y-px place-items-center rounded-full bg-km-track text-[9px] font-bold text-km-dim transition hover:text-km-text'
      : 'grid size-[18px] place-items-center rounded-full border border-km-border text-[11px] font-semibold text-km-faint transition hover:border-km-border2 hover:text-km-text'
  const offset = group === 'tip' ? 'top-5' : 'top-6'

  return (
    <span className={`${groupClass} relative shrink-0`}>
      <span className={trigger} aria-hidden="true">
        ?
      </span>
      <span
        className={`invisible absolute right-0 ${offset} ${width} z-40 rounded-lg border
          border-km-border2 bg-km-tip p-3 text-left text-[12px] font-normal normal-case
          tracking-normal opacity-0 shadow-[0_10px_30px_rgb(15_23_42/0.12)] transition
          duration-150 dark:shadow-[0_10px_30px_rgb(0_0_0/0.5)] ${visibility}`}
        role="tooltip"
      >
        {children}
      </span>
    </span>
  )
}

/** 浮层里的一行「标签 - 值」。 */
export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="flex items-baseline justify-between gap-3 py-[2px] text-[12px]">
      <span className="shrink-0 text-km-faint">{label}</span>
      <span className="truncate text-right text-km-text">{value}</span>
    </span>
  )
}
