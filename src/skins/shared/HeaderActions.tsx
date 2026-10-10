/**
 * 顶栏右侧的操作簇：语言、外观、后台入口。
 *
 * 三套皮肤的顶栏各自独立（布局、品牌、断点都不同），但这三个控件的**逻辑**
 * 完全一样 —— 语言下拉的开合与点外关闭、外观读写、后台/登录入口的分支。逻辑
 * 抽到这里共用，长相由 skins.css 里的 `.km-s-*` 按皮肤各自定。
 *
 * 校验锚点：外观按钮带 `title="外观"`，后台 / 登录链接带 `km-auth-entry`。
 * 顶栏根节点（在各皮肤的 Header 里）带 `km-navbar`，检查脚本靠这些定位。
 */

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useAppearance } from '../../hooks/useAppearance'
import { useLanguage } from '../../hooks/useLanguage'
import { useThemeSettings } from '../../hooks/useThemeSettings'
import { LANGUAGE_LABELS } from '../../i18n'
import type { Language } from '../../i18n'
import type { AuthEntry } from '../../lib/auth'

const ICON = {
  globe: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="size-[18px]" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
    </svg>
  ),
  sun: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="size-[18px]" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
    </svg>
  ),
  moon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="size-[18px]" aria-hidden="true">
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" />
    </svg>
  ),
  gear: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-[18px]" aria-hidden="true">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  user: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-[18px]" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="10" r="3" />
      <path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662" />
    </svg>
  ),
}

export function LanguageMenu() {
  const { t } = useTranslation()
  const { language, setLanguage, available } = useLanguage()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (event: MouseEvent) => {
      if (ref.current?.contains(event.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="km-s-iconbtn"
        title={t('nav.language')}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {ICON.globe}
      </button>
      {open && (
        <div className="km-s-menu">
          {available.map((code: Language) => (
            <button
              key={code}
              type="button"
              className="km-s-menu-item"
              aria-current={code === language}
              onClick={() => {
                setLanguage(code)
                setOpen(false)
              }}
            >
              {LANGUAGE_LABELS[code]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function AppearanceToggle() {
  const { t } = useTranslation()
  const { defaultAppearance } = useThemeSettings()
  const { cycle, resolved } = useAppearance(defaultAppearance)
  return (
    <button type="button" className="km-s-iconbtn" title={t('nav.appearance')} onClick={cycle}>
      {resolved === 'dark' ? ICON.moon : ICON.sun}
    </button>
  )
}

/**
 * 后台 / 登录入口。两者都指向 /admin —— 内置 UI 自己处理认证，主题不实现登录
 * 表单。用 `<a>` 而不是路由 Link：/admin 是 Komari 内置 UI，走客户端路由会被
 * 主题的兜底路由拦回首页。`none` 表示访客身份还没问到，先不显示免得闪。
 */
export function AuthEntry({ entry }: { entry: AuthEntry }) {
  const { t } = useTranslation()
  if (entry === 'admin') {
    return (
      <a href="/admin" className="km-s-iconbtn km-auth-entry" title={t('nav.admin')}>
        {ICON.gear}
      </a>
    )
  }
  if (entry === 'login') {
    return (
      <a href="/admin" className="km-s-iconbtn km-auth-entry" title={t('nav.login')}>
        {ICON.user}
      </a>
    )
  }
  return null
}
