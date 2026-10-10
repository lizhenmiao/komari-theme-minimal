/**
 * 界面风格的生效机制。
 *
 * 风格由管理员在后台配置，经 `GET /api/public` 的 `theme_settings` 下发。
 * 这就带来一个时序问题：首屏渲染发生在那个请求回来之前，此时谁也不知道该用
 * 哪套皮肤。
 *
 * 解法是把设置缓存在 localStorage，由 index.html 里的 pre-paint 脚本在首帧
 * 之前打上 `<html data-style>`：
 *
 *   第一次访问  缓存为空 → 用 manifest 的默认值（apple）→ 设置到达后若不同
 *               则切换一次，此时页面还是骨架屏，切的是骨架
 *   之后的访问  缓存命中 → 首帧就是正确的皮肤，不闪
 *
 * 缓存键不是访客偏好：每次设置到达都会被覆盖。访客端没有切换风格的入口。
 *
 * ============================================================
 * 为什么要把「已生效的皮肤」做成可订阅的状态
 * ============================================================
 *
 * uPlot 要的是具体颜色字符串，所以详情页在渲染期用 `metricColor()` 从
 * `<html>` 上读 CSS 令牌的计算值。而 `data-style` 只能在副作用里写 ——
 * 于是「设置刚到达」那一次渲染里，组件以为自己是 classic，DOM 上却还是
 * 上一套皮肤，读到的是上一套的颜色，并且被 `lib/tokens.ts` 缓存下来；
 * 此后没有任何状态变化，图表就一直留着错误的配色。
 *
 * 所以颜色不能跟着 `settings.style` 走，要跟着「此刻真正写在 DOM 上的皮肤」
 * 走：属性落地之后 emit 一次，读颜色的组件重渲染，拿到的必然是新值。
 */

import { useEffect, useSyncExternalStore } from 'react'

import { clearTokenCache } from '../lib/tokens'
import type { DefaultAppearance, SkinName } from '../lib/types'

/** 和 index.html 的 pre-paint 脚本共用。改这里必须同步改那边。 */
export const SKIN_CACHE_KEY = 'km-minimal-style'
export const DEFAULT_APPEARANCE_CACHE_KEY = 'km-minimal-default-appearance'

const SKINS: readonly SkinName[] = ['classic', 'vercel', 'apple']

/** 读 `<html data-style>`。pre-paint 脚本已经写过，所以首帧就有值。 */
function readFromDocument(): SkinName {
  /*
   * 模块加载时就会调到这里，所以要扛得住 SSR 的浏览器桩：那里 document 存在，
   * 但 documentElement 只补到够渲染为止，没有 dataset，也可能没有 getAttribute。
   */
  if (typeof document === 'undefined') return 'apple'
  const root = document.documentElement as HTMLElement | undefined
  const raw =
    root?.dataset?.['style'] ??
    (typeof root?.getAttribute === 'function' ? root.getAttribute('data-style') : null)
  return SKINS.find((skin) => skin === raw) ?? 'apple'
}

/*
 * 初值取自 DOM，不是写死的默认值：这样首屏渲染时「组件认为的皮肤」和
 * 「DOM 上的皮肤」一致，不会先按错的配色画一遍。
 */
let applied: SkinName = readFromDocument()

const listeners = new Set<() => void>()
const getApplied = (): SkinName => applied

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * 当前真正写在 `<html>` 上的皮肤。
 *
 * 需要按皮肤解析颜色的地方订阅它，而不是订阅 `settings.style` —— 原因见
 * 文件头的说明。
 */
export function useAppliedSkin(): SkinName {
  // 两个快照参数用同一个读取函数，原因见 hooks/useNodes.ts 的说明。
  return useSyncExternalStore(subscribe, getApplied, getApplied)
}

/**
 * 把运营者选的风格写到 `<html>` 上并缓存。
 *
 * 写 DOM 属性而不是给根组件套 class：
 *   - index.html 的 pre-paint 脚本只能碰 documentElement，两边必须是同一个位置
 *   - 令牌覆盖写成 `html[data-style='apple']`，优先级高过 `@theme` 的 `:root`
 *   - uPlot 的画布在 React 树之外读 computed style，也要能读到
 */
export function useSkin(style: SkinName, defaultAppearance: DefaultAppearance): void {
  useEffect(() => {
    const root = document.documentElement
    if (root.dataset['style'] !== style) {
      root.dataset['style'] = style
      // 皮肤换了，同名令牌解析出的颜色也换了，缓存必须作废。
      clearTokenCache()
    }
    if (applied !== style) {
      applied = style
      for (const listener of listeners) listener()
    }
    try {
      localStorage.setItem(SKIN_CACHE_KEY, style)
    } catch {
      // 隐私模式或存储被禁用：本次会话照常，下次首屏会闪一下。
    }
  }, [style])

  useEffect(() => {
    try {
      localStorage.setItem(DEFAULT_APPEARANCE_CACHE_KEY, defaultAppearance)
    } catch {
      // 同上。
    }
  }, [defaultAppearance])
}
