# 技术设计

## 一、核心问题：现有实现没有设计令牌层

`src/index.css` 里没有 `@theme` 块，也没有任何 CSS 自定义属性。颜色全是硬编码的 Tailwind 调色板工具类，散在两处：

1. `@apply` 里（40 个类定义）
2. 组件 `className` 字符串里（量更大）

这直接决定重构方式：**不能靠改变量换配色，必须先建令牌层**。否则每个颜色都要在两处各改一遍，且深浅色两套值无处安放。

### 方案

在 `src/index.css` 用 `@theme` 定义令牌，深色值走 `.dark` 覆盖：

```css
@theme {
  --color-km-bg: #f3f5f8;
  --color-km-panel: #ffffff;
  --color-km-cpu: #0891b2;
  /* ... */
}

.dark {
  --color-km-bg: #0b0d10;
  --color-km-panel: #12151a;
  --color-km-cpu: #22d3ee;
  /* ... */
}
```

`@theme` 里的 `--color-*` 会被 Tailwind 生成对应工具类（`bg-km-panel`、`text-km-cpu`、`border-km-border`），组件里就能用工具类而不是硬编码色阶。深浅色切换只改变量值，不改类名。

令牌清单（浅色 / 深色）取自原型，共 16 个中性色 + 10 个语义色。原型里 `--bg-side`、`--accent`、`--accent-soft` 无任何规则引用，不搬。

### 保留的三处硬编码颜色

有些地方必须是具体颜色值，不能是 CSS 变量：

| 位置 | 原因 |
|---|---|
| `NodeDetail.tsx` 的 `LINE_COLORS` | uPlot 构造时就要具体颜色；改为读取 CSS 变量计算值后传入 |
| `OsIcon.tsx` 的品牌色 | 发行版官方色，与主题无关 |
| 品牌图标 `.bmark` | 原型明确设为主题无关：固定 `#0a0a0c` 底 + 白色折线 |

## 二、阈值配色的单一来源

现有实现里，90/75 阈值判定写了两遍：

- `UsageBar.tsx:19-29` 的 `fillClass` / `textClass`
- `NodeTable.tsx:100-109` 的 `MetricCell` 里重写了一遍

漏改一处就会出现卡片与表格配色不一致。重构时抽成一个函数放进 `src/lib/format.ts` 旁边或新建 `src/lib/tone.ts`：

```ts
export type Tone = 'normal' | 'warn' | 'bad'
export function toneOf(percent: number | null): Tone
```

两处共用。原型的阈值是 `p >= 90 → bad`，`p >= 75 → warn`。

## 三、LED 分段仪表条

原型的核心视觉手法。槽 `.meter` 是实体背景，填充是子元素，分段靠 mask 抠洞：

```css
.km-meter-fill {
  -webkit-mask-image: repeating-linear-gradient(90deg, #000 0 5px, transparent 5px 7px);
          mask-image: repeating-linear-gradient(90deg, #000 0 5px, transparent 5px 7px);
}
```

5px 实体 + 2px 缺口、7px 周期。mask 以填充元素自身左边缘为起点，填充从左生长，格子位置稳定不抖。

### 原型里的一处失效样式

原型 CSS 定义了 `.meter i.w { --c: var(--warn) }` / `.meter i.b { --c: var(--bad) }`，但 `mrow()` 在同一元素写了行内 `style="--c: var(--${cls})"`。行内声明在级联中优先于类选择器，自定义属性同样遵守级联，所以**条形颜色永远是指标语义色，告警变色只体现在百分比文字上**。

这是原型的既有行为。**决定照搬**：条形保持指标色，文字变色。理由是四条仪表条颜色各异（cpu 青 / mem 品红 / disk 琥珀 / swap 橄榄），高负载时全变红会丢失「哪个指标是哪条」的辨识度，而百分比文字变色已足够示警。

实现上不写行内 `--c`，直接用 Tailwind 工具类给条形上色，避免留一个永远不生效的 CSS 规则。

## 四、图表：继续用 uPlot

原型手绘 SVG 是因为它不能有构建步骤。React 侧保留 uPlot，`Chart.tsx` 的生命周期逻辑（销毁重建、`spanGaps: false`、resize 监听）已验证过，原样保留。

要贴近原型观感需调整的 options：

| 原型效果 | uPlot 实现 |
|---|---|
| 面积渐变（`stop-opacity` 0.26 → 0） | series 的 `fill` 传 `CanvasGradient`，用 `u.ctx.createLinearGradient` |
| 辉光下衬（同 path，`width:4`，`opacity:.14`） | 同一数据加一条 series，宽 4、颜色带 alpha，画在主线之前 |
| 十字准线（竖线 + 采样点 + tooltip） | `cursor: { y: false }` 已有竖线；tooltip 用 uPlot 插件在 `setCursor` 钩子里定位 DOM |
| 网格与轴（5 条横线、首尾锚点 start/end） | `axes[].grid`、`splits`、`values` |
| null 断口 | `spanGaps: false`（已有） |

tooltip 需要新写一个 uPlot 插件，替换现在 `legend: { show: false }` 的做法。原型的 tooltip 有防溢出翻转（`left = px + 12 + tw > W - 4 ? px - tw - 12 : px + 12`），照搬这个逻辑。

## 五、环形仪表：新组件

详情页四个环形仪表是纯 SVG，不需要图表库：

```
viewBox="0 0 96 96"
底圈  cx/cy=48 r=40 stroke=var(--track) stroke-width=7 fill=none
值圈  同几何 + stroke-linecap:round
      transform: rotate(-90deg) 让 0% 起点在正上方
      stroke-dasharray: {p/100*C} {C}   其中 C = 2π·40 ≈ 251.33
中心  绝对定位 grid 居中的整数百分比
```

新建 `src/components/RingGauge.tsx`。`transition: stroke-dasharray .6s ease` 做动画。

## 六、迷你趋势图：真实数据，不是伪随机

原型的 `.spark` 用节点名哈希成种子生成确定性伪随机波形，因为它没有数据源。React 侧有真实数据。

问题：首页卡片当前不取历史数据。`useNodeHistory` 是详情页专用，首页 N 张卡片各发一次 RPC 不可接受。

方案：**首屏不画 spark，等状态轮询累积**。`lib/store.ts` 已有逐节点状态，在 store 里为每个节点维护一个定长环形缓冲（比如最近 60 个 CPU 采样），由轮询自然填充。卡片读这个缓冲画 spark。

代价是刚打开页面时 spark 是空的，随轮询逐渐长出来。这比为了首屏好看去发 N 次历史请求更合理。若缓冲不足 2 点则不渲染 spark 容器。

`showSparkline` 这个主题设置当前在四处有定义但无组件读取（死设置），正好在这里接上。

## 七、组件改动分类

### 重写（纯展示）

```
src/index.css                    279 行，几乎全部重写；先建令牌层
src/components/UsageBar.tsx      改为 LED 分段仪表条
src/components/StatusDot.tsx     LED + 涟漪；保留 km-dot-live
src/components/InfoPopover.tsx   .qpop / .qtip 两种尺寸
src/components/PingBadges.tsx    .ping 药丸，数值色靠局部变量
src/components/NodeCard.tsx      262 行，工作量最大
src/components/Footer.tsx        保留版权行与 dangerouslySetInnerHTML
```

### 新建

```
src/components/RingGauge.tsx     环形仪表
src/components/Sparkline.tsx     迷你趋势图（读 store 环形缓冲）
src/components/MetricStrip.tsx   详情页五格仪表面板条
src/lib/tone.ts                  阈值配色单一来源
src/lib/uplot-tooltip.ts         uPlot tooltip 插件
```

### 部分调整

```
src/App.tsx              背景层改两团光晕；保留传输生命周期与路由
src/pages/Index.tsx      汇总条改实时聚合；保留 store 读取与视图持久化
src/pages/NodeDetail.tsx 加环形仪表区与仪表面板条；LINE_COLORS 改读令牌
src/components/Navbar.tsx    顶栏重排；保留语言下拉逻辑
src/components/NodeTable.tsx 表格样式；保留 13 列注册表与列开关持久化
src/components/Chart.tsx     options 调整 + 挂 tooltip 插件；生命周期不动
src/components/RegionFlag.tsx 尺寸与描边；保留 toCountryCode 与回退
src/components/OsIcon.tsx    图标尺寸与描边；detectOs 与七个发行版不动
src/lib/store.ts         加 spark 环形缓冲
```

### 原样保留

`src/lib/` 其余八个文件、四个数据类 hooks、`useAppearance.ts`、`useLanguage.ts`、`main.tsx`、`vite.config.ts`、`index.html`、`komari-theme.json`。

## 八、i18n

现有三份 locale 已覆盖当前展示的全部数据。本次只在**新增区块**需要标题时补键，例如详情页环形仪表区、仪表面板条的分区小标题、时间范围切换的档位名。

原则：先看现有 locale 有没有可复用的键，没有才加。不按原型的文案清单批量补——原型出现过的词不等于我们需要展示的数据。

三份 locale 必须同步，漏一份会在界面上露出裸键名。

## 九、测试断言的处理

`smoke.mjs`（51 项）纯接口契约，不碰 DOM，换设计后全绿，不动。

受影响的四个脚本，处理原则是**优先保锚点，而不是改断言**：

| 脚本 | 受影响处 | 处理 |
|---|---|---|
| `render-check.mjs` | 类名与文本断言 | 锚点保留即可全绿；文案断言不动 |
| `browser-check.mjs` | 最脆：`h3` 节点名、`img.km-ui-flag`、语义化 table、`km-iconbtn`、13 列魔数、按钮文案「表格」 | 全部保留结构，脚本不改 |
| `dev-check.mjs` | `querySelectorAll` 计数四项 | 锚点保留即可 |
| `preview.mjs` | 四个固定像素采样区域 | **必须按新几何重算**，这是唯一必改的脚本 |

`km-bar` 和 `km-dot-live` 虽然在新设计里语义变了（分段仪表条、LED），名字仍保留，因为 `browser-check.mjs:76-77` 断言它们存在。

## 十、风险

| 风险 | 应对 |
|---|---|
| uPlot 的面积渐变与辉光下衬做不出原型观感 | 先做一张 CPU 图验证，不行再谈是否局部改手绘 SVG |
| spark 环形缓冲让 store 快照引用不稳定 → React #185 | 缓冲更新走与 `mergeStatuses` 同样的逐节点浅比较；`render-check.mjs` 已有引用稳定性断言 |
| 深浅两套配色其一对比度不足 | 两套都截图，逐区块看 |
| 令牌层建立后旧 `@apply` 类残留造成样式冲突 | `index.css` 整体重写而非增量改 |
