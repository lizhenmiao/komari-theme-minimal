/**
 * Vercel / Linear 皮肤的顶栏。
 *
 * 刻意和经典、Apple 都不一样：方形 logo + 面包屑式站点名，细线分隔，右侧一簇
 * 扁平幽灵按钮。详情页把节点名接在站点名后面做成面包屑（`站点 / 节点`），
 * 站点名回链首页，不另设返回键。
 */

import { Link } from 'react-router-dom'

import ViewToggle from '../shared/ViewToggle'
import { AppearanceToggle, AuthEntry, LanguageMenu } from '../shared/HeaderActions'
import type { SkinHeaderProps } from '../model'

export default function VercelHeader({
  sitename,
  authEntry,
  view,
  onViewChange,
  nodeName,
}: SkinHeaderProps) {
  return (
    <header className="km-navbar km-v-header">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-2.5 px-4 lg:px-6">
        <Link to="/" className="km-v-brand">
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <rect width="24" height="24" rx="6" fill="currentColor" />
            <path
              d="M6 15.5 10 11l3 3 5-6"
              fill="none"
              stroke="var(--color-km-panel)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="truncate font-semibold tracking-[-0.01em]">{sitename}</span>
        </Link>

        {nodeName && (
          <>
            <span className="km-v-sep" aria-hidden="true">
              /
            </span>
            <span className="truncate text-[15px] font-medium">{nodeName}</span>
          </>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {view && onViewChange && <ViewToggle view={view} onChange={onViewChange} />}
          <LanguageMenu />
          <AppearanceToggle />
          <AuthEntry entry={authEntry} />
        </div>
      </div>
    </header>
  )
}
