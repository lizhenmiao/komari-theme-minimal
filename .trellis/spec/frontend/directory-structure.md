# Directory Structure

> 本项目的实际目录组织。所有文档与注释用中文。

---

## 项目性质

Komari Monitor 的第三方主题：**纯浏览器端静态包**，没有后端。构建产物是一个 zip，
装到 Komari 服务端（Go）后由它提供 `index.html` 和静态资源。

服务端代码不在本仓库。`.tmp/komari/` 是服务端 Go 源码的参考克隆（已 gitignore，
不要删）—— 判断服务端行为时查它，不要猜。

---

## 实际布局

```text
src/
├── main.tsx              入口：createRoot + StrictMode
├── App.tsx               外壳：背景层、路由、页脚、传输层生命周期
├── index.css             Tailwind v4 入口 + 全部 km-* 语义类
├── vite-env.d.ts
├── pages/                路由级页面，每个对应一条 Route
│   ├── Index.tsx         首页：卡片 / 表格双视图
│   └── NodeDetail.tsx    详情页：当前值、历史曲线、完整配置
├── components/           展示型组件，一个文件一个组件
├── hooks/                自定义 hook，每个封装一类数据或浏览器状态
├── lib/                  无 React 依赖的纯逻辑与网络层
└── i18n/
    ├── index.ts          i18next 初始化
    └── locales/          zh-CN / zh-TW / en

scripts/                  六层检查与构建工具（Node，无测试框架依赖）
└── lib/                  被多个脚本复用的模块
docs/IMPLEMENTATION_PLAN.md   接口契约、约束、踩过的坑
public/
├── favicon.svg
└── flags/                249 面自托管国旗 SVG（npm run flags 生成）
```

---

## 分层规则

### `lib/` — 不许 import React

`lib/` 下全部是纯逻辑，能在 Node 里直接跑（`scripts/format-check.mjs` 就是这么测的）。

| 文件 | 职责 |
| --- | --- |
| `types.ts` | 接口数据结构。三种不兼容的状态形状都在这里 |
| `store.ts` | 模块级单例 store，供 `useSyncExternalStore` 消费 |
| `transport.ts` | 唯一的网络生命周期入口：能力探测、轮询、降级 |
| `rpc.ts` | `/api/rpc2` 的 JSON-RPC 客户端（WS 优先，POST 兜底） |
| `capabilities.ts` | 通过 `rpc.methods` 做运行时能力探测 |
| `request.ts` | REST 请求与 WebSocket URL 构造 |
| `normalize.ts` | 三种数据形状 → 统一的 `NodeStatus` |
| `metrics.ts` | 指标仓库的键名、返回结构、序列提取 |
| `format.ts` | 展示格式化与边界处理 |

### `hooks/` — 组件与 `lib/` 之间的桥

组件不直接 import `lib/transport`。少数地方 `pages/` 直接用 `getState`/`subscribe`
读 `publicInfo` 和 `pingTasks`（`pages/NodeDetail.tsx:96-100`），因为那两个不值得
单独包一个 hook；这是有意的，不是遗漏。

### `components/` — 只关心渲染

组件不发请求。唯一订阅 store 的是 `NodeCard`（通过 `useNodeStatus` 做按节点订阅，
避免 30 个节点每 2 秒刷新时整个网格重渲染）。其余数据由 `pages/` 取好传下来。

---

## 命名

| 类型 | 约定 | 例 |
| --- | --- | --- |
| 组件文件 | PascalCase，默认导出同名组件 | `NodeCard.tsx` |
| hook 文件 | camelCase，`use` 前缀 | `useNodeHistory.ts` |
| lib 文件 | camelCase，命名导出 | `format.ts` |
| CSS 类 | `km-` 前缀，语义化 | `km-node-card`、`km-fill-cpu` |

`km-*` 类名同时是检查脚本的定位锚点（`km-instance-info`、`km-ui-flag`、
`km-node-card`…）。改名或删除前先 grep `scripts/`，否则会静默让某层检查
失去目标 —— 检查照常通过，但什么都没测。

---

## 检查脚本

`scripts/` 下每个脚本对应一层检查，见
[quality-guidelines.md](./quality-guidelines.md) 的六层表格。

`scripts/lib/` 放复用部分：`cdp.mjs`（Chrome DevTools Protocol 客户端）、
`spawn-mock.mjs`、`zip.mjs`、`png.mjs`、`node-websocket.mjs`。
