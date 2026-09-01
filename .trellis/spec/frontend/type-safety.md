# Type Safety

> 本项目的类型约定。所有注释用中文。

---

## 配置

TypeScript 5.7，`tsconfig.app.json` 开了 `strict` 之外的一批额外检查：

| 选项 | 作用 |
| --- | --- |
| `strict` | 全套严格检查 |
| `noUnusedLocals` / `noUnusedParameters` | 未使用的变量和参数报错 |
| `noUncheckedIndexedAccess` | 索引访问结果自动带 `undefined` |
| `exactOptionalPropertyTypes` | `?:` 不等于 `\| undefined` |
| `noFallthroughCasesInSwitch` | switch 穿透报错 |
| `verbatimModuleSyntax` | 类型导入必须写 `import type` |

`noUncheckedIndexedAccess` 和 `exactOptionalPropertyTypes` 会显著改变写法，
下面单独说。

构建即检查：`npm run build` 是 `tsc -b && vite build`，类型错误会阻断构建。

---

## 类型组织

- **接口数据结构**统一在 `lib/types.ts`：`Client`（31 个字段）、`NodeStatus`、
  `StatusRecord`、`NestedStatus`、`PingTask`、`PingRecord`、`PublicInfo`、
  `ThemeSettings`、`NodeView`
- **指标仓库相关**在 `lib/metrics.ts`：`MetricPoint`、`MetricSeries`、
  `QueryMetricsResult`、`Aggregation` —— 和 `types.ts` 里的状态结构不是一套命名，
  刻意分开
- **组件 props** 定义在组件文件里，不导出（除非别处要用，如 `ChartSeries`、`MetricTone`）
- **hook 返回类型**在 hook 文件里导出，如 `HistorySeries`、`PingSeries`、`NodeTotals`

---

## 运行时校验

**没有校验库**（zod / yup 都没装）。接口数据用**手写窄化函数**处理，理由是接口形状
本身不稳定，需要按字段容错，而不是整体 schema 校验失败就放弃。

### 三种形状的窄化

`lib/transport.ts` 的 `toClientArray` 是典型：

```ts
function toClientArray(payload: unknown): Client[] | null {
  if (Array.isArray(payload)) return payload as Client[]
  if (payload && typeof payload === 'object') {
    const values = Object.values(payload as Record<string, unknown>)
    if (values.every((entry) => entry && typeof entry === 'object')) {
      return values as Client[]
    }
  }
  return null
}
```

同类函数：`toStatusMap`、`extractPingStats`、`extractSeries`、`groupRecords`、
`extractMethodNames`。

**参数类型一律用 `unknown`，不用具体类型。** 写成 `Client[] \| Record<string, Client>`
会让人以为形状已经确定，而实际上服务端可能返回第三种。用 `unknown` 强制在函数内部
逐层窄化。

### 类型守卫

```ts
const isString = (entry: unknown): entry is string => typeof entry === 'string'
const isNumber = (entry: unknown): entry is number =>
  typeof entry === 'number' && Number.isFinite(entry)
```

配合 `readJsonArray<T>(raw, guard)` 使用（`hooks/useThemeSettings.ts`）。
注意 `isNumber` 必须查 `Number.isFinite` —— `NaN` 的 `typeof` 也是 `'number'`。

### 设置项的容错读取

`theme_settings` 在低于 1.0.5 的服务端完全不存在，且后台表单可能把布尔值序列化成
字符串。所以每个字段单独读、单独兜底：

```ts
function readBoolean(raw: unknown, fallback: boolean): boolean {
  if (typeof raw === 'boolean') return raw
  // 后台的 managed 表单可能把开关序列化成字符串
  if (raw === 'true') return true
  if (raw === 'false') return false
  return fallback
}
```

`featuredNodes` / `featuredPingTasks` 存的是 **JSON 字符串**（默认值就是字面量
`"[]"`），用之前必须 parse —— 见 `readJsonArray`。

---

## `noUncheckedIndexedAccess` 的影响

索引访问结果自动带 `undefined`，所以数组取值后必须检查：

```ts
// 数组下标访问的结果可能是 undefined
const item = items[Math.floor(index * step)]
if (item !== undefined) out.push(item)

// 可选链 + 空值合并
const last = records[records.length - 1]
ramTotal: last?.ram_total ?? 0
```

不要用 `!` 绕过。真实代码里 `thin()`、`buildFromRecords()`、`pointsFor()` 都是
显式检查的。

---

## `exactOptionalPropertyTypes` 的影响

`prop?: string` **不**接受显式的 `undefined`，必须写成 `prop?: string | undefined`：

```ts
export interface ChartSeries {
  label: string
  data: (number | null)[]
  stroke: string
  /** 一般只给第一条线填充；两处填充会让图变浑。 */
  fill?: string | undefined
  dash?: number[] | undefined
}
```

条件传参用展开而不是传 `undefined`：

```ts
...(entry.fill ? { fill: entry.fill } : {}),
...(entry.dash ? { dash: entry.dash } : {}),
```

---

## 禁止的写法

| 写法 | 为什么 |
| --- | --- |
| `any` | 全项目零使用，用 `unknown` + 窄化 |
| `!` 非空断言 | 用显式检查或 `?? 默认值` |
| 给接口窄化函数标具体入参类型 | 会掩盖「还有第三种形状」的可能 |
| `as` 断言未经检查的数据 | 只在已经 `typeof` / `Array.isArray` 确认后才用 |
| 凭想象定义接口类型 | 踩过：`MetricRecord`、`MetricDefinition` 都是我造的，真实接口里不存在 |

最后一条是本项目最贵的类型错误。定义接口类型前先对着真实实例核实形状，
详见 [quality-guidelines.md](./quality-guidelines.md) 的禁止写法 2。

---

## `null` vs `undefined`

有明确分工：

- **`null` = 「有意义的无值」**，会被渲染。`percent: number | null` 的 null 渲染成
  `—`；`data: (number | null)[]` 的 null 让曲线断开（表示一次丢失的探测）
- **`undefined` = 「字段不存在」**，通常来自可选属性或索引访问

`formatExpiry` 返回 `string | null`：null 表示「没有具体日期」，调用方再区分是
「永久」（`expired_at` 为 null）还是「长期」（超过 100 年）。这个二分靠单独的
`isLongTerm()` 判断，不能只看 `formatExpiry` 的返回。
