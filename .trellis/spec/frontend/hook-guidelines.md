# Hook Guidelines

> 本项目 hook 的实际写法。所有注释用中文。

---

## 现有 hook

| Hook | 职责 | 数据来源 |
| --- | --- | --- |
| `useNodes(pinned)` | 合并元数据与状态，决定展示顺序 | store 快照 |
| `useNode(uuid)` | 单个节点 | store 快照 |
| `useNodeStatus(uuid)` | 按节点订阅状态 | store 快照 |
| `useTotals()` | 汇总条的合计值 | store 快照 |
| `useThemeSettings()` | 带默认值合并的 `theme_settings` | store 快照 |
| `useNodeHistory(uuid, range, maxPoints)` | 历史曲线序列 | RPC + 降级 |
| `usePingStats(uuid, taskIds, range, maxPoints, enabled)` | 延迟曲线 | RPC + 降级 |
| `useAppearance()` | 深浅色偏好 | localStorage + matchMedia |
| `useLanguage()` | 语言偏好 | localStorage |

前四个 + `useThemeSettings` 走 store 快照，后面几个自己发请求或读浏览器状态。

---

## 两种数据模式

### 模式 A：store 快照（实时数据）

实时数据统一由 `lib/transport.ts` 轮询写进 `lib/store.ts`，hook 只做**读取和派生**，
不发请求。这样 30 个节点共享一次轮询。

```ts
export function useNodeStatus(uuid: string): NodeStatus | null {
  const read = () => getState().statuses[uuid] ?? null
  return useSyncExternalStore(subscribe, read, read)
}
```

**读取函数必须返回稳定引用。** `useSyncExternalStore` 用 `Object.is` 比较前后快照，
每次返回新对象字面量会被判定为「一直在变」→ 无限重渲染（React #185）。
数据没变时返回同一个引用是硬要求，不是优化。

派生数据要手写模块级缓存，见 `hooks/useNodes.ts` 的 `buildViews` / `buildNode` /
`computeTotals`：

```ts
let nodeUuid: string | null = null
let nodeClients: unknown
let nodeStatuses: unknown
let nodeCache: NodeView | null = null

function buildNode(uuid: string): NodeView | null {
  const { clients, statuses } = getState()
  // 三个输入都没变就直接返回上次的引用
  if (uuid === nodeUuid && clients === nodeClients && statuses === nodeStatuses) {
    return nodeCache
  }
  // ... 重算并写回缓存
}
```

`useNodes.ts` 末尾导出 `__snapshotReaders`，专门给 `scripts/render-check.mjs`
断言引用稳定性 —— 这条断言验证过：把 memo 故意改坏它会失败。

两个快照参数传**同一个**读取函数（第二个是 `getServerSnapshot`）。本主题是纯浏览器端
静态包，store 是模块级单例，没有请求级状态也不做 hydration，所以不存在串数据问题。

### 模式 B：自己发请求（历史数据）

历史曲线是按需拉的，不进全局 store。固定结构：`useCallback` 包 load 函数 +
`useEffect` 里跑 + `AbortController` 清理。

```ts
const load = useCallback(async (signal: AbortSignal) => {
  setLoading(true)
  // 主路径
  if (capabilities.queryMetrics && rpc) {
    try {
      const payload = await rpc.call(...)
      if (signal.aborted) return          // 每个 await 之后都要检查
      // ...
      return
    } catch (cause) {
      if (signal.aborted) return
      if (import.meta.env.DEV) console.warn('[history] queryMetrics 失败', cause)
    }
  }
  // 降级路径
  // ...
}, [uuid, hours, maxPoints])

useEffect(() => {
  const controller = new AbortController()
  void load(controller.signal)
  return () => controller.abort()
}, [load])
```

要点：

- **每个 `await` 之后检查 `signal.aborted`**，StrictMode 会挂载两次
- 依赖用稳定的原始值，不用数组/对象。`usePingStats` 把 `taskIds` 拍成
  `taskIds.join(',')` 再进依赖，避免数组换引用就重新请求
- 返回值用 `useMemo` 包一层，避免调用方每次拿到新对象

---

## 返回值形状

- 单值直接返回：`useNodeStatus` → `NodeStatus | null`
- 多值返回对象，且 `useMemo` 稳定：`{ history, loading, error }`
- 需要操作时一起返回：`useAppearance` → `{ appearance, resolved, setAppearance, cycle }`

---

## localStorage 类 hook

`useAppearance` / `useLanguage` / `NodeTable` 的列偏好，共同约定：

```ts
function readStored(): Appearance {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  } catch {
    // 隐私模式或存储被禁用
  }
  return 'system'
}
```

- **读写都要 try/catch**：隐私模式下 localStorage 会抛
- 读出来的值必须校验，不能信任
- 存不进去也要让本次会话生效（`setAppearance` 里先 setState 再尝试写入）
- 跨标签页同步监听 `storage` 事件，但**该事件不会在写入的那个标签页触发**，
  所以写入方自己也要应用一次变更（`useAppearance.ts:54-63` 有注释说明）

`appearance` 这个键与 Komari 默认主题共用，访客偏好能跨主题保留 —— 不要改键名。

---

## 常见错误

| 错误 | 后果 |
| --- | --- |
| 读取函数返回新对象字面量 | React #185 无限重渲染 |
| `await` 之后不检查 `signal.aborted` | StrictMode 双挂载下写入已卸载的组件 |
| 把数组/对象直接放进 `useCallback` 依赖 | 每次渲染都重新请求 |
| 在 hook 里直接读 `localStorage` 不 try/catch | 隐私模式下整页崩 |
| 给 store 传原地修改过的集合 | `Object.is` 判定没变，UI 不更新 |
| 忘记 `useMemo` 包返回对象 | 调用方的 `useEffect` 依赖它就会反复触发 |
