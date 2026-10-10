/**
 * Apple 皮肤的顶栏。
 *
 * 毛玻璃细线栏，SF 字重的文字品牌。首页左侧是站点名；详情页左侧换成 iOS 式的
 * 返回键（‹ 总览），不再显示品牌 —— 这和 Apple 「大标题在正文、返回在导航栏」
 * 的习惯一致，详情页的节点大标题由正文承担。
 */

import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import ViewToggle from '../shared/ViewToggle'
import { AppearanceToggle, AuthEntry, LanguageMenu } from '../shared/HeaderActions'
import type { SkinHeaderProps } from '../model'

export default function AppleHeader({
  sitename,
  authEntry,
  view,
  onViewChange,
  nodeName,
}: SkinHeaderProps) {
  const { t } = useTranslation()
  return (
    <header className="km-navbar km-a-header">
      <div className="mx-auto flex h-[52px] max-w-[1340px] items-center gap-3 px-5 lg:px-7">
        {nodeName ? (
          <Link to="/" className="km-a-back">
            <svg
              viewBox="0 0 12 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-[18px] w-3"
              aria-hidden="true"
            >
              <path d="M10 2 2 10l8 8" />
            </svg>
            {t('skin.overview')}
          </Link>
        ) : (
          <Link to="/" className="km-a-brand truncate">
            {sitename}
          </Link>
        )}

        <div className="ml-auto flex items-center gap-2">
          {view && onViewChange && <ViewToggle view={view} onChange={onViewChange} />}
          <LanguageMenu />
          <AppearanceToggle />
          <AuthEntry entry={authEntry} />
        </div>
      </div>
    </header>
  )
}
