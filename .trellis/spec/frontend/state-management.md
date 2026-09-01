# State Management

> 本项目的状态管理。所有注释用中文。

---

## 方案

**没有状态库。** `useSyncExternalStore` + 一个模块级单例 store（`lib/store.ts`）。

选它的原因：需要**按节点粒度的订阅**。30 个节点每 2 秒刷新，不能让整个网格重渲染。
`useNodeStatus(uuid)` 只在那个节点的数据变化时触发对应卡片。

---

## 状态分类

| 类别 | 放哪 | 例 |
| --- | --- | --- |
| 服务端实时数据 | `lib/store.ts` 全局 store | `clients`、`statuses`、`pingTasks`、`pingLatest`、`publicInfo` |
| 服务端按需数据 | 组件内 `useState` | 历史曲线（`useNodeHistory`）、延迟曲线（`usePingStats`） |
| 访客偏好 | localStorage + `useState` | 深浅色、语言、表格列 |
| 纯 UI 状态 | 组件内 `useState` | 菜单开合、时间范围选择、卡片/表格视图切换 |
| 路由状态 | React Router | `/instance/:uuid` |

### 判断标准

进全局 store 的条件：**多个组件要用，且由同一次轮询产生**。

历史曲线不进 store，因为它是按 uuid + 时间范围按需拉的，只有详情页用。
放进 store 会让 store 结构随参数膨胀。

---

## Store 结构

```ts
export interface StoreState {
  publicInfo: PublicInfo | null
  clients: Client[]
  /** 按 uuid 索引。逐节点替换，没变化的节点保持原对象引用。 */
  statuses: Record<string, NodeStatus>
  pingTasks: PingTask[]
  /** 每个 `${uuid}:${taskId}` 的最新延迟。负值表示丢包。 */
  pingLatest: Record<string, number>
  connected: boolean
  error: string | null
  loading: boolean
}
```

`getState()` / `subscribe()` / `setState(patch)` 三个 API，加一个专用的
`mergeStatuses(incoming)`。

---

## 硬要求：引用相等

整套机制建立在 `Object.is` 比较之上，两条规则不能违反。

### 1. 改集合必须给新引用

`setState` 是浅合并。原地修改数组或对象再传进去，`Object.is` 判定没变，UI 不更新。

### 2. 内容相同的对象必须保持原引用

`mergeStatuses` 逐节点比对，内容完全相同就跳过：

```ts
export function mergeStatuses(incoming: Record<string, NodeStatus>): void {
  const next = { ...state.statuses }
  let changed = false
  for (const [uuid, status] of Object.entries(incoming)) {
    const previous = next[uuid]
    if (previous && shallowEqualStatus(previous, status)) continue  // 保持原引用
    next[uuid] = status
    changed = true
  }
  if (!changed) return   // 一个都没变就不 emit
  state = { ...state, statuses: next }
  emit()
}
```

没有这一步，每次轮询都会给每张卡片一个新对象，按节点的 memo 全部失效。

`shallowEqualStatus` 先比 `time` —— 在线节点每次轮询这个字段都在变，
先比它能立刻短路掉「确实变了」这种最常见的情况。

---

## 派生状态

派生放在读取函数里，用模块级缓存保证引用稳定。见
[hook-guidelines.md](./hook-guidelines.md) 的模式 A。

`useNodes.ts` 里三个派生函数（`buildViews`、`buildNode`、`computeTotals`）
各自维护自己的缓存键。`scripts/render-check.mjs` 有专门断言验证它们的引用稳定性。

### 排序规则

`buildViews` 的优先级：

1. 主题设置里置顶的节点，按运营者填写的顺序
2. `weight` **小的在前**（升序）
3. 名称（保证权重相同时不会每次轮询重排）

`weight` 升序有三条依据，写在 `hooks/useNodes.ts` 的文件头注释里：服务端对节点
完全不排序（`GetAllClientBasicInfo` 没有 ORDER BY）、同代码库探测任务用
`Order("weight ASC")`、后台拖拽按下标赋值。**方向搞反过一次**，
`scripts/browser-check.mjs` 现在有断言锁定。

---

## 服务端数据同步

接口里**没有任何推送或订阅机制** —— RPC2 没有 `subscribe`，`/api/clients` 也是
请求响应式。所以实时数据只能轮询。

`lib/transport.ts` 是唯一入口，`App.tsx` 挂载时 `startTransport()`、卸载时
`stopTransport()`。轮询间隔从主题设置读，标签页隐藏时整个循环暂停
（`visibilitychange`）。

### StrictMode 双挂载

开发态 effect 会跑两次：`start → stop → start`。`startTransport` 用**世代号**
应对：每次 `stop` 递增，`start` 在每个 `await` 之后核对，世代变了就收尾退出，
不再碰共享状态。

`started` 标志拦不住这个 —— `stop` 把它设回 false，第二次 `start` 直接放行，
于是两次启动流程同时在跑、抢同一份状态。这个坑踩过，报错是
`Cannot read properties of null (reading 'dispose')`。

### 降级链

每条数据路径都有降级，能力由 `rpc.methods` 运行时探测，**不做版本号判断**：

| 数据 | 主路径 | 降级 |
| --- | --- | --- |
| 实时状态 | `common:getNodesLatestStatus` | WS `/api/clients` |
| 元数据 | `common:getNodes` | REST `/api/nodes` |
| 历史 | `public:queryMetrics` | `common:getRecords` → REST |
| 延迟曲线 | `queryMetrics` + `ping.latency_ms` | `public:getPingRecords` → REST |

---

## 常见错误

| 错误 | 后果 |
| --- | --- |
| 原地修改集合再 `setState` | `Object.is` 判定没变，UI 不更新 |
| `mergeStatuses` 无条件替换所有节点 | 每次轮询全网格重渲染 |
| 把按需数据塞进全局 store | store 结构随参数膨胀 |
| 依赖 `started` 标志防重入 | StrictMode 下两个启动流程并行 |
| 硬编码版本号判断能力 | 服务端版本策略变化时静默失效 |
| 累计流量只统计在线节点 | 节点离线后总量凭空减少 |

最后一条是有意的不对称：瞬时速率只计在线节点（否则离线残留读数永久虚高），
累计流量照常累加（离线后依然有意义）。见 `hooks/useNodes.ts` 的 `computeTotals`。
