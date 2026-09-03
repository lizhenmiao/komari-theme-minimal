# 执行计划

分七个阶段。每个阶段结束都要能构建通过，且尽量能跑校验——避免出现「改了一半两边都不成立」的中间态。

## 阶段 1：令牌层与基础类

先把配色地基打好，后面组件才有工具类可用。

- [x] `src/index.css` 整体重写
  - `@theme` 定义 10 个中性色 + 10 个语义色，`.dark` 覆盖深色值
  - 基础类：`km-card`（硬边框面板）、`km-num`、`km-label`、`km-section`、`km-scell`
  - 背景层：`km-bg` + 两团光晕（`km-blob-a` / `km-blob-b`），只做 transform 动画
  - `prefers-reduced-motion` 里关掉光晕与涟漪
  - 保留 uPlot 的三条覆盖规则
- [x] `src/lib/tone.ts` 新建：阈值配色单一来源

**结果**：`npm run build` exit 0。

## 阶段 2：原子组件

- [x] `StatusDot.tsx` — LED + `::after` 涟漪；`km-dot km-ui-status-dot km-dot-live` 保留
- [x] `UsageBar.tsx` — LED 分段仪表条（mask 抠洞）；`km-ui-usage-bar` `km-bar` 保留；接 `tone.ts`
- [x] `PingBadges.tsx` — 药丸边框用 `color-mix` 跟随数值色；`km-ui-ping-badges` 保留
- [x] `RegionFlag.tsx` — 20×15、`box-shadow` 描边；双形态与 `toCountryCode` 不动
- [x] `OsIcon.tsx` — 图标尺寸调到 15px，配色改令牌；`detectOs` 与七个发行版不动
- [x] `InfoPopover.tsx` — 两档尺寸走令牌配色；`group/pop` 与 `group/tip` 的区分保留
- [x] `RingGauge.tsx` 新建 — `stroke-dasharray` 环形，`rotate(-90deg)` 起点在正上方
- [x] `Footer.tsx` — 两端对齐；版权行与 `dangerouslySetInnerHTML` 不动

**结果**：`npm run render` 39/39。

## 阶段 3：首页

- [x] `Navbar.tsx` — 54px 高、`backdrop-blur`、品牌标记（主题无关的深底白线）、在线/离线计数、视图切换、语言下拉与外观按钮
- [x] `Sparkline.tsx` 新建 — 自绘 SVG，`preserveAspectRatio="none"` 横向拉满，线宽用 `vector-effect` 抵消拉伸
- [x] `src/lib/store.ts` — 加 `cpuTrend` 环形缓冲（每节点 60 点），只给内容确实变了的节点追加
- [x] `hooks/useNodes.ts` — 加 `useCpuTrend`，直接返回 store 里的数组以保证快照稳定
- [x] `NodeCard.tsx` — 卡头、规格行、四条仪表条 + 流量限额、趋势图、速率与累计、延迟与负载、卡底到期与在线时长
- [x] `pages/Index.tsx` — 汇总条改 `km-scell` 分隔线；网格改 `auto-fill minmax(min(370px,100%),1fr)`
- [x] `NodeTable.tsx` — 表头吸顶、行悬停左轴线、单元格仪表条压到 8px；13 列注册表与列开关持久化不动

**结果**：`npm test` 全绿，`browser-check` 39/39。

## 阶段 4：图表

- [x] `src/lib/uplot-tooltip.ts` 新建 — 十字准线读数浮层，含防溢出翻转
- [x] `src/lib/tokens.ts` 新建 — 读 CSS 令牌的计算值，uPlot 只认具体颜色字符串
- [x] `Chart.tsx` — 面积渐变（`createLinearGradient`）、`shadow` 辉光、网格与轴改令牌色、挂 tooltip 插件、竖线改虚线；生命周期与 `spanGaps: false` 不动

**结果**：六张图观感与原型一致，截图确认。

## 阶段 5：详情页

- [x] `pages/NodeDetail.tsx`
  - 顶栏身份区（国旗、OS、LED、节点名、标签药丸、规格串）
  - 四个环形仪表（CPU/内存/硬盘/Swap，swap 未开启走禁用态）
  - 五格仪表面板条：并成一块面板用竖线分隔，负边距把线拉到 gap 中间
  - 六张曲线 + 时间范围切换；每张加 `min-w-0` 防止 canvas 顶住列宽
  - 三栏信息面板
  - `LINE_COLORS` 删除，颜色改从令牌读
- [x] `km-page-instance` `km-instance-current` `km-instance-charts` `km-instance-info` `km-load-chart` 全部保留

**结果**：`npm test` 全绿，`browser-check` 39/39。

## 阶段 6：收尾核对

- [x] 新增键 `metric.swapOn` `metric.free` `metric.remaining` `detail.runtime`，三份 locale 同步
- [x] 修 `types.ts` 里 `uptime` 的注释错误：`common:getNodesLatestStatus` 确实返回它（`common.go:344,381`）
- [x] 六种边界形态截图核对：离线（Charlie 整卡降饱和、延迟显示超时）、已过期（Foxtrot 红色药丸「已过期 1 天」）、swap 未开启（显示「未开启」+ 破折号）、流量不限额、`gpu_name "None"`、`price -1`/`0`
- [x] 无未替换的 `{{}}` 占位符（render 与 browser 两层都有断言）
- [x] 通读改动文件，清掉墓碑注释：`transport.ts` 1 处、`mock-server.mjs` 4 处、`dev-check.mjs` 1 处

## 阶段 7：截图与打包

- [x] `preview.mjs` 四个采样区域按实测几何重算：顶栏 55px、汇总条 y=73 高 76、卡片 y=163 尺寸 371×427、第二行 y=601
- [x] `preview.png` 重新生成（1600×900，201 kB），四区域均非纯色块
- [x] 浅色与深色各截首页与详情页，逐区块比对
- [x] `npm run package` 18/18

## 最终验证

```
npm run build                   exit 0
npm run format:check            25/25
npm run smoke                   75/75
npm run render                  39/39
npm run render:no-rpc2          39/39
npm run render:no-metrics       39/39
npm run dev:check               10/10
node scripts/browser-check.mjs  39/39
npm run package                 18/18
```

## 与计划的偏差

**`tone.ts` 的接口**与设计文档里写的 `toneOf(percent)` 不同，实际拆成了
`fillToneClass(tone)` 和 `valueToneClass(percent, tone)` 两个函数。原因是条形色
与文字色的规则不一样——条形只跟指标走，文字才受阈值影响，一个函数返回不了
两种语义。

**辉光下衬**没有像设计文档设想的那样「加一条宽 4 低透明度的 series」，改用了
uPlot 自带的 `shadow: true`。加一条重复 series 会让 tooltip 多出一行，且
`spanGaps: false` 下两条线的断口渲染要各自对齐，成本高于收益。

**新增 `src/lib/tokens.ts`**，设计文档里没有。uPlot 需要具体颜色字符串，
`var(--color-km-cpu)` 传给 canvas 会被当非法值忽略，所以要一层读取计算值的封装。
它的 SSR 守卫查的是 `getComputedStyle` 而不是 `document`——渲染检查会打浏览器桩，
`document` 存在但 `getComputedStyle` 没有，只查 `document` 会在那里抛错。
