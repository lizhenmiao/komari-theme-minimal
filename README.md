# Komari Theme Minimal

[Komari Monitor](https://github.com/komari-monitor/komari) 第三方主题。内置三种界面风格，由管理员在后台选择；网格与表格双视图，深浅色可切换，简体中文 / 繁體中文 / English 三语。

![Apple 风格](preview.png)

## 三种风格

| Apple（默认） | Vercel | 经典 |
| --- | --- | --- |
| ![Apple](preview.png) | ![Vercel](docs/preview-vercel.png) | ![经典](docs/preview-classic.png) |
| 浅灰底、白色大圆角卡片，同心环表示 CPU / 内存 / 磁盘 | 黑白灰、极细描边，平时只有灰阶，出问题才上色 | 1.0 版的单色卡片与分段仪表条 |

- 风格只由管理员在后台设置，**访客不能自行切换**
- 三种风格共用同一套数据与换算，同一台机器在任何风格下显示的数字完全一致
- Apple 与 Vercel 首页顶部有「需要注意」板块，列出离线、占用过高（≥ 90%）、流量配额将尽、已过期或 7 天内到期的节点，可在后台关闭
- 两种新风格的详情页曲线在越过 75% / 90% 时换色

> [!NOTE]
> 从 1.0 升级时，后台没存过「界面风格」这一项，会按默认值显示成 Apple。想保留原来的样子，到后台把「界面风格」选成 `classic` 即可，设置即时生效，不用重装。

## 特性

- **双视图**：网格卡片与紧凑表格，访客的选择记在本地
- **卡片信息密度**：CPU、内存、交换、磁盘、负载、流量配额、三网延迟一屏看完
- **详情页六图**：CPU / 内存与交换 / 磁盘 / 网速 / 平均负载 / 延迟，uPlot 绘制，带十字准线浮层
- **分组筛选**：按 Komari 里配置的节点分组过滤，选择持久化
- **身份入口**：已登录显示后台入口，访客显示登录入口
- **首屏骨架屏**：数据到达前不留白屏
- **零外部请求**：国旗、系统图标与字体全部自托管，不向任何第三方 CDN 发请求（否则每个访客的 IP 都会泄漏给第三方，内网部署也会直接失效）

## 安装

### 主题市场

后台 → 主题 → 主题市场，找到 Minimal，点安装。

### 手动上传

从 [Releases](https://github.com/lizhenmiao/komari-theme-minimal/releases) 下载 `komari-theme-minimal-<版本>.zip`，在后台 → 主题 → 上传主题里选中它。

## 主题设置

安装后在后台 → 主题 → **Minimal 设置** 里配置。

| 键 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `style` | 选择 | `apple` | 界面风格：`apple` / `vercel` / `classic`。访客看到的就是这里选的，不能自行切换 |
| `defaultAppearance` | 选择 | `system` | 访客首次访问时的明暗：`system` 跟随系统 / `light` / `dark`。访客自己切换后以其本地选择为准 |
| `defaultView` | 选择 | `grid` | 首页初始视图。访客切换后以其本地选择为准 |
| `refreshInterval` | 数字 | `2` | 实时数据轮询间隔（秒）。标签页隐藏时自动暂停 |
| `showAttention` | 开关 | 开 | 首页「需要注意」板块，仅 Apple / Vercel 风格有。关闭后卡片上的问题提示照常显示 |
| `showDisk` | 开关 | 开 | 卡片显示磁盘 |
| `showLoad` | 开关 | 开 | 卡片显示负载 |
| `showSparkline` | 开关 | 开 | 每张卡片一条 CPU 趋势线 |
| `showTraffic` | 开关 | 开 | 按节点的 `traffic_limit_type` 计算流量配额 |
| `showExpiry` | 开关 | 开 | 显示到期时间 |
| `showPrice` | 开关 | **关** | 显示价格 |
| `showPing` | 开关 | 开 | 显示延迟与丢包 |
| `featuredPingTasks` | 探测任务 | 空 | 选 2-3 个在卡片上并排显示，留空则只在详情页展示 |
| `historyHours` | 数字 | `4` | 详情页图表默认时间范围 |
| `maxPoints` | 数字 | `500` | 每图最大点数，由服务端降采样 |
| `featuredNodes` | 节点 | 空 | 置顶节点，其余按权重升序 |
| `footerHtml` | 富文本 | 空 | 追加在页脚版权行之后 |

> [!WARNING]
> 主题设置通过**未鉴权、任何访客都能读**的 `GET /api/public` 下发。任何 token、密钥、私有地址都不要填进来。`showPrice` 默认关闭正是因为价格对所有访客可见。

## 本地开发

需要 Node 22。Vite 6 声明支持的范围是 `^18 || ^20 || >=22`，21 / 23 这类奇数版本不在其中；CI 用的是 22。

```bash
git clone https://github.com/lizhenmiao/komari-theme-minimal.git
cd komari-theme-minimal
npm install
```

有两种开发方式，各自解决不同的问题。

### 一、假服务端：不需要真实实例

```bash
npm run build
npm run mock          # http://127.0.0.1:4928
```

假服务端按真实接口形状返回固定数据，含 1 个离线节点、1 个已到期节点、若干分组，以及一个**没有配置任何探测任务**的节点。几个开关用来验证降级路径：

| 参数 | 作用 |
| --- | --- |
| `--no-rpc2` | 关掉 `/api/rpc2`，逼主题退回 REST 轮询 |
| `--no-metrics` | 关掉 `queryMetrics`，逼主题退回 `getRecords` |
| `--guest` | 切成未登录访客，用来验证后台入口确实被隐藏 |
| `--style=<名称>` | 指定界面风格（`apple` / `vercel` / `classic`），不传则用默认值 `apple` |
| `--no-attention` | 关掉「需要注意」板块，验证 `showAttention=false` 的分支 |
| `--freeze` | 冻结时钟，数值不再随时间变化，用来做改动前后的逐像素比对。副作用：「离线多久」这类按浏览器当前时间算的读数会显得离谱 |
| 任意数字 | 指定端口，默认 `4928`；传 `0` 让系统分配空闲端口 |

传参数时 `--` 不能省：

```bash
npm run mock -- --no-rpc2          # 对
npm run mock --no-rpc2             # 错，npm 把它当自己的配置吞掉，实际跑的是不带开关的版本
node scripts/mock-server.mjs --no-rpc2   # 也对，绕开 npm
```

假服务端只喂数据，页面用的是 `dist/` 里的产物 —— 改了代码要重新 `npm run build`。

### 二、代理到真实实例：带热更新

```bash
cp .env.example .env.local     # 填 VITE_API_TARGET
npm run dev                    # http://localhost:5273
```

dev server 把 `/api` 与 `/themes` 代理到 `VITE_API_TARGET`（`/api` 上开了 WebSocket 代理，rpc2 走的就是它），并**改写 `Origin` 与 `Referer`**。Komari 开启 CORS 时会校验 `Origin`，Vite 的 `changeOrigin` 只改 `Host` 头，浏览器发出的 `Origin` 仍是 `http://localhost:5273`，与实例的 `Host` 不符也不在白名单里，结果 `/api/*` 全部 403。改写之后不必去实例后台加白名单。

开发时直接访问 `http://localhost:5273/`，路径与线上完全一致（`/`、`/instance/xxx`）。**不要**在地址栏里带 `/themes/minimal/dist/` 前缀 —— 那只是构建产物里的资源前缀，带上去会让客户端路由匹配不到任何页面。

## 校验

```bash
npm test              # format:check + smoke + render ×3（每轮三种风格）+ dev:check
npm run browser       # 构建后用真实 Chrome / Edge 跑一遍
npm run package       # 构建 + 契约校验 + 打包 + 归档校验
```

分层是刻意的，每层抓的是上一层看不见的东西：

| 命令 | 抓什么 |
| --- | --- |
| `format:check` | 纯函数边界：长期到期日、`0001` 年、非法输入、探测任务适用性、「需要注意」的阈值两侧、风格设置的坏值回退。这些分支 DOM 层看不见 |
| `smoke` | 接口契约：字段形状、返回包装、降级路径。抓「HTTP 200、控制台干净、页面空的」那一类 |
| `render` | 在 Node 里挂真实组件树做 SSR，三种风格各跑一遍。抓「构建干净、页面空白」和快照引用不稳定（React #185） |
| `dev:check` | 真实 dev server 的 base 与代理。抓详情页在开发态打不开那类问题 |
| `browser` | 真实浏览器：国旗解码、排序、uPlot 挂载、筛选交互、身份入口、页脚外链；新风格另查令牌覆盖、字体加载、深浅切换后图表重建、375px 不溢出 |
| `package` | 归档契约：`komari-theme.json` 位置、`index.html` 四个哨兵、路径分隔符 |

另有 `node scripts/preview.mjs [--detail] [--style=<名称>] [--out=<路径>]` 用无头浏览器重拍预览图。主题市场读的是根目录的 `preview.png`（Apple 风格），另两张在 `docs/`。

## 打包

```bash
npm run package
```

产出 `komari-theme-minimal-<版本>.zip`，结构必须是：

```
komari-theme-minimal-<版本>.zip
├── komari-theme.json      ← 归档根，与 dist/ 同级
├── preview.png
└── dist/
    ├── index.html
    └── assets/…
```

把 `komari-theme.json` 放进 `dist/` 是最常见的安装失败原因。

## 发布

```bash
npm run bump 0.2.0            # 改 manifest、提交、打标签，一步完成
git push origin HEAD v0.2.0   # 推送触发发布工作流
```

`npm run bump` 会拒绝在工作区不干净时执行（否则版本变更会和无关改动混在同一个 commit 里），也会拒绝重复的标签。它**不推送** —— 推标签等于真的发一个版本出去，这一步必须显式。

推送后 GitHub Actions 跑完整校验、打包、建 Release，并在说明里给出归档的 SHA256。

版本号不是固定的，但**标签必须与 `komari-theme.json` 的 `version` 相等**，工作流第一步就卡这个。归档名由 manifest 派生（`scripts/package.mjs`），两者不一致就会发出一个名字和版本号互相矛盾的包。`npm run bump` 存在的意义就是让这两者不可能对不上。预发布版本把两边都写成 `0.2.0-rc1` 即可。

## 目录结构

```
src/
├── components/       展示组件，无数据获取
├── hooks/            连接 store 与组件的 useSyncExternalStore 读取层
├── i18n/             i18next 初始化与三份词条
├── lib/
│   ├── transport.ts  能力探测、轮询循环、REST 降级；含 StrictMode 双调用防护
│   ├── rpc.ts        /api/rpc2 的 JSON-RPC 客户端，WebSocket 优先、HTTP 兜底
│   ├── store.ts      外部 store，按节点粒度订阅，快照引用必须稳定
│   ├── normalize.ts  两种非规范状态结构 → NodeStatus
│   ├── metrics.ts    queryMetrics 的点分键名与单位换算
│   ├── theme-meta.ts 从 komari-theme.json 读主题名与仓库地址
│   └── …
├── pages/            Index（首页）与 NodeDetail（详情页）：取数据、组装页面模型、按风格分派
└── skins/            三种界面风格，只做排版，不取数据
    ├── model.ts      页面模型：容器与皮肤之间的契约
    ├── skins.css     新风格的令牌覆盖（html[data-style=…]）与共用类
    ├── shared/       两种新风格共用的组件与字段映射（nodeFacts.ts 是唯一的换算点）
    ├── classic/      1.0 的界面，原样搬移
    ├── vercel/
    └── apple/

scripts/              各层校验、假服务端、打包、图标抓取
```

## 社区支持

学 AI , 上 L 站：[LinuxDO](https://linux.do)

## 许可

[MIT](./LICENSE)

随包分发的 [Inter](https://github.com/rsms/inter) 字体使用 SIL Open Font License 1.1，授权文本见 [`public/fonts/OFL-inter.txt`](./public/fonts/OFL-inter.txt)。

## Star History

<a href="https://www.star-history.com/?repos=lizhenmiao%2Fkomari-theme-minimal&type=timeline&logscale=&legend=bottom-right">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=lizhenmiao/komari-theme-minimal&type=timeline&theme=dark&logscale&legend=bottom-right" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=lizhenmiao/komari-theme-minimal&type=timeline&logscale&legend=bottom-right" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=lizhenmiao/komari-theme-minimal&type=timeline&logscale&legend=bottom-right" />
 </picture>
</a>
