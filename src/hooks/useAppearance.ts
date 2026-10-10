/**
 * 深浅色外观。
 *
 * 访客的选择存在 localStorage 的 `appearance` 键里，这个键和 Komari 默认主题
 * 共用，所以偏好能跨主题保留。index.html 的 pre-paint 脚本负责首屏之前打上
 * class，这里只管运行时同步。
 *
 * 访客没自己选过时，回退到管理员配置的 `defaultAppearance`。只有「`appearance`
 * 键存在且合法」才算访客表达过偏好 —— 一旦写入过，后台改设置也不该把访客的
 * 选择顶掉。
 *
 * 状态放在模块级而不是各 hook 实例内：导航栏点一下切换，详情页的图表必须跟着
 * 重建（uPlot 的颜色在构造时就烧进 canvas，`var()` 对它无效）。每个组件各持
 * 一份 useState 的话，写入方之外的组件收不到通知 —— storage 事件不会在写入的
 * 那个标签页里触发，于是图表会留着上一套配色。
 */

import { useCallback, useEffect, useSyncExternalStore } from 'react'

import { DEFAULT_SETTINGS } from './useThemeSettings'
import type { DefaultAppearance } from '../lib/types'

export type Appearance = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'appearance'
const DARK_QUERY = '(prefers-color-scheme: dark)'

function readStored(): Appearance | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  } catch {
    // 隐私模式或存储被禁用。
  }
  return null
}

function prefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(DARK_QUERY).matches
}

/** 访客自己选过的值，null 表示没选过。 */
let choice: Appearance | null = readStored()
let systemDark = prefersDark()

const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/*
 * 两个快照都是基本类型，天然引用稳定，不必像 store.ts 那样缓存对象 ——
 * 返回新对象会让 useSyncExternalStore 判定每次都变，进而无限重渲染。
 */
const getChoice = (): Appearance | null => choice
const getSystemDark = (): boolean => systemDark

/** 订阅系统偏好。一次性注册，不随组件挂载卸载反复增删监听。 */
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  window.matchMedia(DARK_QUERY).addEventListener('change', (event) => {
    systemDark = event.matches
    emit()
  })
}

/** 跨标签页同步。这个事件不会在写入的标签页里触发，所以写入方自己也要 emit。 */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return
    choice = readStored()
    emit()
  })
}

function applyToDocument(appearance: Appearance, dark: boolean): void {
  if (typeof document === 'undefined') return
  const isDark = appearance === 'dark' || (appearance === 'system' && dark)
  document.documentElement.classList.toggle('dark', isDark)
}

export function useAppearance(
  defaultAppearance: DefaultAppearance = DEFAULT_SETTINGS.defaultAppearance,
): {
  appearance: Appearance
  resolved: 'light' | 'dark'
  setAppearance: (next: Appearance) => void
  cycle: () => void
} {
  // 两个快照参数用同一个读取函数，原因见 hooks/useNodes.ts 的说明。
  const stored = useSyncExternalStore(subscribe, getChoice, getChoice)
  const dark = useSyncExternalStore(subscribe, getSystemDark, getSystemDark)

  const appearance: Appearance = stored ?? defaultAppearance
  const resolved: 'light' | 'dark' =
    appearance === 'dark' || (appearance === 'system' && dark) ? 'dark' : 'light'

  /*
   * 多个组件都会跑这个 effect，但写的是同一个结果，重复一次是幂等的，
   * 比引入「谁才是负责写 DOM 的那一个」的协调逻辑划算。
   */
  useEffect(() => {
    applyToDocument(appearance, dark)
  }, [appearance, dark])

  const setAppearance = useCallback((next: Appearance) => {
    choice = next
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // 存不进去也要让本次会话生效。
    }
    // 立刻写 DOM，不等 effect：点击到变色之间不该有一帧延迟。
    applyToDocument(next, systemDark)
    emit()
  }, [])

  const cycle = useCallback(() => {
    setAppearance(resolved === 'dark' ? 'light' : 'dark')
  }, [resolved, setAppearance])

  return { appearance, resolved, setAppearance, cycle }
}
