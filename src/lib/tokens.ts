/**
 * 读取 CSS 令牌的计算值。
 *
 * uPlot 在构造时就要具体的颜色字符串，`var(--color-km-cpu)` 传给 canvas
 * 只会被当成非法值忽略。所以画图前必须先把令牌解析成 rgb()。
 *
 * 深浅色切换时同一个令牌名解析出不同的值，调用方据此重建图表。
 */

/** 令牌名 -> 计算值。同一次渲染里反复读同一个令牌不必重算。 */
const cache = new Map<string, string>()

/** 深浅色切换后必须清掉，否则拿到的是上一套配色。 */
export function clearTokenCache(): void {
  cache.clear()
}

/**
 * 读一个 `--color-km-*` 令牌。
 *
 * 守卫看的是 `getComputedStyle` 而不是 `document`：SSR 渲染时会打一层浏览器
 * 桩，`document` 存在但 `getComputedStyle` 没有。此时返回空字符串，调用方
 * 不画图，不影响渲染结果。
 */
export function readToken(name: string): string {
  if (typeof getComputedStyle !== 'function' || typeof document === 'undefined') return ''

  const cached = cache.get(name)
  if (cached !== undefined) return cached

  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  cache.set(name, value)
  return value
}

/** 指标语义色。传 `cpu` 得到 `--color-km-cpu` 的计算值。 */
export function metricColor(key: string): string {
  return readToken(`--color-km-${key}`)
}
