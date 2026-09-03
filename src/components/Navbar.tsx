/**
 * 吸顶导航栏：站点标识、在线/离线计数、视图切换、语言、外观。
 */

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { useAppearance } from '../hooks/useAppearance'
import { useLanguage } from '../hooks/useLanguage'
import { LANGUAGE_LABELS } from '../i18n'
import type { Language } from '../i18n'

interface NavbarProps {
  sitename: string
  total: number
  online: number
  /** 详情页不传这两个，那里显示返回按钮。 */
  view?: 'grid' | 'table'
  onViewChange?: (view: 'grid' | 'table') => void
  backTo?: string
  /**
   * 右侧的身份入口。
   *   'admin' 已登录 → 后台
   *   'login' 已确认未登录 → 登录
   *   'none'  身份还没问到 → 不显示
   */
  authEntry?: 'admin' | 'login' | 'none'
}

export default function Navbar({
  sitename,
  total,
  online,
  view,
  onViewChange,
  backTo,
  authEntry = 'none',
}: NavbarProps) {
  const { t } = useTranslation()
  const { cycle } = useAppearance()
  const { language, setLanguage, available } = useLanguage()
  const [langOpen, setLangOpen] = useState(false)
  const langRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!langOpen) return
    const onClick = (event: MouseEvent) => {
      if (langRef.current?.contains(event.target as Node)) return
      setLangOpen(false)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [langOpen])

  return (
    <header
      className="km-navbar sticky top-0 z-20 border-b km-hair backdrop-blur-[12px]"
      style={{ background: 'color-mix(in srgb, var(--color-km-bg) 72%, transparent)' }}
    >
      <div className="mx-auto flex h-[54px] max-w-[1560px] items-center gap-2.5 px-3.5 lg:px-5">
        {backTo ? (
          <Link to={backTo} className="km-iconbtn" title={t('nav.back')}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              className="size-4.5"
            >
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </Link>
        ) : (
          /*
           * 品牌标记不跟随深浅色：始终深底白线。作为整个界面里唯一的固定色块，
           * 它承担「这是同一个产品」的识别作用，跟着主题变会失去这个作用。
           */
          <span
            className="grid size-[30px] shrink-0 place-items-center rounded-lg border
              border-white/10 bg-[#0a0a0c]"
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" className="size-4.5">
              <path
                d="M3 13.5h3.4l1.9-4.6 3.3 8.2 1.9-4.6H21"
                fill="none"
                stroke="#fff"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        )}

        <Link to="/" className="truncate text-[15px] font-semibold tracking-tight">
          {sitename}
        </Link>

        <div className="ml-1.5 hidden items-center gap-2 sm:flex">
          <span className="km-chip text-km-dim">
            {t('nav.online')} <b className="km-num text-km-ok">{online}</b>
          </span>
          <span className="km-chip text-km-dim">
            {t('nav.offline')}{' '}
            <b className="km-num text-km-bad">{Math.max(total - online, 0)}</b>
          </span>
        </div>

        <div className="flex-1" />

        {view && onViewChange && (
          <div className="km-seg">
            <button
              type="button"
              className={view === 'grid' ? 'km-seg-on' : 'km-seg-off'}
              onClick={() => onViewChange('grid')}
            >
              {t('nav.grid')}
            </button>
            <button
              type="button"
              className={view === 'table' ? 'km-seg-on' : 'km-seg-off'}
              onClick={() => onViewChange('table')}
            >
              {t('nav.table')}
            </button>
          </div>
        )}

        <div ref={langRef} className="relative">
          <button
            type="button"
            className="km-iconbtn"
            title={t('nav.language')}
            aria-expanded={langOpen}
            onClick={() => setLangOpen((open) => !open)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              className="size-4.5"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18" />
              <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
            </svg>
          </button>
          {langOpen && (
            <div
              className="absolute right-0 top-10 z-30 w-36 rounded-lg border border-km-border2
                bg-km-tip p-1.5 shadow-[0_10px_30px_rgb(15_23_42/0.12)]
                dark:shadow-[0_10px_30px_rgb(0_0_0/0.5)]"
            >
              {available.map((code: Language) => (
                <button
                  key={code}
                  type="button"
                  className={`block w-full rounded-md px-2 py-1.5 text-left text-[13px]
                    transition hover:bg-km-panel2 ${
                      code === language ? 'font-semibold text-km-text' : 'text-km-dim'
                    }`}
                  onClick={() => {
                    setLanguage(code)
                    setLangOpen(false)
                  }}
                >
                  {LANGUAGE_LABELS[code]}
                </button>
              ))}
            </div>
          )}
        </div>

        <button type="button" className="km-iconbtn" title={t('nav.appearance')} onClick={cycle}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            className="size-4.5 dark:hidden"
          >
            <circle cx="12" cy="12" r="4" />
            <path
              d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5
                17.5L5 19"
            />
          </svg>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            className="hidden size-4.5 dark:block"
          >
            <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" />
          </svg>
        </button>

        {/*
         * 后台与登录入口二选一。两者都指向 /admin —— 内置 UI 自己处理认证，
         * 主题不实现登录表单。
         *
         * 用 <a> 而不是 <Link>：/admin 是 Komari 内置 UI，走客户端路由会被本主题
         * 的 `path="*"` 拦下来兜回首页，必须让浏览器真的发起一次文档请求。
         *
         * 'none' 表示还没问到访客身份。此时两个入口都不显示 —— 先给未登录的人
         * 看到登录、拿到身份后再换成后台，会闪一下。
         */}
        {authEntry === 'admin' && (
          <a href="/admin" className="km-iconbtn km-auth-entry" title={t('nav.admin')}>
            {/*
             * Lucide layout-dashboard。四格面板是通用的「控制台」符号，和齿轮
             * （设置）区分得开 —— 点进去是整个后台，不只是设置页。
             */}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4.5"
            >
              <rect width="7" height="9" x="3" y="3" rx="1" />
              <rect width="7" height="5" x="14" y="3" rx="1" />
              <rect width="7" height="9" x="14" y="12" rx="1" />
              <rect width="7" height="5" x="3" y="16" rx="1" />
            </svg>
          </a>
        )}

        {authEntry === 'login' && (
          <a href="/admin" className="km-iconbtn km-auth-entry" title={t('nav.login')}>
            {/*
             * Lucide circle-user。圆框让人形在 18px 下有完整轮廓，不会散成
             * 两个孤立的形状。
             *
             * 线宽 1.9 而不是导航栏其余图标的 1.7：Lucide 原始线宽是 2，这两个
             * 图标元素较多，1.7 在 18px 下会比旁边的图标细一档。
             */}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4.5"
            >
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="10" r="3" />
              <path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662" />
            </svg>
          </a>
        )}
      </div>
    </header>
  )
}
