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
 *
 * name 是纯字符串而非多语言对象：theme-market 的收录脚本
 * （scripts/theme_submission.py 的 required_manifest_text）要求 name、
 * description、version、author 都是字符串，多语言对象会被判为「缺少有效的
 * name」而拒收。主题名本身是专有名词，各语种一致，这里没有损失。
 */

import manifest from '../../komari-theme.json'

/** 主题仓库地址。 */
export const THEME_URL: string = manifest.url

/** 主题名。 */
export const THEME_NAME: string = manifest.name
