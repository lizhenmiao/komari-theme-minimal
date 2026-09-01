/**
 * i18next 初始化。
 *
 * 没有用浏览器语言探测插件：Komari 默认主题把访客的选择存在 localStorage 的
 * `language` 键下，直接读这个键既能跨主题共享偏好，又省一个依赖。
 */

import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './locales/en'
import zhCN from './locales/zh-CN'
import zhTW from './locales/zh-TW'

export const STORAGE_KEY = 'language'
export const SUPPORTED = ['zh-CN', 'zh-TW', 'en'] as const
export type Language = (typeof SUPPORTED)[number]

export const LANGUAGE_LABELS: Record<Language, string> = {
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  en: 'English',
}

function isSupported(value: string): value is Language {
  return (SUPPORTED as readonly string[]).includes(value)
}

/** 优先用存储值，其次匹配浏览器语言，最后回退 zh-CN。 */
export function detectLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && isSupported(stored)) return stored
  } catch {
    // 存储不可用，继续往下看 navigator。
  }

  for (const candidate of navigator.languages ?? [navigator.language]) {
    if (!candidate) continue
    if (isSupported(candidate)) return candidate
    // 地区变体映射：zh-HK / zh-MO / zh-Hant -> zh-TW，其余 zh-* -> zh-CN。
    const lower = candidate.toLowerCase()
    if (lower.startsWith('zh')) {
      return /hant|hk|mo|tw/.test(lower) ? 'zh-TW' : 'zh-CN'
    }
    if (lower.startsWith('en')) return 'en'
  }
  return 'zh-CN'
}

void i18next.use(initReactI18next).init({
  lng: detectLanguage(),
  fallbackLng: 'zh-CN',
  supportedLngs: SUPPORTED,
  resources: {
    'zh-CN': { translation: zhCN },
    'zh-TW': { translation: zhTW },
    en: { translation: en },
  },
  interpolation: { escapeValue: false },
  // 词条用嵌套对象组织，不是点号分隔的扁平字符串。
  keySeparator: '.',
  returnNull: false,
})

export default i18next
