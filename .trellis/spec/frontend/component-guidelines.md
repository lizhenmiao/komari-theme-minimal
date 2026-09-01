# Component Guidelines

> 本项目组件的实际写法。所有注释用中文。

---

## 文件结构

每个组件一个文件，顺序固定：

```tsx
/**
 * 一句话说清这个组件负责什么。
 *
 * 如果有非显而易见的取舍，在这里写清「为什么」——
 * 不是「做了什么」（代码本身说得清），而是「为什么必须这样」。
 */

import { ... } from 'react'          // 1. react
import { ... } from '../lib/format'  // 2. 项目内值导入
import type { ... } from '../lib/types'  // 3. 类型导入（type 前缀）

export type MetricTone = 'cpu' | 'mem' | ...   // 4. 对外类型

interface XxxProps { ... }            // 5. props（不导出，除非别处要用）

function helper() { ... }             // 6. 模块级纯函数

export default function Xxx(props: XxxProps) { ... }  // 7. 默认导出组件
```

真实范例：`src/components/UsageBar.tsx`、`src/components/InfoPopover.tsx`。

---

## Props 约定

```tsx
interface UsageBarProps {
  label: string
  tone: MetricTone
  /** 传 null 渲染成禁用行，比如没开 swap 的节点。 */
  percent: number | null
  usedText: string
  totalText: string
}
```

- `interface` 而不是 `type`，命名 `<组件名>Props`
- 语义不明显的 prop 上面写一行 JSDoc，尤其是 `null` 代表什么
- **用 `null` 表示「无数据」，不要用 `0` 或 `undefined`**。`0` 会画成一条贴底的
  实线，看起来像「用量为零」，而事实是「没上报」。`UsageBar` 的 `percent: null`
  和 `Chart` 的 `data: (number | null)[]` 都靠这个语义
- 可选 prop 给默认值写在参数解构里：`group = 'pop'`、`width = 'w-56'`
- 布尔 prop 用肯定式（`online` 而非 `offline`）

---

## 样式

Tailwind v4，`@tailwindcss/vite` 插件。两类类名并用：

- **Tailwind 原子类**：布局、间距、字号、颜色
- **`km-*` 语义类**（定义在 `src/index.css`）：跨组件复用的视觉语言，
  比如 `km-card`、`km-track`、`km-bar`、`km-fill-cpu`、`km-num`、`km-label`

深色模式用 `dark:` 变体（`@custom-variant dark` 已在 `index.css` 配好），
由 `<html class="dark">` 驱动，见 `hooks/useAppearance.ts`。

### 告警阈值覆盖色系

指标自己的色系会被告警阈值覆盖，这个逻辑在 `UsageBar.tsx:19-29`，
`NodeTable.tsx` 的 `MetricCell` 复制了同一套阈值（90 / 75）。
改阈值要改两处 —— 已知的重复，不值得为它抽一层。

---

## 关键约束

### 1. `km-*` 类名是检查脚本的锚点

`km-node-card`、`km-instance-info`、`km-ui-flag`、`km-dot-live` 这些被
`scripts/` 下的检查脚本用来定位元素。改名或删除前先 grep `scripts/`，
否则检查照常通过但什么都没测到。

### 2. uPlot 组件必须整体重建，不能改样式

`components/Chart.tsx` 把颜色和几何尺寸写进构造选项，uPlot 不支持运行时改，
所以深浅色切换靠 `rebuildKey` 触发整体销毁重建。这不是偷懒，是 uPlot 的限制。

`spanGaps` 必须保持 `false`：`null` 采样是真实信息（一次丢失的探测），
要渲染成断口，不能连过去，也不能画成向下的尖刺。

### 3. 装饰层不能吃掉点击

`App.tsx` 的 `km-bg` 是固定定位的装饰层，必须 `aria-hidden="true"` 且
不接收指针事件，否则整页点不动。

### 4. 纯 CSS 优先于状态

`InfoPopover` 用 group 修饰符纯 CSS 实现悬停浮层，没有开合状态、没有事件监听、
没有清理逻辑。嵌套浮层用 `group` prop（`'pop'` / `'tip'`）区分，
否则悬停内层会把外层一起展开。

---

## 可访问性

实际做到的（不是理想清单）：

- 装饰性元素 `aria-hidden="true"`（`km-bg`、`InfoPopover` 的 `?` 触发点）
- 浮层容器 `role="tooltip"`
- 国旗 `<img>` 带 `alt`（两位国家代码）和 `title`
- 图标按钮带 `title` 和 `aria-expanded`（`NodeTable` 的列开关）
- 国旗加载失败时 `onError` 退回文本，不留碎图

---

## 常见错误

| 错误 | 后果 |
| --- | --- |
| 用 `0` 表示「无数据」 | 图上画成贴底实线，看起来像用量为零 |
| 给 `Chart` 传新的 series 对象字面量 | uPlot 每次重建，图表闪烁 |
| 改 `km-*` 类名不 grep `scripts/` | 检查失去目标，静默通过 |
| 在组件里直接 import `lib/transport` | 绕过 hook 层，生命周期失控 |
| 用国旗 emoji | Windows 的 Segoe UI Emoji 不含国旗字形，显示成字母方块 |
