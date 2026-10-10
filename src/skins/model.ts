/**
 * 页面模型：容器与皮肤之间的契约。
 *
 * `pages/` 负责取数据、算派生值、持有交互状态，产出这里的模型；
 * `skins/<name>/` 只消费模型做排版，不调用取数据的 hook。
 *
 * 三套皮肤吃同一份模型，所以同一个节点在任何皮肤下显示的数字必然一致 ——
 * 换算只发生在模型装配这一处，不会在三处各算一遍然后对不上。
 *
 * 唯一的例外是节点级的小 hook（`useCpuTrend`、`useNodeStatus`）：按节点订阅
 * 才能让一张卡的刷新不惊动整页，这类 hook 允许在卡片组件里直接调用。
 */

import type { ChartSeries } from '../components/Chart'
import type { HistorySeries, RangeKey } from '../hooks/useNodeHistory'
import type { PingSeries } from '../hooks/usePingStats'
import type { AttentionEntry } from '../lib/attention'
import type { AuthEntry } from '../lib/auth'
import type { NodeGroup, NodeTotals } from '../hooks/useNodes'
import type { NodeView, PingTask, ThemeSettings } from '../lib/types'

export type View = 'grid' | 'table'

/**
 * 各皮肤自己的顶栏接受的 props。
 *
 * 三套皮肤的顶栏布局与品牌各不相同，但吃的输入一样：首页模式传视图切换，
 * 详情页模式传节点名（用作面包屑 / 返回标题）。
 */
export interface SkinHeaderProps {
  sitename: string
  authEntry: AuthEntry
  view?: View
  onViewChange?: (next: View) => void
  nodeName?: string
}

/** 三套皮肤都要的页面级外壳数据。 */
export interface ShellModel {
  sitename: string
  totals: NodeTotals
  authEntry: AuthEntry
  settings: ThemeSettings
}

export interface IndexModel extends ShellModel {
  /** 置顶 + 权重排序之后的全部节点，未经分组筛选。计数与「需要注意」用它。 */
  nodes: NodeView[]
  /** 当前分组下要渲染的节点。 */
  visibleNodes: NodeView[]
  groups: NodeGroup[]
  activeGroup: string
  onGroupChange: (next: string) => void
  view: View
  onViewChange: (next: View) => void
  /** 卡片上并排显示的探测任务，已按运营者的勾选过滤。 */
  cardTasks: PingTask[]
  /** 键是 `${uuid}:${taskId}`，负值表示丢包。 */
  pingLatest: Record<string, number>
  /** 需要注意的节点，严重的在前。`showAttention` 关闭时皮肤自行忽略。 */
  attention: AttentionEntry[]
  /** 还在首次加载且一个节点都没有：画骨架。 */
  firstLoad: boolean
  /** 加载结束但确实没有节点。 */
  empty: boolean
}

/**
 * 一张历史图的声明。
 *
 * 做成声明式而不是让皮肤各自拼 `<Chart>`：标题、序列、格式化函数、y 轴范围
 * 这些属于数据语义，三套皮肤必须一致；皮肤只决定外面那个容器长什么样。
 */
export interface ChartSpec {
  key: string
  title: string
  /** 标题后的补充说明，例如延迟图的「断口 = 丢包」。 */
  note?: string
  series: ChartSeries[]
  timestamps: number[]
  /** 十字准线读数的格式化。 */
  format: (value: number) => string
  /** y 轴刻度的格式化，缺省与 `format` 相同。 */
  axisFormat?: ((value: number) => string) | undefined
  /** 固定 y 轴范围，占用类图表传 [0, 100]。 */
  range?: [number, number] | undefined
  /** 占用类图表：越过 75 / 90 的线段换色。经典皮肤不启用。 */
  threshold?: boolean
}

/** 所有图表共用的那几个颜色与格式化参数。 */
export interface ChartChrome {
  axisColor: string
  gridColor: string
  cursorColor: string
  formatTime: (unixSeconds: number) => string
  /** 这个值一变就重建图表：深浅色或皮肤换了，令牌解析出的颜色也换了。 */
  rebuildKey: string
  lossLabel: string
}

export interface DetailModel extends ShellModel {
  /** null 表示节点还没到达或不存在，皮肤画加载态。 */
  node: NodeView | null
  range: RangeKey
  ranges: readonly RangeKey[]
  onRangeChange: (next: RangeKey) => void
  history: HistorySeries
  historyLoading: boolean
  ping: PingSeries
  /** 当前区间下要画的图，已按设置过滤（例如关掉延迟就没有延迟图）。 */
  charts: ChartSpec[]
  chartChrome: ChartChrome
}
