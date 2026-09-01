/**
 * 基于 localStorage 的 `language` 键做语言切换。这个键和默认主题共用，
 * 所以切换主题后选择依然保留。
 */

import { useCallback, useEffect, useState } from 'react'

import i18n, { detectLanguage, STORAGE_KEY, SUPPORTED } from '../i18n'
import type { Language } from '../i18n'

export function useLanguage(): {
  language: Language
  setLanguage: (next: Language) => void
  available: readonly Language[]
} {
  const [language, setLocal] = useState<Language>(detectLanguage)

  // 跨标签页同步。`storage` 事件不会在写入的标签页里触发，所以
  // `setLanguage` 自己更新本地 state。
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return
      const next = detectLanguage()
      setLocal(next)
      void i18n.changeLanguage(next)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setLanguage = useCallback((next: Language) => {
    setLocal(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // 存储不可用时也要让本次会话生效。
    }
    void i18n.changeLanguage(next)
  }, [])

  return { language, setLanguage, available: SUPPORTED }
}
