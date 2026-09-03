/**
 * 页脚。Komari 的版权行是主题规范要求的，必须保留；运营者自己的 HTML 追加
 * 在它后面。
 */

import { useTranslation } from 'react-i18next'

import { THEME_NAME, THEME_URL } from '../lib/theme-meta'

/**
 * GitHub 品牌标记的路径数据（Simple Icons，CC0）。
 *
 * 用实心而不是导航栏那套描边图标：页脚字号 12.5px，描边版尾部的细节在这个
 * 尺寸下会糊成一团。
 *
 * 整条路径写成一行，不折行 —— 路径数据里换行虽然合法，但折点一旦落进某个
 * 数字中间，图形会静默变形而不报错。
 */
const GITHUB_MARK =
  'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12'

interface FooterProps {
  /** 来自主题设置的运营者自定义富文本。 */
  html: string
}

export default function Footer({ html }: FooterProps) {
  const { t } = useTranslation()

  return (
    /*
     * w-full 是必需的，不是冗余。
     *
     * 这个 <footer> 是 .km-layout（flex flex-col）的直接子项。弹性子项在交叉轴
     * 上带 auto 外边距时，auto 会把剩余空间全部吸走、并压掉 stretch，元素于是
     * 收缩成内容宽度再居中 —— 页脚会缩成一小块飘在中间，下面的
     * justify-between 也就没有空间可分配。给出确定宽度后 auto 分不到剩余空间，
     * 布局才和 <main> 一致。
     *
     * <main> 上同样的类能正常工作，是因为它在普通 block 容器里，不是弹性子项。
     */
    <footer className="km-footer mx-auto w-full max-w-[1560px] px-3.5 pt-1 pb-7 lg:px-5">
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-t km-hair pt-3.5
          text-[12.5px] text-km-faint"
      >
        {/* 主题出处留在左侧，和右侧运营者的内容分列两端，免得被读成一组。 */}
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <span>{t('footer.credit')}</span>
          <span aria-hidden="true">·</span>
          <a
            href={THEME_URL}
            target="_blank"
            /* 页脚在每个页面常驻，少了 noopener 就是把本站页面的控制权交给外站。 */
            rel="noopener noreferrer"
            title={t('footer.source', { name: THEME_NAME })}
            className="km-footer-source inline-flex items-center gap-1 transition-colors
              hover:text-km-text"
          >
            <span>{THEME_NAME}</span>
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="size-3.5">
              <path d={GITHUB_MARK} />
            </svg>
          </a>
        </p>
        {/*
          这段内容由运营者在后台配置，属于第一方内容，不是访客输入。它走的是
          和 custom_head / custom_body 相同的设置通道，Komari 本身也原样渲染。
        */}
        {html && (
          <div className="km-footer-custom km-num" dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </div>
    </footer>
  )
}
