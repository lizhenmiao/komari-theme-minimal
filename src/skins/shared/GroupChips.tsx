/**
 * 分组筛选芯片。两套新皮肤共用，形状差异在 skins.css 里。
 *
 * `km-index-groups` 是校验脚本的锚点，必须保留。
 */

import { useTranslation } from 'react-i18next'

import type { NodeGroup } from '../../hooks/useNodes'

/** 「全部」不是真实分组名，用空串表示，免得和某个叫「全部」的组撞名。 */
export const ALL_GROUPS = ''

interface GroupChipsProps {
  groups: NodeGroup[]
  active: string
  total: number
  onChange: (next: string) => void
}

export default function GroupChips({ groups, active, total, onChange }: GroupChipsProps) {
  const { t } = useTranslation()

  // 所有节点都没分组时整行不渲染，不留一个只有「全部」的空壳。
  if (groups.length === 0) return null

  const chip = (value: string, label: string, count: number) => (
    <button
      key={value || '__all__'}
      type="button"
      className="km-s-chip"
      aria-pressed={active === value}
      onClick={() => onChange(value)}
    >
      {label}
      {/* km-num 是校验脚本取计数的锚点。 */}
      <span className="km-num km-s-num ml-1.5 opacity-60">{count}</span>
    </button>
  )

  return (
    <div className="km-index-groups flex flex-wrap items-center gap-2" role="group">
      {chip(ALL_GROUPS, t('group.all'), total)}
      {groups.map((entry) => chip(entry.name, entry.name, entry.count))}
    </div>
  )
}
