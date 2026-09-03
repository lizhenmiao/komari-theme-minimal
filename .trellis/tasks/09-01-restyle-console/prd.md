# 按 console 原型重构前端外观

## 背景

现有前端照 `design/mockup-index.html` / `mockup-detail.html`（v1「minimal」，浅色玻璃拟态）实现，已通过六层校验并提交（`11baffd`）。

新原型 `design/mockup-console-index.html` / `mockup-console-detail.html`（v2「console」，深色终端风格）刻意与 v1 拉开差距：深色为主基调、硬边框面板、等宽数字、LED 分段仪表条、环形仪表。

本任务只换**外观**，不换实现手段。原型是自包含 HTML 只因为它要能独立打开，不构成对 React 侧技术选型的约束。

## 范围

### 要做

- 建立设计令牌层：把原型的 CSS 自定义属性搬进 `src/index.css`，浅色/深色两套值
- 重写展示组件，达到与原型一致的观感
- 首页：顶栏、四格汇总条、节点卡（LED 分段仪表条 + 迷你趋势图）、表格视图
- 详情页：顶栏节点身份区、四个环形仪表、五格仪表面板条、六张历史曲线、三栏信息面板
- 汇总条从节点数组实时聚合
- 同步更新校验脚本中因 DOM 变化而失效的断言

### 原型的定位

**原型只是皮。** 它提供的是视觉效果参考：配色、间距、圆角、边框、字重、动画、仪表条与环形仪表的画法。

它的数据来源、字段清单、渲染逻辑、代码注释都不作为依据。展示什么数据、数据从哪来，一律沿用现有实现已经跑通的那套（`src/lib/` 与数据类 hooks）。原型里写死的字面量、伪随机波形、无事件的按钮，都只是让它能独立打开的权宜手段。

### 不做

- **不动数据层**：`src/lib/` 全部九个文件、`hooks/useNodes.ts`、`useNodeHistory.ts`、`usePingStats.ts`、`useThemeSettings.ts` 原样保留
- **不改展示的数据集合**：不因为原型出现过某个词就去加字段，也不因为原型没画就删掉现有字段
- **不换图表库**：继续用 uPlot，通过配置和自定义 tooltip 贴近原型观感
- **不加侧栏**：原型只有顶栏
- 不改 `index.html` 的四个哨兵
- 不改打包契约（`komari-theme.json` 在压缩包根、`dist/`、`preview.png`）

## 约束

### 安全（沿用，不可放宽）

- `theme_settings` 经由**未认证、全网可读**的 `GET /api/public` 暴露：任何 token、密钥、私有 URL 都不能放进主题配置
- `showPrice` 默认 `false`，因为价格对所有访客可见
- 主题不得占用 `/admin` 与 `/terminal` 路由
- 页脚必须保留 `Powered by Komari Monitor.`
- 国旗必须自托管在 `public/flags/`；逐访客请求第三方 CDN 会泄露访客 IP，且内网部署不可用

### 技术

- 资源前缀固定 `/themes/{short}/dist/`。相对路径会在深层路由被 SPA 兜底成 HTML 而触发 MIME 拒绝
- uPlot 颜色在构造时写入 options，切换深浅色必须销毁重建
- `spanGaps` 保持 `false`：null 采样是真实信息（丢失的 ping 探测），必须渲染成断口
- `useSyncExternalStore` 的快照必须引用稳定，否则触发 React #185
- 深色模式走 `.dark` class，首屏由 `index.html` 的 pre-paint 内联脚本定好，避免闪白

### 测试锚点

以下 `km-*` 类名被校验脚本当选择器用，**必须原样保留**，即使新设计里对应元素长得完全不一样：

```
km-layout  km-main  km-navbar  km-footer  km-footer-custom
km-page-index  km-page-instance
km-index-summary  km-index-grid  km-index-table
km-node-card  km-ui-table-row
km-ui-usage-bar  km-ui-status-dot  km-dot-live  km-bar
km-ui-ping-badges  km-ui-flag
km-instance-current  km-instance-charts  km-instance-info
km-load-chart
```

另有四条结构性约束来自 `browser-check.mjs`：

- 节点名保持在 `<h3>` 里
- 国旗保持 `img.km-ui-flag` / `span.km-ui-flag` 双形态
- 表格保持语义化 `<table><thead><th>`，列开关按钮保持 `km-iconbtn`，视图切换按钮文案保持「表格」
- 数值必须包在标签里，不能裸文本输出（`!'>None<'` 与 `!/>-1</` 依赖这个形状）

到期三态文案不变：`长期` / `永久` / `已过期 N 天` / `剩 N 天`，日期保持 `MM/DD/YYYY`。

## 验收标准

- [ ] `npm run build` exit 0
- [ ] `npm test` 全绿（format + smoke + render ×3 + dev:check）
- [ ] `node scripts/browser-check.mjs` 全绿
- [ ] `npm run package` 全绿（含 18 项压缩包校验）
- [ ] 浅色与深色两套配色都经真实浏览器截图确认，无对比度失衡
- [ ] 首页与详情页截图与原型逐区块比对：顶栏、汇总条、节点卡、环形仪表、仪表面板条、曲线区、信息面板
- [ ] 汇总条数值由节点数组算出，与卡片数据自洽（不再是字面量）
- [ ] 六种边界形态渲染正常：离线节点、已过期节点、swap 未开启、流量不限额、`gpu_name "None"`、`price -1`/`0`
- [ ] `preview.png` 按新布局重新生成，四个采样区域不是纯色块

## 未决问题

- `preview.mjs` 按固定像素坐标采样四个区域判断是否为纯色块。新布局的导航栏高度、页面内边距、卡片尺寸都会变，这四组坐标需要按新几何重算。
