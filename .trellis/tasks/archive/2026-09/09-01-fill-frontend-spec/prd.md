# 填写前端 spec 并清除不适用的 backend 层

## Goal

把 `.trellis/spec/frontend/` 的占位文件填成本项目真实约定，删除纯前端项目不适用的
backend 层，完成后归档 `00-bootstrap-guidelines`。

## 背景

`00-bootstrap-guidelines` 是 `trellis init`（2026-08-29）自动创建的引导任务，
写给 AI 看的，目标是填充 spec。它的原文：

> Empty spec = sub-agents write generic code. Real spec = sub-agents match the
> team's actual patterns.

每个 Trellis 任务会派 `trellis-implement` / `trellis-check` 两个子代理，通过
`implement.jsonl` / `check.jsonl` 清单自动加载 spec。spec 空着，子代理就写通用代码。

该任务从 2026-08-29 起一直是 `in_progress`，进度 1/13 —— 只有
`frontend/quality-guidelines.md` 在上一个任务里顺手填了。

## Requirements

### 1. 删除 backend 层

`trellis init` 按 fullstack 模板生成了 `.trellis/spec/backend/` 五个文件，但本项目是
纯浏览器端静态包，没有后端 —— 服务端是 Komari 自己的 Go 代码，不在本仓库。

硬填这五个文件会让子代理拿到虚构的约定。全部为模板占位、无人工内容、无 jsonl 引用，
直接删除。官方文档明确支持（`change-spec-structure.md`：「Specs are user project
conventions and can be changed according to project needs」）。

### 2. 填写 frontend 五个文件

必须写**代码实际做的事**，不是理想。每条约定引用真实文件路径与行号。

| 文件 | 要覆盖的内容 |
| --- | --- |
| `directory-structure.md` | 分层规则（`lib/` 不许 import React）、命名、`km-*` 是检查锚点 |
| `component-guidelines.md` | 文件结构顺序、props 约定、`null` 表示无数据、uPlot 必须整体重建 |
| `hook-guidelines.md` | store 快照 vs 自己发请求两种模式、引用稳定性、AbortController、localStorage 容错 |
| `state-management.md` | 为什么用 `useSyncExternalStore`、引用相等的两条硬要求、降级链、StrictMode 世代号 |
| `type-safety.md` | `unknown` + 手写窄化、`noUncheckedIndexedAccess` 与 `exactOptionalPropertyTypes` 的影响、`null` vs `undefined` 分工 |

### 3. 改写 frontend/index.md

补上 Pre-Development Checklist 和 Quality Check（子代理会读这两节），说明 backend
层为何删除，以及 `index.html` 保持英文纯 ASCII 的例外。

### 4. 归档 bootstrap 任务

`task.py finish` + `task.py archive 00-bootstrap-guidelines`。

## Acceptance Criteria

- [x] `.trellis/spec/backend/` 已删除，`get_context.py --mode packages` 只报
      `Spec layers: frontend`
- [x] 删除前确认过没有任务的 jsonl 引用 backend
- [x] frontend 五个文件全部填写，无 `(To be filled` / `To fill` / `TBD` 残留
- [x] 每个文件的约定都引用真实文件路径，无虚构示例
- [x] `frontend/index.md` 含 Pre-Development Checklist 与 Quality Check
- [x] 全部文档为中文
- [x] 两个活动任务的 `implement.jsonl` / `check.jsonl` 已填入 spec 清单
- [x] `00-bootstrap-guidelines` 已 finish + archive（`archive/2026-09/`）
- [x] 代码零改动（本任务只动 `.trellis/`），全套检查仍通过

## 实施记录

**删除**：`.trellis/spec/backend/` 六个文件（含 `index.md`），全部为模板占位、
无人工内容。删除前确认过没有任务的 jsonl 引用它。`get_context.py --mode packages`
现在只报 `Spec layers: frontend`。

**填写**：frontend 六个文件，共约 35 KB。素材来自实际代码，逐条引用真实路径：

| 文件 | 主要素材来源 |
| --- | --- |
| `directory-structure.md` | 全目录树、`lib/` 九个文件的职责表 |
| `component-guidelines.md` | `UsageBar.tsx`、`InfoPopover.tsx`、`Chart.tsx` |
| `hook-guidelines.md` | `useNodes.ts` 的模块级缓存、`useNodeHistory.ts` 的 AbortController、`useAppearance.ts` 的跨标签页同步 |
| `state-management.md` | `store.ts` 的 `mergeStatuses`、`transport.ts` 的世代号、降级链表格 |
| `type-safety.md` | `tsconfig.app.json` 的严格选项、`toClientArray` 等窄化函数 |

**jsonl 清单**：这是让 spec 真正生效的关键一步 —— 光有 spec 文件，子代理也读不到，
必须在任务的 `implement.jsonl` / `check.jsonl` 里列出来。两个活动任务都已填。

**过程中的意外**：`task.py archive` 触发了自动提交（`session_auto_commit` 默认 true），
产生 `e5f1354`。只动了 bootstrap 任务的两个文件（移到 archive/），未触及代码改动。
用户确认保留该提交并保留自动提交行为 —— `.trellis/` 内部操作自动提交是合理的。

**验证**：本任务只动 `.trellis/`，代码零改动。全套复跑确认无回归：
format-check 25/25、smoke 75/75、render 39/39 ×3、dev-check 10/10。

## 非目标

- 不改 `.trellis/spec/guides/`（Trellis 自带且已预填）
- 不重跑 `trellis init` —— 那是首次安装用的，会重新生成脚手架并可能覆盖已填内容。
  升级用 `trellis update`（保留本地编辑）
- 不动代码

## Notes

spec 的读者是 `trellis-implement` / `trellis-check` 子代理，不是人。所以：

- 写「为什么」而不只是「做什么」——子代理需要判断依据
- 反面例子和后果比正面规则更有用（「用 0 表示无数据 → 图上画成贴底实线」）
- 踩过的坑必须写进去，那是最贵的信息
