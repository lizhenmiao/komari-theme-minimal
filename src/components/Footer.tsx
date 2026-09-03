/**
 * 页脚。Komari 的版权行是主题规范要求的，必须保留；运营者自己的 HTML 追加
 * 在它后面。
 */

import { useTranslation } from 'react-i18next'

interface FooterProps {
  /** 来自主题设置的运营者自定义富文本。 */
  html: string
}

export default function Footer({ html }: FooterProps) {
  const { t } = useTranslation()

  return (
    <footer className="km-footer mx-auto max-w-[1560px] px-3.5 pt-1 pb-7 lg:px-5">
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-t km-hair pt-3.5
          text-[12.5px] text-km-faint"
      >
        <p>{t('footer.credit')}</p>
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
