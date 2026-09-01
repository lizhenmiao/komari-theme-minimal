/**
 * 地区标识。
 *
 * 渲染自托管的 SVG 国旗（`public/flags/`，由 `npm run flags` 抓取）。
 *
 * 为什么不直接渲染 emoji：实例里的 `region` 通常已经是国旗 emoji，但
 * **Windows 的 Segoe UI Emoji 故意不含国旗字形** —— 区域指示符对在 Windows 上
 * 渲染成两个字母方块，不是国旗。依赖系统字体等于在最主流的桌面平台上不显示。
 *
 * 也不用第三方国旗 CDN：那会让每个访客的浏览器去请求外部主机，泄漏来访 IP，
 * 内网部署还会裂图。这些 SVG 随主题产物一起分发，运行时零外部请求。
 */

import { useState } from 'react'

interface RegionFlagProps {
  region: string
  className?: string
}

/** 区域指示符起点，即字母 A。 */
const REGIONAL_A = 0x1f1e6

/**
 * 把 `region` 归一成两位小写国家代码，拿不到就返回 null。
 *
 * 认两种输入：国旗 emoji（一对区域指示符）和两位字母代码。运营者也可能填
 * 任意文字，那种情况下按原样显示文本。
 */
function toCountryCode(region: string): string | null {
  const points = [...region]
  if (points.length === 2) {
    const first = points[0]?.codePointAt(0)
    const second = points[1]?.codePointAt(0)
    if (
      first !== undefined &&
      second !== undefined &&
      first >= REGIONAL_A &&
      first <= REGIONAL_A + 25 &&
      second >= REGIONAL_A &&
      second <= REGIONAL_A + 25
    ) {
      return (
        String.fromCharCode(97 + (first - REGIONAL_A)) +
        String.fromCharCode(97 + (second - REGIONAL_A))
      )
    }
  }
  if (/^[A-Za-z]{2}$/.test(region)) return region.toLowerCase()
  return null
}

export default function RegionFlag({ region, className = '' }: RegionFlagProps) {
  // 缺图时退回文本，而不是留一个碎图图标。
  const [failed, setFailed] = useState(false)

  const trimmed = region?.trim() ?? ''
  if (!trimmed) return null

  const code = toCountryCode(trimmed)

  if (!code || failed) {
    return (
      <span
        className={`km-ui-flag shrink-0 text-[13px] leading-none ${className}`}
        title={trimmed}
      >
        {trimmed}
      </span>
    )
  }

  const label = code.toUpperCase()
  return (
    <img
      // BASE_URL 在开发态是 `/`，产物里是 /themes/{short}/dist/，两边都对。
      src={`${import.meta.env.BASE_URL}flags/${code}.svg`}
      alt={label}
      title={label}
      width={20}
      height={15}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`km-ui-flag h-[15px] w-[20px] shrink-0 rounded-[2px] object-cover ring-1 ring-black/10 dark:ring-white/15 ${className}`}
    />
  )
}
