# Komari Minimal 主题 —— 实施方案

> 交给实现方（另一个模型/另一位开发）的执行文档。脚手架已完成并提交，本文档描述剩余全部实现工作。
>
> 三份官方文档是唯一事实来源，**不要参考第三方主题的文档**（它们描述的传输层机制在官方文档里不存在）：
>
> - 主题开发：<https://komari-document.pages.dev/dev/theme>
> - HTTP API：<https://komari-document.pages.dev/dev/api>
> - RPC2：<https://komari-document.pages.dev/dev/rpc>

---

## 1. 目标

为 Komari Monitor 实现一个第三方主题，`short` 名为 `minimal`。

**已定的产品决策（不要再改动）：**

| 项 | 决策 |
|---|---|
| 视觉基调 | 柔和卡片：圆角、微阴影、进度条、迷你趋势图 |
| 配色 | 单色灰阶 + 仅状态用色（在线绿 / 高负载琥珀 / 离线红） |
| 首页视图 | 网格 + 表格双视图，可切换，选择持久化到 localStorage |
| 卡片指标 | CPU、内存、网络速率、在线状态（必做）+ 磁盘、负载、迷你趋势图、流量配额、到期/价格、ping 延迟与丢包 |
| 必须支持 | i18n（zh-CN / zh-TW / en）、深浅色切换 |
| 不使用 | axios、TanStack Query（理由见 §7） |

---

## 2. 当前仓库状态

脚手架已完成，`npm run build && npm run verify` 通过。**不要重写这些文件**，只在其上增量开发：

```
komari-theme.json      manifest + managed configuration（已定义全部设置项）
index.html             含 4 个哨兵，纯 ASCII 无 BOM
vite.config.ts         base './'，chunk 名去下划线，dev proxy 带 ws
tsconfig.app.json      strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes
src/main.tsx           React 挂载点
src/App.tsx            占位组件，需要被真实路由替换
src/index.css          Tailwind v4 入口 + dark 变体 + 状态色 token
scripts/verify.mjs     打包契约校验，构建后必须通过
scripts/package.mjs    产出 zip，manifest 在归档根
```

已装依赖：`react@18.3.1` `react-dom` `react-router-dom@6.28.0` `i18next@23.16.8` `react-i18next@15.1.3` `uplot@1.6.31`，dev 侧 `vite@6.0.7` `typescript@5.7.2` `tailwindcss@4.3.3` `@tailwindcss/vite@4.3.3`。

---

## 3. 不可违反的硬约束

违反其中任何一条，本地 `vite preview` 都正常，但装到 Komari 上会白屏或功能静默失效。

1. **`index.html` 的 4 个哨兵必须字节级一致。** Komari 用字符串替换注入运营者的自定义内容：

   | 哨兵 | 被替换成 |
   |---|---|
   | `<title>Komari Monitor</title>` | 自定义站点标题 |
   | `A simple server monitor tool.` | 自定义站点描述（在 meta description 内） |
   | `</head>` | 自定义 head HTML + 原标签 |
   | `</body>` | 自定义 body/footer HTML + 原标签 |

2. **绝不在 `index.html` 的注释里写出 `</head>` 或 `</body>` 字面量。** Vite 注入 bundle 标签时匹配**第一处**文本，注释里的副本会把 script/link 吞进注释，页面全白。`verify.mjs` 已加断言。

3. **`index.html` 保持纯 ASCII 且无 BOM。** 哨兵是字节级匹配，`verify.mjs` 已加断言。注意 Windows PowerShell 的 `Set-Content -Encoding utf8` 会加 BOM，落在 `<!doctype html>` 之前。

4. **资源前缀与页面路径是两件事，不能混。** 服务端（`web/public/public.go`）对它们的处理完全不同：

   - **资源**走 `/themes/:id/*path`，纯静态查找，命中返回文件，**未命中直接 404，不回退 index.html**。
   - **页面**走 `noRoute`，返回 `dist/index.html`。请求的是 `/`、`/instance/xxx` 这类**站点根下**的路径。

   所以：构建 `base` = `/themes/{short}/dist/`（`short` 从 manifest 读，不要写死），而客户端路由**不能加 `basename`** —— 页面 URL 本来就在站点根下。

   构建时不能用 `./`：浏览器把 `./assets/index-xxx.js` 相对当前 URL 解析成 `/instance/assets/index-xxx.js`，`noRoute` 又把 `index.html` 返回给它，按 MIME 拒绝执行，整页空白。

   开发态 `base` 必须是 `/`：Vite 把入口挂在 `base` 下，若开发态也用 `/themes/{short}/dist/`，地址栏 pathname 就带上这段前缀，React Router 匹配不到任何路由，被 `path="*"` 兜回首页，**详情页永远打不开**。`vite.config.ts` 按 `command === 'build'` 区分。

   这一整类问题极易漏测。踩过两次：

   - `verify.mjs` 最初的断言方向是反的（要求必须相对路径），于是构建、verify、SSR 渲染测试全绿，直到用真实浏览器加载才发现。
   - `scripts/mock-server.mjs` 最初在 `/themes/{short}/dist/` 前缀下也做了 SPA fallback，而真实服务端那里是 404 —— 测试替身把 bug 藏起来了，`browser-check.mjs` 22/22 全绿却与真实行为不符。

   从首页点进详情页走的是客户端路由，不触发 document 加载，一切正常；只有**直接访问 / 刷新 `/instance/<uuid>`** 才会暴露。断言这类问题只能靠 `scripts/browser-check.mjs`（构建产物）和真实 dev server 两层。

5. **产物文件名不得以 `_` 开头**，Go 的 `embed` 会跳过。`vite.config.ts` 里 `chunkFileNames` 已做处理，`verify.mjs` 兜底检查。

6. **接口返回形状必须对着真实实例核实，不能照文档推断。** 真实实例上验出过六处不符，全部是静默失败（HTTP 200、控制台干净、页面只是空着）：

   | 方法 | 真实返回 |
   | --- | --- |
   | `common:getNodes` | **以 uuid 为键的字典**（REST `/api/nodes` 的 `data` 才是数组） |
   | `common:getNodesLatestStatus` | 同上，uuid 字典 |
   | `common:getRecords` | `{count, records:{uuid:[…]}, from, to}`，**即便指定 uuid 也包这层信封** |
   | `public:queryMetrics` 键名 | 带点的命名空间：`cpu.usage`、`memory.used`、`swap.used`、`disk.used`、`load.average`、`net.in.rate`、`net.out.rate`、`net.total.up/down`、`ping.latency_ms`、`ping.loss`。用状态记录的字段名会被拒 `unknown metric key` |
   | `public:queryMetrics` 返回 | `{series:[{metric_key, entity_id, points:[{time,value,count,tags}]}]}`。用量类给的是**字节**，百分比要自己按总量换算 |
   | `public:getPingMetricStats` | **聚合统计**（min/max/avg/latest/p50/p99/loss），没有时间序列。延迟曲线要用 `queryMetrics` 的 `ping.latency_ms`，按 `task_id` **字符串**标签拆分 |

   直接病因往往是 `Array.isArray(x)`：字典上恒为 false，于是 `setState` 从不执行。用 `public:listMetricDefinitions` 列真实键名，别硬编码猜测。

7. **`weight` 是升序，服务端不排序节点。** `GetAllClientBasicInfo` 没有 ORDER BY，顺序完全由主题决定，必须和后台拖拽写入的方向一致。依据：同一代码库里探测任务用 `Order("weight ASC").Order("id ASC")`；`admin:orderClients` 原样写入前端传来的 uuid→weight，下标 0 是列表第一个。

8. **国旗必须自托管 SVG，不能渲染 emoji。** `region` 通常是国旗 emoji，但 **Windows 的 Segoe UI Emoji 故意不含国旗字形** —— 区域指示符对在 Windows 上渲染成两个字母方块。也不能用第三方国旗 CDN（泄漏访客 IP、内网裂图）。`npm run flags` 抓 flag-icons 到 `public/flags/`，`RegionFlag` 把 emoji 反解成两位代码再指过去，映射不出来的退回文本。

其他必须遵守但不致命的：

- 页脚保留 `Powered by Komari Monitor.`
- 不占用 `/admin` 和 `/terminal` 路由，这两个永远是内置 UI
- 主题只做监控数据展示，管理功能留在后台
- `theme_settings` 通过无鉴权的 `/api/public` 全世界可读 —— **任何 token、密钥、私有 URL 都不能放进主题配置**

服务端提供 SPA fallback（404 回 `index.html`），所以 React Router 可以直接用。

---

## 4. 传输层：RPC2 主路径 + `/api/clients` 降级

### 4.1 为什么选 RPC2

`/api/rpc2`，JSON-RPC 2.0，可走 WebSocket 或 HTTP POST，要求服务端 **≥ 1.0.7**。

选它而不选 `/api/clients` 有两条实质理由：

1. **`online` 的位置。** `/api/clients` 把在线状态放在单独的 `data.online` 数组里，要自己 join 回节点；RPC2 的 `NodeStatus` 上直接有 `online: bool`。
2. **多路复用。** `/api/clients` 的协议是发文本 `get`、回一帧，**没有请求 ID**，两个请求同时在飞无法区分响应。JSON-RPC 有 `id`，一条 socket 可以同时跑实时状态和历史查询。

### 4.2 官方文档明确没有覆盖的部分

这些是设计自由度，也是风险点，实现时自行决定并写注释说明：

- **没有任何推送/订阅机制。** RPC2 无 subscribe，`/api/clients` 也是请求响应式。**实时刷新必须自己轮询**。
- 没有错误码表（只提到 `InvalidParams` 和 `InternalError`）→ JSON-RPC error 解析写成防御式，不要 switch 具体 code
- 没有重连指引、没有心跳约定、没有 close code 含义 → 自己实现指数退避 + 抖动，上限 30s
- 没有批量请求（数组形式）和通知（无 `id`）的说明 → 不要用
- 没有逐方法的最低版本表 → **用 `rpc.methods` 做能力探测**，不要硬编码版本号

### 4.3 能力探测

启动时调 `rpc.methods` 拿到方法名数组，转成 `Set<string>`，据此决定各条数据路径：

| 能力 | 有则用 | 无则降级到 |
|---|---|---|
| 实时状态 | `common:getNodesLatestStatus` | WS `/api/clients` 发 `get` |
| 节点元数据 | `common:getNodes` | `GET /api/nodes` |
| 站点信息 | `common:getPublicInfo` | `GET /api/public` |
| 历史指标 | `public:queryMetrics` | `common:getRecords` → `GET /api/records/load` |
| ping 统计 | `public:getPingMetricStats` | `common:getRecords` (type=ping) |
| ping 任务表 | `public:getPublicPingTasks` | `GET /api/task/ping` |

如果连 `/api/rpc2` 都连不上（服务端 < 1.0.7），整条 RPC 路径关闭，全部走 REST + `/api/clients`。

---

## 5. 数据形状：三套不兼容的结构

**这是本项目最大的返工来源。** 同一批指标在不同接口下有三种结构，官方文档明确说明 `StatusRecord` 与 `Record` 不可互换。

| 形状 | 出现在 | 特征 |
|---|---|---|
| **嵌套** | WS `/api/clients`、`GET /api/recent/{uuid}` | `cpu.usage`、`ram.total`/`ram.used`、`load.load1/load5/load15`、`network.up/down/totalUp/totalDown`、`connections.tcp/udp`、`gpu{count,average_usage,detailed_info[]}`、`uptime`、`message`、`updated_at` |
| **`NodeStatus` / `StatusRecord`** | RPC2 `common:*` | 全平铺：`cpu`、`gpu`、`ram`+`ram_total`、`swap`+`swap_total`、`load`、`temp`、`disk`+`disk_total`、`net_in`、`net_out`、`net_total_up`、`net_total_down`、`process`、`connections`、`connections_udp`、`client`、`time`。`NodeStatus` 额外有 `load5`、`load15`、`online` |
| **`Record`** | RPC2 `public:*` | 平铺 + 额外的 `traffic_up` / `traffic_down`，数值宽度是 float32 |

**内部规范形状选 `NodeStatus`**，因为主路径直接返回它，零转换。另外两种写 normalizer 转进来。

注意两个**只存在于嵌套形状**的字段：`uptime` 和 `message`。`NodeStatus` / `StatusRecord` 都没有。如果要显示运行时长，只能从 `/api/clients` 或 `/api/recent/{uuid}` 拿，详情页可用，卡片上则要接受它在 RPC2 路径下缺失。normalizer 里把它们标成可选。

### 5.1 `Client`（节点元数据）字段与怪癖

`uuid` `name` `cpu_name` `virtualization` `arch` `cpu_cores` `os` `kernel_version` `gpu_name` `region` `mem_total` `swap_total` `disk_total` `weight` `price` `billing_cycle` `auto_renewal` `currency` `expired_at` `group` `tags` `hidden` `traffic_limit` `traffic_limit_type` `created_at` `updated_at`，以及未鉴权时被隐藏或打码的 `token` `ipv4` `ipv6` `remark` `version`。

必须特殊处理的：

| 字段 | 怪癖 |
|---|---|
| `tags` | 是 `;` 分隔的**字符串**，不是数组 |
| `expired_at` | 可能是 `null`，格式 UTC RFC3339Nano |
| `price` | `-1` 表示免费，`0` 表示未设置 |
| `cpu_physical_cores` | `0` 表示未知/未上报 |
| `gpu_name` | 无 GPU 时是字符串 `"None"` |
| `region` | 通常是国旗 emoji（也可能是两位国家代码，或运营者自填的任意文字） |
| `weight` | 排序权重，**数值小的在前**（升序） |
| `traffic_limit_type` | `sum` / `max` / `min` / `up` / `down` 五种算法，决定已用流量怎么算 |
| `currency` | 默认 `$` |

`traffic_limit_type` 的语义：`sum` = 上下行相加，`max` = 取较大者，`min` = 取较小者，`up` = 只算上行，`down` = 只算下行。用 `net_total_up` / `net_total_down` 按类型计算已用量再和 `traffic_limit` 比。`traffic_limit` 为 `0` 表示不限。

### 5.2 其他全局怪癖

- **时间必须带时区。** RFC3339 带 offset 或 `Z`，无时区字符串服务端直接拒绝，也不会把 Unix 时间戳猜出来。
- **ping 的 `value` 为负表示丢包**（`-1` 标记丢失）。画图时要**断线**，不能画成负值尖刺；统计丢包率时把负值单独计数。
- `GET /api/records/ping` **不做降采样**，官方明确警告结果集可能很大。用 `public:getPingMetricStats` 或 `common:getRecords` 代替。
- `theme_settings` 缺省值回退规则：`select` → 第一个选项，`number` → `0`，`switch` → `false`，其他 → 空字符串。

---

## 6. 历史图表：服务端降采样 + 逐指标聚合算法

**必须一次做到位，不做"先前端抽稀，以后再优化"的版本。**

主路径 `public:queryMetrics`，关键参数：

| 参数 | 用法 |
|---|---|
| `metric_keys` | 从 `public:listMetricDefinitions` 拿到的 key，启动时拉一次长期缓存 |
| `entity_ids` | 节点 UUID 数组，留空 = 全部可见节点 |
| `start` / `end` | RFC3339 **带时区**；或用 `hours`（默认 4） |
| `downsample` | `true`（默认），服务端聚合 |
| `max_points` | 默认 500，从主题设置 `maxPoints` 读 |
| `aggregation` | 默认 `avg` |
| `aggregation_by_metric` | **逐指标覆盖算法，这是关键** |

### 为什么必须用 `aggregation_by_metric`

`avg` 会抹平尖刺：一个 100% 的 CPU 峰值平均进 10 个采样点就变成 10%，图上看不见。所以按指标分别指定：

| 指标 | 算法 | 理由 |
|---|---|---|
| CPU、GPU、load、网络速率、ping | `max` | 尖刺是信号，不是噪声 |
| 内存、swap、磁盘 | `avg` | 缓变量，平均更能代表区间状态 |

降级路径 `common:getRecords`（`maxCount` 默认 4000，`-1` 不限）只做前端抽稀，作为 `queryMetrics` 不可用时的兜底 —— 注意它返回的是 `StatusRecord[]`（`uuid` 指定时）或 `{[uuid]: StatusRecord[]}`（不指定时），两种返回结构都要处理。

ping 走 `public:getPingMetricStats`，参数 `entity_ids` / `task_ids` / `start` / `end` / `hours`（默认 4）/ `max_points`（默认 500）。

---

## 7. 为什么不用 axios 和 TanStack Query

这两个决策已经定了，实现时不要自行加回来。

**不用 axios：**

- Komari 的响应是 `{status, message, data}` 信封，出错时是 **HTTP 200 + `status: "error"`**。axios 的 `validateStatus` 只看 HTTP 状态码，这种情况不抛错，照样要写 interceptor 拆信封 —— 该干的活一件没少。
- 主数据路径整个走 JSON-RPC over WebSocket，axios 完全不参与。
- 剩下的 HTTP 只有同源 GET 和一个 POST 兜底。session cookie 是 HttpOnly 同源自动带，`fetch` 默认 `credentials: 'same-origin'` 就够。

写一个约 20 行的 `request()` 封装即可：拆信封、`status !== 'success'` 就 throw、支持 `AbortSignal`。

**不用 TanStack Query：**

它的模型是"query key → 请求 → 缓存"，而我们的主数据是一条 WebSocket 上跑 JSON-RPC 多路复用、每 1–2s 一帧的推送式状态。塞进去只有两种写法：包 `queryFn` + `refetchInterval`（Query 退化成定时器，中间多一层缓存失效逻辑碍事），或者 `setQueryData` 手动推（已经绕过它全部机制）。

共享需求用 `useSyncExternalStore` 解决 —— 这正是 React 官方为"订阅外部数据源"设计的 API，我们的 RPC store 就是外部数据源，而且能做到**按节点粒度订阅**，30 个节点每 2s 刷新时不会整个网格重渲染。

---

## 8. 架构分层

强制分层，**组件里不允许出现 `fetch` 或 `new WebSocket`**：

```
组件 → hook → store / service → transport(rpc.ts) → WebSocket / fetch
```

```
src/
├── lib/
│   ├── types.ts          Client / NodeStatus / StatusRecord / Record / PublicInfo
│   │                     / PingTask / MetricDefinition / ThemeSettings
│   ├── request.ts         fetch 封装：拆信封、throw、AbortSignal
│   ├── rpc.ts             JsonRpcClient：id 自增、pending Map、超时、
│   │                      连接中排队、指数退避重连、POST 兜底
│   ├── capabilities.ts    rpc.methods 探测 → Set<string> + 能力布尔量
│   ├── transport.ts       路径选择、轮询循环、visibilitychange 暂停、
│   │                      重连后重新拉取
│   ├── normalize.ts       嵌套 / Record → NodeStatus
│   ├── format.ts          bytes / bps / percent / uptime / currency /
│   │                      expiry / trafficUsed(type)
│   └── store.ts           外部 store + useSyncExternalStore 选择器
├── i18n/
│   ├── index.ts           读 localStorage 的 language key（不用自带探测默认值）
│   └── locales/{zh-CN,zh-TW,en}.ts
├── hooks/
│   ├── useAppearance.ts   appearance key + matchMedia 监听 + storage 事件
│   ├── useLanguage.ts     language key + storage 事件
│   ├── usePublicInfo.ts   站点信息 + theme_settings
│   ├── useThemeSettings.ts 类型化访问器 + 默认值合并 + 6 种容错
│   ├── useNodes.ts        元数据 + 实时状态合并、置顶、按 weight 排序
│   ├── useNodeHistory.ts  queryMetrics（逐指标算法）+ 降级
│   └── usePingStats.ts    ping 任务与统计
├── components/
│   ├── Layout.tsx  Navbar.tsx  Footer.tsx
│   ├── AppearanceToggle.tsx  LanguageMenu.tsx  ViewToggle.tsx
│   ├── NodeCard.tsx  NodeTable.tsx
│   ├── StatusDot.tsx  UsageBar.tsx  Sparkline.tsx
│   ├── TrafficQuota.tsx  ExpiryBadge.tsx  PingBadges.tsx
│   └── Chart.tsx          uPlot 封装，含 resize 与 dispose
└── pages/
    ├── Index.tsx          网格 / 表格双视图
    └── NodeDetail.tsx     四张历史图 + ping 图 + 硬件信息
```

---

## 9. i18n 与深浅色切换

官方提供**与默认主题共享的两个 localStorage key**，复用它们，用户偏好就能跨主题互通：

| Key | 取值 |
|---|---|
| `appearance` | `light` / `dark` / `system` |
| `language` | 如 `zh-CN` |

四个实现要点：

1. i18next **不要用自带语言探测的默认行为**，让它读官方的 `language` key（`i18next-browser-languagedetector` 配 `lookupLocalStorage: 'language'`，或者直接手动初始化 `lng`）。当前依赖里没装 detector，手动读更省一个包。
2. `appearance` 为 `system` 时要挂 `matchMedia('(prefers-color-scheme: dark)')` 的 change 监听，**读一次不够**。
3. 加 `storage` 事件监听做跨标签页同步。注意同标签页内自己写 localStorage **不触发** `storage` 事件，自己改的时候要手动通知订阅者。
4. `index.html` 里已有 pre-paint 脚本负责首屏不闪白，`useAppearance` 只负责运行时同步，**不要重复实现首屏逻辑**。

manifest 与市场条目里的 `name` / `description` / `author` 支持 locale 对象，回退顺序：**当前语言 → 基础语言 → 对象第一个值**。

深色模式已在 `src/index.css` 配好 `@custom-variant dark (&:where(.dark, .dark *))`，由 `<html>` 上的 `dark` class 驱动。状态色 token 已定义为 `--color-status-online` / `--color-status-warn` / `--color-status-offline`，Tailwind 里用 `text-status-online` 这类工具类即可。

---

## 10. 主题设置读取

`komari-theme.json` 的 `configuration` 块已写好（`type: "managed"`），实现方只需**读取**，不需要改 manifest。

- 读取路径：`GET /api/public` → `data.theme_settings`，或 RPC `common:getPublicInfo`
- 要求服务端 ≥ **1.0.5**；低于此版本 `theme_settings` 不存在，全部走代码里的默认值

已定义的 key（类型见 manifest）：`defaultView` `refreshInterval` `showDisk` `showLoad` `showSparkline` `showTraffic` `showExpiry` `showPrice` `showPing` `featuredPingTasks` `historyHours` `maxPoints` `featuredNodes` `footerHtml`。

`useThemeSettings` 必须容错这 6 种情况（官方列出的兼容案例）：

1. `configuration` 整个缺失（早于 1.0.5 的主题）
2. `configuration.type` 缺失 → 按 `managed` 处理
3. `managed` 的 `data` 为 null / 空 / 非数组
4. item 缺 `key`（`title` 类型除外）或类型未知
5. `raw` 的 `data` 不是非空字符串
6. `redirect` 的 `data` 不是合法站内相对路径

两个选择器类型的存储格式：`featuredNodes`（`nodes` 类型）存 UUID 的 **JSON 字符串数组**，读回来是 `string[]`；`featuredPingTasks`（`pingtasks` 类型）存数字任务 ID，读回来是 `number[]`。两者默认值都是字符串 `"[]"`，**要先 parse**。

---

## 11. DOM 钩子约定

官方默认主题暴露 `km-` 前缀的语义类名，供运营者的自定义 head/footer HTML、浏览器扩展和用户脚本挂钩。本主题应沿用同一套命名，否则用户从默认主题切过来时脚本全失效：

| 类别 | 模式 | 例 |
|---|---|---|
| 页面根 | `km-page-<route>` | `km-page-instance` |
| 布局 | 固定名 | `km-layout` `km-main` `km-navbar` `km-footer` |
| 共享组件 | `km-<component>` | `km-node-card` `km-load-chart` |
| 页面区块 | `km-<page>-<section>` | `km-instance-server-list` |
| UI 原子 | `km-ui-<component>` | `km-ui-button` `km-ui-table-row` |

`src/App.tsx` 里已经用了 `km-main` 作为示范。

---

## 12. 实施顺序

每一步结束都要 `npm run build && npm run verify` 通过再进下一步。

| # | 内容 | 产出 |
|---|---|---|
| 1 | `types.ts` + `format.ts` + `normalize.ts` | 三种形状的类型与转换，纯函数，可单测 |
| 2 | `request.ts` + `rpc.ts` + `capabilities.ts` | 能连上真实服务端、能力探测出正确结果 |
| 3 | `store.ts` + `transport.ts` + `useNodes.ts` | 控制台能打印出实时节点数据，轮询会在切标签页时暂停 |
| 4 | `i18n/` + `useAppearance` + `useLanguage` + `Layout`/`Navbar`/`Footer` | 三语切换、深浅色切换可用，页脚含版权行 |
| 5 | `NodeCard` + `NodeTable` + `Index.tsx` + 双视图切换 | 首页完整 |
| 6 | `Chart.tsx` + `useNodeHistory` + `usePingStats` + `NodeDetail.tsx` | 详情页完整，历史走服务端降采样 |
| 7 | `useThemeSettings` 接入全部组件 + `preview.png` | 后台设置项真实生效 |

第 1–3 步是全部风险集中的地方，先把它们跑通再碰任何 UI。

---

## 13. 验收标准

- [ ] `npm run build` 无 TS 错误（strict 全开，禁止 `any` 和非空断言绕过）
- [ ] `npm run verify` 通过
- [ ] `npm run package` 产出 zip，`komari-theme.json` 在**归档根**、与 `dist/` 同级
- [ ] 三条降级路径都实测过：RPC2 可用 / RPC2 不可用 / `queryMetrics` 不可用
- [ ] `appearance` 和 `language` 与默认主题互通（在默认主题里改，切到本主题后保持）
- [ ] 深浅色首屏无闪白
- [ ] ping 图上丢包处是断线，不是负值尖刺
- [ ] 五种 `traffic_limit_type` 各自算出的已用流量正确
- [ ] `expired_at` 为 `null`、`price` 为 `-1`/`0`、`gpu_name` 为 `"None"` 时 UI 不出现空洞或 `NaN`
- [ ] 页脚含 `Powered by Komari Monitor.`
- [ ] 没有任何路由落在 `/admin` 或 `/terminal`
- [ ] 切到后台标签页后轮询停止（Network 面板确认）

---

## 14. 已知缺口与风险

| 项 | 状态 |
|---|---|
| `public:queryMetrics` 的最低服务端版本 | **官方文档未给逐方法版本表**，只说 RPC2 整体 ≥ 1.0.7。必须靠 `rpc.methods` 探测，不能硬编码 |
| `metric_key` 的取值空间 | 文档未列举，靠 `public:listMetricDefinitions` 运行时发现 |
| JSON-RPC 错误码 | 文档只提 `InvalidParams` / `InternalError`，无数字码表 |
| WebSocket 鉴权方式 | 文档未说明 header / query / 首帧登录，同源 cookie 应当自动带上，需实测 |
| 心跳与重连 | 文档完全没有约定，自行设计 |
| `uptime` / `message` | 只存在于嵌套形状，RPC2 路径下拿不到 |
| 主题市场上架 | 需服务端 ≥ 1.3.0，走 GitHub Release + SHA-256，向 `komari-monitor/theme-market` 提 PR。先发 Release 再提 catalog，顺序反了会 404 |

---

## 15. 本地开发

```bash
cp .env.example .env.local   # 填入 VITE_API_TARGET 指向真实 Komari 实例
npm run dev                   # 端口 5273，/api 与 /themes 都已代理，含 ws
```

打开 `http://localhost:5273/` 即可，页面路径和线上一致（`/`、`/instance/xxx`），地址栏不需要带 `/themes/{short}/dist/` 前缀 —— 那个前缀只出现在构建产物的资源引用里（见 §3 约束 4）。

`vite.config.ts` 的 dev proxy 已经把 `/themes` 也代理过去，所以后台的主题设置表单在开发态就能加载到 manifest，不用每次打包。

开发态代理还会把 `Origin` / `Referer` 改写成目标实例。服务端在 CORS 开启时会校验 Origin（`web/security/cors.go`：`origin != "" && allowOrigin == ""` 直接 403），而 `changeOrigin` 只改 Host 头，浏览器发出的 `Origin: http://localhost:5273` 与实例 Host 不符也不在白名单里，`/api/*` 和 `/api/rpc2` 会全部 403。改写之后 `OriginMatchesHost` 即可通过，不必去实例后台加白名单。这只影响本地开发，装到服务端后是同源请求。

