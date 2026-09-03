# 技术设计

## 一、分组筛选

### 数据来源

`Client.group` 是普通字符串，服务端不保证非空。真实实例上 12 个节点全有值，但不能假设——运营者可以只给部分节点分组。

### 分组统计放哪

分组列表要算节点数，且必须在筛选**之前**算（否则选中某组后其他组的计数会变成 0）。这个派生和 `useNodes` 同源，放 `hooks/useNodes.ts` 里新增 `useGroups()`：

```ts
export interface NodeGroup {
  name: string
  count: number
}
export function useGroups(pinned?: readonly string[]): NodeGroup[]
```

必须走模块级缓存，规则与 `buildViews` 一致——`useSyncExternalStore` 用 `Object.is` 比较快照，返回新数组会无限重渲染。

排序按节点数降序，同数按组名。`全部` 不进这个列表，由组件自己拼在最前面，因为它的计数是总数而不是某组的。

### 筛选状态

放 `pages/Index.tsx` 的 `useState`，持久化到 `km-minimal-group`。与视图选择同一套模式（`readStored` + try/catch + 存不进去也让本次会话生效）。

两个边界必须处理，都会导致空列表：

1. **选中的组消失**（节点被移出或删除）。渲染前校验：当前选中值不在 `groups` 里就当作 `全部`。不要在 effect 里 `setState` 纠正——那会多一次渲染，且 store 更新时机不定容易抖。直接在派生时兜住。
2. **完全没有分组数据**。`groups.length === 0` 时整行芯片不渲染。

### 筛选在哪一层做

`pages/Index.tsx` 里从 `nodes` 过滤出 `visibleNodes`，传给卡片网格和表格。理由是筛选是页面级状态，`NodeTable` 不该知道分组的存在。

汇总条**不跟着筛选变**。它表达的是整个集群的状态，跟着筛选变会让人误读成"集群只有这几台"。芯片上的计数已经说明了各组规模。

### 表格的分组列

`ColumnKey` 加 `'group'`，插在 `'name'` 之后（分组是节点的身份属性，紧跟名称最自然）。`ALL_COLUMNS` 长度从 13 变 14 —— **`browser-check.mjs` 有个写死的 13**，要同步改。

## 二、登录 / 后台入口

`Navbar` 现有 `showAdmin?: boolean`，改成三态更准确：

```ts
/** 'admin' 已登录 | 'login' 未登录 | 'none' 身份未知 */
authEntry?: 'admin' | 'login' | 'none'
```

用联合类型而不是两个布尔，避免出现 `showAdmin && showLogin` 这种无意义组合。

三态映射在页面层：

```ts
const authEntry = viewer === null ? 'none' : viewer.logged_in ? 'admin' : 'login'
```

`viewer === null` 是「还没问到」，与「问到了且未登录」不是一回事——前者不显示任何入口，后者显示登录。这个区分已经在 `loadViewer` 里做过（接口失败不写 store），这里只是接住它。

两个入口都指向 `/admin`，都用 `<a>`。图标区分：后台用齿轮，登录用「进入」箭头。

## 三、首屏骨架

### 判定条件

现有 `loading` 是传输层的整体标志。骨架的条件是 `loading && nodes.length === 0` —— 已经有节点时不该退回骨架，那会让轮询期间闪一下。

### 骨架形状

新建 `components/Skeleton.tsx`，导出两个组件：

- `SkeletonCard` — 卡片骨架，高度贴近真实卡片（约 427px），内部分块对应卡头/仪表条/趋势图/底栏
- `SkeletonRow` — 表格骨架行

数量取 6 个（1600px 下四列，撑满一行半，视觉上够"页面在加载"而不是"只有几个节点"）。

汇总条的四个数值位也上骨架，用同一个基础类。

### 动画

用 `animate-pulse`（Tailwind 自带），`prefers-reduced-motion` 里关掉。骨架块底色用 `--color-km-track`，与仪表条槽同色，保证深浅色都协调。

## 四、延迟药丸按 clients 过滤

### 类型补字段

```ts
export interface PingTask {
  id: number
  name: string
  interval: number
  type: string
  target?: string | undefined
  /** 该任务适用的节点 uuid。空数组或缺失按「适用全部」处理。 */
  clients?: string[] | undefined
}
```

标成可选是为了兼容老版本服务端。

### 过滤规则

```ts
export function taskAppliesTo(task: PingTask, uuid: string): boolean {
  if (!task.clients || task.clients.length === 0) return true
  return task.clients.includes(uuid)
}
```

照搬服务端 `AppliesToClient`（`database/models/pingTask.go:27`）的语义，但多一条：服务端那个函数对空列表返回 false，我们返回 true。原因是服务端拿到的是完整数据，空列表确实意味着"不适用任何节点"；而我们可能面对的是老版本服务端根本不下发这个字段的情况，此时按"全部适用"处理才不会把功能整个关掉。这个差异要在注释里写明。

放 `lib/format.ts` 还是新建文件？放 `format.ts` 不合适——它不是格式化。新建 `lib/ping.ts`。

### 影响面

- `NodeCard`：`pingTasks` prop 由页面传入，改成在卡片内部过滤（卡片知道自己是哪个节点）
- `NodeTable`：`TableRow` 同理
- 过滤后为空则整个延迟区块不渲染（卡片）/ 单元格显示 `—`（表格）

## 五、假服务端要补的覆盖

第 4 项当前完全没有检查覆盖——8 个节点全部适用三个任务，正是用户遇到的 bug 的反面。

改法：给 `PING_TASKS` 加 `clients` 字段，其中一个节点（选 `h8 Hotel 台北`，它已经是长期到期的边界样本）不出现在任何任务的 `clients` 里。这样：

- `browser-check` 能断言「没配探测的节点不显示药丸」
- 其他节点仍有药丸，正向分支不受影响

分组同样需要：现在 8 个节点没有 `group` 字段。加上分组，其中至少一个组只有 1 个节点（对应真实实例的分布），且**留一个节点不分组**——验证「部分节点无分组」时芯片计数是否正确。

## 六、测试锚点

新增三个，纳入既有 `km-` 约定：

```
km-index-groups     分组芯片行
km-skeleton         骨架块（卡片与行共用）
km-auth-entry       登录/后台入口
```

`browser-check.mjs` 里写死的 `13` 列要改成 `14`。这个数字本来就该从数据推导，但列的总数没有接口可查，只能写死——至少加个注释说明它跟 `ALL_COLUMNS` 绑定。

## 七、i18n 新增键

```
nav.login       登录 / Login / 登入
nav.group       分组 / Group / 分組
group.all       全部 / All / 全部
```

三份 locale 同步。

## 八、风险

| 风险 | 应对 |
|---|---|
| `useGroups` 快照不稳定 → React #185 | 模块级缓存，与 `buildViews` 同一套；`render-check` 已有引用稳定性断言可扩展 |
| 分组列插入导致列开关的 localStorage 旧数据失效 | `readStored` 已经过滤未知键，旧数据里没有 `group` 只会导致它不显示，不会崩。但默认值是全选，所以新用户能看到 |
| 骨架高度与真实卡片差太多，加载完跳动 | 用真实卡片测出的 427px 作为基准 |
| 过滤后所有节点都被筛掉 | 选中组失效时回退到「全部」，在派生层兜住 |
