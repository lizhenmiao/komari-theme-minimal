/**
 * 主题自身的元信息。
 *
 * 唯一来源是 komari-theme.json：它被打进归档根供服务端读取，也被
 * vite.config.ts 读去拼资源前缀。前端再抄一份名字或仓库地址就是第三处，
 * 三处必然各自漂移。
 *
 * 整份 manifest 不会被打进客户端产物。Vite 默认 `json.namedExports` 为真，
 * 会为每个顶层键生成具名导出，Rollup 据此对默认导出做属性级摇树 —— 实测
 * 产物里只剩下面用到的字段，配置项的说明文案都不在。
 */

import manifest from '../../komari-theme.json'

/** 主题仓库地址。 */
export const THEME_URL: string = manifest.url

/**
 * 当前语言下的主题名。
 *
 * manifest 的 name 是 i18n 对象。取不到当前语种时退到 en，再退到第一个非空
 * 值 —— 页脚少一个名字不该让整行塌掉。用 `||` 而不是 `??`：空字符串同样要
 * 继续往下退，它渲染出来和缺失没有区别。
 */
export function themeName(language: string): string {
  const names: Record<string, string | undefined> = manifest.name
  return names[language] || names.en || Object.values(names).find(Boolean) || manifest.short
}
