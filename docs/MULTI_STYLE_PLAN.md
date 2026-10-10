# 多风格方案：经典 / Vercel / Apple 三选一

> 主题已正式上线（v1.0.0）。这次只**新增两种界面风格**，与现有界面并存，由部署 Komari 的管理员在后台选择。
> 数据层（接口、轮询、降级链、字段换算）全部沿用，不重写。
>
> 视觉参照：`design/styles/`（双击即开，零外部请求）
>
> | 页面 | Vercel / Linear | Apple |
> | --- | --- | --- |
> | 首页（卡片 + 表格） | `vercel.html` | `apple.html` |
> | 详情页（`?id=d4` 切节点） | `vercel-detail.html` | `apple-detail.html` |
>
> 样张里的数据是 `design/styles/data.js` 生成的模拟值，**字段单位与真实接口不同**（例如样张网速按 byte/s 存，
> 真实 `net_in` / `net_out` 是 bit/s），落地时一律以 §4 的映射表为准，不要照抄样张的换算。

---

## 1. 目标

1. 主题内置三种风格：**经典**（现在线上这套，保持原样）、**Vercel / Linear**、**Apple**。
2. 管理员在「后台 → 主题 → Minimal 设置」里选风格，**默认 Apple**。访客只能看到管理员选的那一种，**不能自行切换**。
3. 后台新增两项配置：是否显示「需要注意」板块；默认外观（亮色 / 暗色 / 跟随系统）。
4. 现有的「默认视图（卡片 / 表格）」保留，三种风格都必须支持表格视图。

## 2. 已确认的决策

| # | 决策 | 来源 |
| --- | --- | --- |
| D1 | 三种风格并存，经典风格的外观与行为保持不变 | 用户 |
| D2 | 风格只由管理员在后台设置，访客端不提供任何切换入口 | 用户 |
| D3 | 新增风格默认值为 Apple | 用户 |
| D4 | 后台可控制「需要注意」板块是否显示 | 用户 |
| D5 | 后台可设默认视图（已有 `defaultView`）与默认外观（新增） | 用户 |
| D6 | CPU、内存、磁盘、百分比等字段映射沿用现有数据层，见 §4 | 用户 |
| D7 | 新风格卡片保留经典卡片的信息量（样张二轮已补齐） | 用户 |
| D8 | 机柜热力墙方向放弃（设计稿已删除） | 用户删除 `design/rack/` |
| D9 | **老站点升级后同样默认 Apple**。服务端读设置时，后台没存过的键直接补清单默认值（`.tmp/komari/database/utils.go` 中 `tc_data[item.Key] = managedconfig.DefaultValue(item)`），分不出新装和老装；Release 说明里写清「想保留原样，到后台把风格选回经典」 | 用户 |
| D10 | 关闭「需要注意」只隐藏那个区块；卡片上的问题徽章、页头「N 台需要注意」计数照常显示 | 用户 |
| D11 | 经典风格不加「需要注意」区块（由 D1 决定），`showAttention` 只作用于 Vercel / Apple | D1 推论 |
| D12 | 「默认外观」出厂默认为跟随系统，和现在的行为一致 | 用户 |
| D13 | 访客仍可自己切换亮 / 暗；后台设置只决定访客没选过时的初始值 | 用户 |
| D14 | Inter 字体随主题打包，同时附带 OFL 授权文本（许可要求，见 §5.9） | 方案假设，用户未提异议 |

## 3. 待确认

无。原先的五个问题已全部转为上表的 D9～D13。

---

## 4. 字段映射（沿用，不改）

新风格只换展示，取值与换算一律走现有函数。来源：`src/components/NodeCard.tsx`、`src/pages/NodeDetail.tsx`、`src/lib/format.ts`。

| 展示项 | 取值 | 换算 / 格式化 | 备注 |
| --- | --- | --- | --- |
| CPU 百分比 | `status.cpu` | `ratio(status.cpu, 100)` | 已是百分比 |
| CPU 已用核数 | `client.cpu_cores * status.cpu / 100` | `toFixed(1)` | 经典卡片显示「3.6C / 8C」 |
| 内存百分比 / 已用 / 总量 | `status.ram`、`status.ram_total \|\| client.mem_total` | `ratio()`、`formatBytes()` | 总量优先取实时值 |
| 磁盘 | `status.disk`、`status.disk_total \|\| client.disk_total` | 同上 | 受 `showDisk` 控制 |
| Swap | `status.swap`、`status.swap_total \|\| client.swap_total` | 同上；总量为 0 显示「未开启」 | |
| 流量配额 | `trafficUsed(status, client.traffic_limit_type)` / `client.traffic_limit` | `ratio()` | `traffic_limit > 0` 才显示；受 `showTraffic` 控制 |
| 实时网速 | `status.net_out`（上行）、`status.net_in`（下行） | `formatSpeed()`（**bit/s → byte/s**） | |
| 累计流量 | `status.net_total_up` / `net_total_down` | `formatBytes()` | |
| 负载 | `status.load` / `load5` / `load15` | `toFixed(2)` | 受 `showLoad` 控制 |
| CPU 趋势线 | `useCpuTrend(uuid)` | — | 轮询累积，刚打开时为空；受 `showSparkline` 控制 |
| 延迟 | `pingLatest[\`${uuid}:${taskId}\`]` | 负值 = 丢包 | 卡片任务由 `featuredPingTasks` 决定；受 `showPing` 控制 |
| 到期 | `client.expired_at` | `formatExpiry()`、`daysUntil()`、`isLongTerm()` | 受 `showExpiry` 控制 |
| 价格 | `formatPrice(client)` | — | 受 `showPrice` 控制（默认关，价格对所有访客可见） |
| 在线时长 | `status.uptime` | `formatUptime()` | |
| 标签 | `parseTags(client.tags)` | — | |
| 国旗 / 系统图标 | `client.region` / `client.os` | `RegionFlag` / `OsIcon` 组件 | 自托管，不发外部请求 |
| 详情页历史 | `useNodeHistory()`、`usePingStats()` | — | 区间、降采样、丢包统计不变 |
| 阈值 | 75 / 90 | `src/lib/tone.ts` | 唯一来源，新风格复用 |

**现有设置项在三种风格里语义一致**：`showDisk / showLoad / showSparkline / showTraffic / showExpiry / showPrice / showPing / featuredPingTasks / featuredNodes / historyHours / maxPoints / refreshInterval / footerHtml / defaultView` 全部生效。样张里没体现开关，落地时每张卡片、每个表格列都要按开关隐藏。

---

## 5. 技术设计

### 5.1 新增设置项（`komari-theme.json`）

插在「外观」分组最前面：

| key | type | options | default | 说明 |
| --- | --- | --- | --- | --- |
| `style` | select | `apple,vercel,classic` | `apple` | 界面风格 |
| `defaultAppearance` | select | `system,light,dark` | `system`（D12） | 访客没选过外观时的初始值 |
| `showAttention` | switch | — | `true` | 「需要注意」板块；仅 Vercel / Apple 有此区块 |

- `select` 的 `options` 是逗号分隔字符串，**没有逐项的多语言标签**（`.tmp/komari/internal/managedconfig/selectors.go`、`database/models/theme.go` 的 `Options string`）。后台下拉框大概率直接显示选项值，所以选项值要一看就懂，三语 `help` 里写清楚每个值是什么样子。装到实例上确认后台的实际显示。
- `theme_settings` 走无鉴权的 `GET /api/public`，三项都不含敏感信息。

### 5.2 读取设置

- `src/lib/types.ts` 的 `ThemeSettings` 加 `style: 'apple' | 'vercel' | 'classic'`、`defaultAppearance: 'system' | 'light' | 'dark'`、`showAttention: boolean`。
- `src/hooks/useThemeSettings.ts`：`DEFAULT_SETTINGS` 与 `resolveSettings()` 补三项。非法值回退默认值，开关沿用 `readBoolean()`（后台可能存成字符串）。
- `scripts/mock-server.mjs` 的 `THEME_SETTINGS` 补三项，并加 `--style=<名称>` 参数，供检查脚本逐个风格跑。

### 5.3 风格生效与防闪

问题：风格和默认外观都要等 `/api/public` 返回才知道，而首屏渲染早于它。

方案：

1. `<html data-style="…">` 驱动全部风格差异，CSS 用 `[data-style='apple']` 作用域。
2. 设置到达后，新组件 `StyleSync`（放在 `App.tsx`，和现有的 `TransportConfigurator` 同级）写入 `data-style`，并把 `style` 与 `defaultAppearance` 缓存到 localStorage（键 `km-minimal-style`、`km-minimal-default-appearance`）。
3. `index.html` 的 pre-paint 脚本先读缓存，在首帧前打上 `data-style`；没有缓存（第一次访问）就用 `apple`。
4. 结果：第一次访问时，如果管理员选的不是 Apple，会在设置返回的那一刻切换一次。这时页面还处在骨架屏阶段，切换发生在骨架上。之后的访问都不会闪。
5. 约束：`index.html` 注释只能用 ASCII，`npm run verify` 会检查；改 pre-paint 脚本时不能动三处服务端替换哨兵。

访客端不提供风格切换入口（D2）；缓存键只是性能缓存，不是访客偏好，每次设置返回都会被覆盖。

### 5.4 默认外观

- `useAppearance` 现在没有存储值时回退到 `system`。改为回退到 `settings.defaultAppearance`。
- 访客自己切过外观后，以 localStorage 的 `appearance` 为准。这个键和 Komari 默认主题共用，保持不变。
- pre-paint 脚本：`appearance` 有值时用它，没有就读缓存的 `km-minimal-default-appearance`，再没有才用 `system`。

### 5.5 页面结构：数据装配与风格视图分离

现在 `pages/Index.tsx` 和 `pages/NodeDetail.tsx` 同时负责取数据和渲染。拆成两层：

```text
pages/Index.tsx          取数据、分组筛选、视图切换、骨架判断 → 组装 IndexModel
  └─ 按 settings.style 选择：
     styles/classic/IndexView.tsx   现有 JSX 原样搬过来
     styles/vercel/IndexView.tsx
     styles/apple/IndexView.tsx
pages/NodeDetail.tsx     同理组装 DetailModel → styles/*/DetailView.tsx
```

- `IndexModel` / `DetailModel` 是普通的 TypeScript 接口（节点列表、汇总、分组、当前视图、卡片延迟任务、设置、访客身份、`firstLoad`、事件回调），三种风格吃同一份。
- 风格视图只做展示，不调用取数据的 hook；节点级的小 hook（`useCpuTrend`、`useNodeStatus`）照旧可以在卡片里调用。
- 三种风格在同一个包里，不做按风格懒加载：一个访客只看一种，但懒加载会在首屏多一次 Suspense 闪烁，换来的那点体积不值得。
- 新组件按风格放进 `src/styles/vercel/`、`src/styles/apple/`。两种新风格共用的纯逻辑放 `lib/`，共用的展示组件放 `components/`。

### 5.6 「需要注意」逻辑

新文件 `src/lib/attention.ts`，纯函数，不依赖 React：

- 输入 `NodeView` 与设置，输出问题列表：离线、CPU / 内存 / 磁盘 ≥ 90、配额 ≥ 90（含超额）、已过期、7 天内到期。75~90 只染色，不点名。
- 阈值从 `lib/tone.ts` 导出复用（现在 `WARN_AT` / `BAD_AT` 是模块私有的，改为导出）。
- 首页区块、卡片徽章、详情页的「一句话状态」共用这一份结果。
- 「7 天内到期」用 `daysUntil()`，长期判定用 `isLongTerm()`，不硬编码年份。
- 在 `scripts/format-check.mjs` 里补边界断言：刚好 90、刚好 7 天、长期、离线。

### 5.7 样式组织

- 现有 `--color-km-*` 令牌（`src/index.css` 的 `@theme`）作为经典风格的值保留。
- 新风格在 `[data-style='vercel']` 和 `[data-style='apple']`（以及各自的 `.dark` 组合）下声明自己的令牌，命名沿用样张：底色、面板、线、正文、弱化文字、暖、烫等。
- 组件的类名用风格前缀，避免互相覆盖：`km-v-*`、`km-a-*`。
- **检查锚点**：`scripts/` 依赖 `km-node-card`、`km-index-table`、`km-index-groups`、`km-auth-entry`、`km-instance-info`、`km-instance-current`、`km-ui-ping-badges`、`km-dot-live` 等类名（`grep -ohE "km-[a-z0-9-]+" scripts/*.mjs` 可列全）。新风格的对应元素**必须带上同名锚点类**，否则检查脚本在新风格下失效。

### 5.8 图表

- 详情页继续用现有的 `components/Chart.tsx`（uPlot），不移植样张里手写的 SVG 引擎：uPlot 已经接好降采样、十字准线和丢包断线，性能也好。
- 新增「越阈值变色」：占用类序列的 stroke 用 canvas 竖向渐变，在 75 / 90 对应的 y 位置设硬色标，效果等同样张里的三段裁剪。经典风格不开启。
- 颜色仍然通过 `readToken()` 从 CSS 令牌解析。风格切换时和深浅切换一样要 `clearTokenCache()`，然后重建图表。

### 5.9 字体

- Vercel 风格用 Inter；Apple 风格在 Apple 设备上用系统 SF，其他平台退到 Inter。
- `inter-latin-wght-normal.woff2`（48 KB，仅拉丁子集，中文走系统字体）放进 `public/fonts/`，随主题打包。
- **OFL 要求分发时附带授权文本**：`OFL-inter.txt` 同目录一起打包，README 致谢里注明。
- 只在 `[data-style='vercel']` / `[data-style='apple']` 下引用 Inter，经典风格不加载。

### 5.10 检查脚本

| 脚本 | 改动 |
| --- | --- |
| `render-check.mjs` | 对三种风格各跑一遍现有断言（通过 mock 的 `--style`），再补新风格特有的断言（「需要注意」区块存在、`showAttention=false` 时不存在） |
| `browser-check.mjs` | 三种风格 × 深浅各截一张图；风格切换不残留旧风格的 DOM |
| `format-check.mjs` | `lib/attention.ts` 的边界断言（§5.6） |
| `smoke.mjs` / `dev-check.mjs` | 确认在 `--style` 参数下照常通过 |
| `zip-check.mjs` | 确认 `fonts/` 和授权文本进了包 |

`npm test` 在三种风格下全部通过，才算完成。

### 5.11 兼容、升级与回滚

- 低于 1.0.5 的服务端没有 `theme_settings` 字段，三项都回退默认值，行为与其他设置一致。
- 老站点升级后同样变成 Apple（D9）。
- 回滚：管理员在后台把风格切回「经典」就是即时回滚，不用重装主题。代码层面经典风格的 JSX 是原样搬移的，搬移那一步单独成提交，出问题可以单独回退。
- 版本号升到 **1.1.0**（新增功能，不破坏现有设置）。

---

## 6. 实施步骤

每一步完成都跑 `npm run build && npm test`，通过后再进入下一步。

1. **设置项打底**：manifest 加三项（§5.1）→ `types.ts`、`useThemeSettings.ts`、mock 加 `--style` → 三语 `help` 文案。
   验证：`npm run build`；`resolveSettings()` 的非法值回退由 format-check 覆盖。
2. **风格与外观生效**：`StyleSync`、`data-style`、pre-paint 读缓存、`useAppearance` 回退到 `defaultAppearance`（§5.3、§5.4）。
   验证：`npm run verify`（ASCII 与哨兵）；浏览器里切换后台设置后刷新，无白闪。
3. **经典风格搬移（零视觉变化）**：抽出 `IndexModel` / `DetailModel`，把现有 JSX 移到 `styles/classic/`。
   验证：`npm test` 全绿；`npm run browser` 截图和改动前逐张比对，**像素级无差异**。这一步单独提交。
4. **共用逻辑**：`lib/attention.ts`，导出 `tone.ts` 的阈值，补 format-check 断言。
5. **Apple 风格**：首页（卡片、表格、需要注意、分组、骨架）→ 详情页（抬头、状态横幅、三环、小组件、图表、分组列表）。对照 `design/styles/apple*.html`。
6. **Vercel 风格**：同上，对照 `design/styles/vercel*.html`。
7. **图表阈值变色**（§5.8），两种新风格启用。
8. **字体打包**（§5.9）。
9. **检查脚本扩展**（§5.10）。
10. **文档与发布物**：README 的设置表加三项；每种风格各一张预览图，主题市场的 `preview.png` 用 Apple；Release 说明写清风格切换入口和 D9 的升级影响；版本号升到 1.1.0。

风险较高、需要单独留意的文件：`index.html`（哨兵、ASCII）、`src/hooks/useAppearance.ts`（和默认主题共用的键）、`scripts/*`（锚点）。

---

## 7. 验收标准

- [ ] 后台出现三项新设置，三语文案正确；改设置后刷新，访客端立即生效
- [ ] 风格默认 Apple；选经典后，界面与 v1.0.0 逐像素一致
- [ ] 访客端没有任何风格切换入口；亮 / 暗切换照常可用
- [ ] 默认外观三个选项都生效；访客手动切过外观后，以访客的选择为准
- [ ] 默认视图卡片 / 表格在三种风格下都生效，访客切换后记住选择
- [ ] `showAttention` 关闭时 Vercel / Apple 不显示「需要注意」区块，卡片徽章与页头计数照常（D10）
- [ ] 现有全部设置开关在三种风格下都生效（§4 末尾那一组）
- [ ] 新风格的数值与经典风格完全一致：同一节点、同一时刻，CPU、内存、网速、流量、配额、延迟的数字相同
- [ ] 详情页 1 小时 / 4 小时 / 24 小时 / 7 天 / 30 天区间可用，十字准线可用，超过 75 / 90 的曲线段变色
- [ ] 375px 宽无横向滚动；深浅两种模式完整；零外部请求（字体自托管）
- [ ] `npm test`、`npm run browser`、`npm run package` 在三种风格下全部通过

## 8. 不做的事

- 访客自选风格
- 机柜热力墙、Grafana 风格（已放弃，设计稿已删）
- 改动数据层：接口、轮询、降级链、字段换算
- 经典风格的任何视觉改动

## 9. 风险

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| 老站点升级后被切到 Apple（D9） | 管理员没准备时外观突变 | Release 说明醒目提示；后台一键切回经典 |
| 后台下拉框显示原始选项值 | 管理员看到的是 `apple` / `vercel` / `classic` | 选项值本身可读，`help` 三语解释；装机后确认 |
| 首次访问时风格切换一次 | 骨架阶段的一次视觉跳变 | 只在没有缓存的第一次访问出现；切换发生在骨架上 |
| 三套展示层的维护成本 | 每次加字段要改三处 | 数据装配集中在 `pages/`，风格视图只消费 Model；检查脚本按风格全量跑 |
| 检查锚点漏加 | 新风格下检查静默失效 | §5.7 的锚点清单；render-check 对每种风格断言锚点存在 |

---

## 10. 实施记录（2026-10-10）

### 10.1 与计划不同的地方

| 计划 | 实际 | 原因 |
| --- | --- | --- |
| 目录 `src/styles/<名称>/` | `src/skins/<名称>/` | 「styles」容易和 CSS 混淆 |
| 新风格的类名用 `km-v-*` / `km-a-*` 前缀 | 在 `html[data-style=…]` 下**覆盖现有 `--color-km-*` 令牌的值**；两种新风格共用的类用 `km-s-*` | `bg-km-panel` 这类工具类编译成 `var(--color-km-panel)`，覆盖变量值就能整套换色，省掉三套并行类名。选择器用 `html[data-style]`（0,1,1）压过 `@theme` 的 `:root`（0,1,0），不依赖源码顺序 |
| 每种风格各自实现顶栏 | 三种风格共用 `components/Navbar.tsx`，只靠令牌换色 | 顶栏承载身份入口、语言、外观、视图切换，三份实现会把检查锚点和行为各写三遍。样张里的面包屑、标签页、搜索框没有落地 |
| — | 新增 `src/skins/shared/nodeFacts.ts` | §4 的字段映射只写在这一处，卡片、表格、详情页都从它取 |
| — | 新增 `--color-km-series1/2/3` 三个令牌 | Vercel 把指标色收成了灰阶，延迟图的三条线路需要专用的区分色。经典风格取值等于 cpu / mem / swap |

### 10.2 过程中发现并修掉的缺陷

1. **深浅切换后详情页图表不换色**（1.0 就存在）。`useAppearance` 每个调用方各持一份 state，导航栏切换时详情页的实例收不到通知，uPlot 一直留着旧配色。改为模块级单例 + `useSyncExternalStore`。`browser` 检查新增断言：切换后 canvas 必须被重建。
2. **经典风格的图表变成 Apple 配色**。颜色在渲染期从 DOM 读，`data-style` 在副作用里写，设置到达那一帧读到并缓存了旧皮肤的颜色。改为订阅「已经写在 DOM 上的皮肤」（`useAppliedSkin()`），颜色跟着它重算。
3. **浅色经典风格的延迟图第一条线不见了**。Tailwind v4 只输出被工具类用到的 `@theme` 变量，`series1` 只被 JS 读取，被整个裁掉，读出来是空串。挪到普通的 `:root` 规则里，回退从 `??` 改成 `||`。
4. **新风格选中的分组芯片白底白字**。选中态写在 `@layer components` 里，被无层的皮肤规则整层压过。挪出层外。
5. **假服务端的离线节点「最后上报时间」等于当前时间**，和真实服务端（`rep.UpdatedAt`）不同构，「离线多久」永远是 0。改为 3 小时 14 分钟前。

### 10.3 假服务端新增参数

`--style=<名称>`、`--no-attention`、`--freeze`（冻结时钟，用于逐像素比对），见 README。

### 10.4 验收结果

| 验收项 | 结果 |
| --- | --- |
| 后台三项新设置，三语文案 | 已加入 manifest。后台下拉框的实际显示待装机确认（§9 风险 2） |
| 默认 Apple；选经典与 v1.0.0 逐像素一致 | 冻结时钟、连拍比对：详情页深浅色均 **0 像素差异**；首页暗色 0、浅色 273 像素（最大通道差 5，位于 CPU 趋势线，基线自身连拍也有同样的差异） |
| 访客端没有风格切换入口；亮暗切换可用 | 是 |
| 默认外观三个选项生效，访客选择优先 | `format:check` 覆盖设置读取；运行时由 `useAppearance` 回退逻辑保证 |
| 默认视图在三种风格下生效 | 是，`browser` 检查覆盖新风格的表格切换与持久化 |
| `showAttention` 关闭只隐藏板块 | `render --no-attention` 覆盖 |
| 现有设置开关在三种风格下生效 | 卡片、表格、详情页都按开关隐藏对应项 |
| 同一节点数值三种风格一致 | 新风格只经 `nodeFacts.ts` 取值，换算全部调 `lib/format.ts` |
| 详情页五档区间、十字准线、越 75 / 90 换色 | 是（`Chart` 新增 `thresholds`，经典风格不开启） |
| 375px 不溢出、深浅完整、零外部请求 | `browser` 检查覆盖；Inter 字体随包分发并验证加载成功 |
| `npm test` / `npm run browser` / `npm run package` | 全部通过（见交付时的输出） |

### 10.5 没有做的

- 样张里的顶栏样式（面包屑、标签页、搜索框）
- 负载图上「核数」那条参考线
- 版本号：测试包用 `1.1.0-rc.1`。正式发版时运行 `npm run bump 1.1.0`，它会提交并打标签
