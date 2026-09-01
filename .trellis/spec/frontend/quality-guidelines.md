# Quality Guidelines

> 本项目的质量标准。注释与文档一律用中文（运营者要求），这一条覆盖模板里的英文默认约定。

---

## Overview

这是一个 Komari Monitor 第三方主题：纯浏览器端静态包，装到 Go 服务端后由它提供 `index.html` 和资源。没有测试框架，靠 `scripts/` 下的六层检查（见下）。

核心质量风险不是崩溃，而是**静默失败**：请求全是 200、控制台干净、页面照常渲染，只是内容是空的或数字是错的。本文件记录的几乎全部是这一类。

---

## Forbidden Patterns

### 1. 不要用 `Array.isArray` 单独判定接口返回

这是本项目最贵的一个坑。真实实例上 `common:getNodes` 和 `common:getNodesLatestStatus` 返回的是**以 uuid 为键的字典**，只有 REST `/api/nodes` 的 `data` 才是数组。

```ts
// 错：字典上恒为 false，setState 从不执行，节点列表永远是空
if (Array.isArray(clients)) setState({ clients })

// 对：两种形状都收
const list = toClientArray(payload)   // 见 lib/transport.ts
if (list) setState({ clients: list })
```

后果是完全静默的：HTTP 200、无异常、页面显示「没有可显示的节点」。

### 2. 不要凭文档推断接口形状，去问真实实例

本项目照文档推断，在真实实例上验出**六处**不符，全部静默失败。详表见 `docs/IMPLEMENTATION_PLAN.md` §3 约束 6。其中两个类型（`MetricRecord`、`MetricDefinition`）是凭空造的，真实接口里根本不存在。

指标键名用 `public:listMetricDefinitions` 列，不要猜。状态记录的字段名（`cpu`、`ram`、`net_in`）和指标仓库的键名（`cpu.usage`、`memory.used`、`net.in.rate`）是两套命名，混用会拿到 `unknown metric key`。

### 3. 不要硬编码本该跟随服务端的阈值

「长期」的判定是**相对**的（`utils/renewal/renewal.go:48-52`：超过当前时间 100 年）。硬编码 2225 这个年份能通过今天的测试，但服务端换哨兵值的那天会悄悄失配。

### 4. 不要依赖系统字体渲染国旗 emoji

Windows 的 Segoe UI Emoji **故意不含国旗字形**，区域指示符对会渲染成两个字母方块。必须自托管 SVG（`npm run flags`）。也不能用第三方国旗 CDN —— 会泄漏访客 IP，内网部署裂图。

### 5. `useSyncExternalStore` 的读取函数不能返回新对象

React 用 `Object.is` 比较前后快照，每次返回新对象字面量会被判定为「一直在变」，无限重渲染（React #185）。见 `hooks/useNodes.ts` 里的缓存写法。

---

## Required Patterns

### 假服务端必须和真实实例同构

`scripts/mock-server.mjs` 的价值完全取决于它有多像真的。本项目踩过三次**测试替身把 bug 藏起来**：

1. `verify.mjs` 的 base 断言方向写反了 —— 于是它主动保护着那个 bug，四层全绿
2. 假服务端在 `/themes/{short}/dist/` 前缀下做了 SPA fallback，而真实服务端那里是 404
3. 假服务端 `getNodes` 返数组、`queryMetrics` 返扁平记录、不校验指标键名 —— 客户端照着它写，真机上全错

改假服务端时，先去真实实例确认，并在注释里写明依据（Go 源码位置或实测结果）。

### 期望值从数据源推导，不写死数字

```js
// 错：往固定数据里加节点时，这里会一起要改，漏一处就是一次假失败
check('七个假节点都在', cards === 7)

// 对
const fixtures = (await (await fetch(`${mock.base}/api/nodes`)).json()).data
const expected = fixtures.filter((n) => !n.hidden).length
check('每个假节点都渲染了', cards === expected, `${cards} 张，应为 ${expected}`)
```

### 等待条件必须是「内容真的出现了」

不要等固定时长，也不要等一个比目标更早满足的条件。

```js
// 错：卡片在元数据到达时就渲染，实时状态晚一个来回，此时 km-dot-live 还不存在
waitFor: (html) => html.includes('km-node-card')

// 对：等到真正要断言的东西出现
waitFor: (html) => html.includes('km-node-card') && html.includes('km-dot-live')
```

`<img>` 出现在 DOM 里和它解码完成是两件事，中间隔一次网络请求 —— 要轮询到 `complete`，否则偶发失败。

### 断言的固定数据不能被别的来源满足

给长期节点起名叫「Hotel 长期」时，「页面上有长期二字」这条断言会被名称满足，测不到真正的逻辑。固定数据要刻意避开被测文案。

---

## Testing Requirements

六层，各自能看到别层看不到的东西：

| 命令 | 层 | 只有它能抓到 |
| --- | --- | --- |
| `npm run format:check` | 纯函数 | 边界值：null、非法字符串、阈值两侧、0001 年 |
| `npm run smoke` | 接口契约 | 假服务端是否和真实实例同构 |
| `npm run render` ×3 | SSR 字符串 | 三条传输路径的降级、快照引用稳定性 |
| `npm run dev:check` | 真实 dev server | 开发态 base、StrictMode 的 effect 双调用竞态 |
| `npm run browser` | 真实浏览器 + 产物 | 资源路径解析、图片真的解码、渲染后的实际顺序 |
| `npm run package` | 归档 | zip 条目名、四个哨兵、资源前缀 |

**新增断言必须验证它会失败。** 把正确实现临时改回错误版本，确认断言报错，再恢复。不会失败的断言等于没有断言 —— 本项目出现过：`{{count}}` 占位符泄漏被四层全部放过。

`npm run browser` 依赖 `dist/` 是最新的，脚本里已经串了 `npm run build`。手工跑 `node scripts/browser-check.mjs` 时记得先构建，否则测的是旧产物（踩过）。

---

## Code Review Checklist

- 接口形状是对着真实实例核实的，还是照文档推断的？
- 假服务端改了吗？它现在还和真实实例同构吗？
- 新断言验证过「改回错误实现时会失败」吗？
- 等待条件是「内容真的出现」，还是一个更早满足的近似条件？
- 期望值是从数据源推导的，还是写死的数字？
- 有没有引入需要跟随服务端却被硬编码的阈值？
- 注释是中文吗？（`index.html` 例外，那个文件必须保持纯 ASCII，原因写在文件顶部）
