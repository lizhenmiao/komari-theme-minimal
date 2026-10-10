/**
 * 历史图网格。两套新皮肤共用：图的内容由 `ChartSpec` 决定，容器形状差异在
 * skins.css 里（vercel 是描边卡，apple 是白色大圆角卡）。
 *
 * `km-instance-charts` 与 `km-load-chart` 是校验脚本的锚点，必须保留。
 */

import { useTranslation } from 'react-i18next'

import Chart from '../../components/Chart'
import { thresholdNote } from './text'
import { BAD_AT, WARN_AT } from '../../lib/tone'
import { metricColor } from '../../lib/tokens'
import type { ChartChrome, ChartSpec } from '../model'

interface ChartGridProps {
  charts: ChartSpec[]
  chrome: ChartChrome
  /** 还在加载且一个点都没有。 */
  loading: boolean
  /** 有过响应但该区间确实没有数据。 */
  noData: boolean
}

export default function ChartGrid({ charts, chrome, loading, noData }: ChartGridProps) {
  const { t } = useTranslation()

  if (loading) {
    return <p className="py-16 text-center text-sm text-km-faint">{t('state.loading')}</p>
  }
  if (noData) {
    return <p className="py-16 text-center text-sm text-km-faint">{t('detail.noData')}</p>
  }

  /*
   * 阈值颜色在这里解析而不是在容器里：它只有开了染色的图表才需要，解析一次
   * 就够。令牌缓存已经由详情页在皮肤 / 深浅切换时清过。
   */
  const thresholds = {
    warn: WARN_AT,
    bad: BAD_AT,
    warnColor: metricColor('warn'),
    badColor: metricColor('bad'),
  }

  return (
    <section className="km-instance-charts grid gap-4 xl:grid-cols-2">
      {charts.map((spec) => (
        <div key={spec.key} className="km-s-card min-w-0 p-4 pb-2.5">
          <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-[14px] font-semibold">{spec.title}</h3>
            {spec.note && <span className="text-[12px] text-km-faint">{spec.note}</span>}
          </div>
          {/*
           * min-w-0 是必需的：网格项默认 min-width:auto，uPlot 生成的固定宽度
           * canvas 会把列宽顶起来，窗口缩小时容器再也缩不回去。
           */}
          <div className="min-w-0">
            <Chart
              timestamps={spec.timestamps}
              series={spec.series}
              format={spec.format}
              axisFormat={spec.axisFormat}
              range={spec.range}
              {...(spec.threshold ? { thresholds } : {})}
              {...chrome}
            />
          </div>
          {spec.threshold && (
            <p className="mt-1 text-[11px] text-km-faint">{thresholdNote(t)}</p>
          )}
        </div>
      ))}
    </section>
  )
}
