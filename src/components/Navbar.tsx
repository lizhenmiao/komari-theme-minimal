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
}

export default function Navbar({
  sitename,
  total,
  online,
  view,
  onViewChange,
  backTo,
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
      className="km-navbar sticky top-0 z-20 border-b km-hair bg-white/70 backdrop-blur-xl
        dark:bg-slate-950/70"
    >
      <div className="mx-auto flex h-15 max-w-[1600px] items-center gap-2.5 px-4 sm:px-6">
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
          <span
            className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-indigo-500
              to-violet-600 text-[13px] font-bold text-white"
          >
            {sitename.slice(0, 1).toUpperCase() || 'K'}
          </span>
        )}

        <Link to="/" className="truncate text-[15px] font-semibold tracking-tight">
          {sitename}
        </Link>

        <div className="ml-1.5 hidden items-center gap-2 sm:flex">
          <span
            className="km-chip bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10
              dark:text-emerald-400"
          >
            {t('nav.online')} <b className="km-num">{online}</b>
          </span>
          <span className="km-chip bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
            {t('nav.offline')} <b className="km-num">{Math.max(total - online, 0)}</b>
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
              className="absolute right-0 top-11 z-30 w-36 rounded-xl border border-slate-200
                bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-800"
            >
              {available.map((code: Language) => (
                <button
                  key={code}
                  type="button"
                  className={`block w-full rounded-lg px-2 py-1.5 text-left text-[13px]
                    hover:bg-slate-100 dark:hover:bg-slate-700 ${
                      code === language ? 'font-semibold' : ''
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
      </div>
    </header>
  )
}
