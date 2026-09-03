/**
 * 指标配色与告警阈值的单一来源。
 *
 * 卡片的仪表条和表格的紧凑单元格用的是同一套规则，各写一份必然漂移 ——
 * 改了一处忘了另一处，界面上就会出现同一个百分比在两个视图里颜色不同。
 */

export type MetricTone = 'cpu' | 'mem' | 'disk' | 'swap' | 'quota'

const WARN_AT = 75
const BAD_AT = 90

/**
 * 条形颜色只跟指标走，不受阈值影响。
 *
 * 四条仪表条颜色各异（青/品红/琥珀/橄榄），高负载时若全部变红就丢掉了
 * 「哪条是哪个指标」的辨识度。示警交给数值文字，见 valueToneClass。
 */
export function fillToneClass(tone: MetricTone): string {
  return `km-fill-${tone}`
}

/** 数值文字承担示警：超过 75% 转橙，超过 90% 转红。 */
export function valueToneClass(percent: number, tone: MetricTone): string {
  if (percent >= BAD_AT) return 'km-text-bad'
  if (percent >= WARN_AT) return 'km-text-warn'
  return `km-text-${tone}`
}

/** 没有数据的行（比如未开启 swap）走这个色，不能和正常值混淆。 */
export const DISABLED_TONE_CLASS = 'text-km-faint'
