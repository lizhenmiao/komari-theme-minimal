/**
 * 基于 localStorage 的 `appearance` 键做深浅色切换。
 *
 * 这个键和 Komari 默认主题共用，所以访客的偏好能跨主题保留。index.html 里的
 * pre-paint 脚本已经负责首屏之前打上 class，这个 hook 只管运行时同步，
 * 不要重复实现首屏那套逻辑。
 */

import { useCallback, useEffect, useState } from 'react'

export type Appearance = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'appearance'
const DARK_QUERY = '(prefers-color-scheme: dark)'

function readStored(): Appearance {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  } catch {
    // 隐私模式或存储被禁用。
  }
  return 'system'
}

function prefersDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches
}

function apply(appearance: Appearance): void {
  const dark = appearance === 'dark' || (appearance === 'system' && prefersDark())
  document.documentElement.classList.toggle('dark', dark)
}

export function useAppearance(): {
  appearance: Appearance
  resolved: 'light' | 'dark'
  setAppearance: (next: Appearance) => void
  cycle: () => void
} {
  const [appearance, setLocal] = useState<Appearance>(readStored)
  const [systemDark, setSystemDark] = useState(prefersDark)

  // `system` 要跟随系统设置实时变化，读一次 matchMedia 不够。
  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY)
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  // 跨标签页同步。注意这个事件不会在写入的那个标签页里触发，所以
  // `setAppearance` 自己也要应用一次变更。
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return
      const next = readStored()
      setLocal(next)
      apply(next)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    apply(appearance)
  }, [appearance, systemDark])

  const setAppearance = useCallback((next: Appearance) => {
    setLocal(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // 存不进去也要让本次会话生效。
    }
    apply(next)
  }, [])

  const resolved: 'light' | 'dark' =
    appearance === 'dark' || (appearance === 'system' && systemDark) ? 'dark' : 'light'

  const cycle = useCallback(() => {
    setAppearance(resolved === 'dark' ? 'light' : 'dark')
  }, [resolved, setAppearance])

  return { appearance, resolved, setAppearance, cycle }
}
