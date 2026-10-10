/**
 * 卡片 / 表格视图切换。两套新皮肤共用，长相由 skins.css 的 `.km-s-seg` 按皮肤
 * 各自定（vercel 扁平描边、apple iOS 分段控件）。
 *
 * 按钮文字保持「卡片」「表格」原文：检查脚本靠 textContent 定位并点击它们。
 */

import { useTranslation } from 'react-i18next'

import type { View } from '../model'

interface ViewToggleProps {
  view: View
  onChange: (next: View) => void
}

export default function ViewToggle({ view, onChange }: ViewToggleProps) {
  const { t } = useTranslation()
  return (
    <div className="km-s-seg" role="group" aria-label={`${t('nav.grid')} / ${t('nav.table')}`}>
      <button type="button" aria-pressed={view === 'grid'} onClick={() => onChange('grid')}>
        {t('nav.grid')}
      </button>
      <button type="button" aria-pressed={view === 'table'} onClick={() => onChange('table')}>
        {t('nav.table')}
      </button>
    </div>
  )
}
