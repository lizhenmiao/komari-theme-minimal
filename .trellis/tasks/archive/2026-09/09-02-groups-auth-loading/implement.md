# 执行计划

四项按依赖排序：先修缺陷（独立、影响面小），再做加载态（独立），最后做分组（跨数据层与两个视图）和入口三态（依赖已有的 viewer）。每阶段结束都要能构建通过。

## 阶段 1：延迟药丸按 clients 过滤

- [ ] `lib/types.ts` — `PingTask` 补 `clients?: string[]`
- [ ] `lib/ping.ts` 新建 — `taskAppliesTo(task, uuid)`，注释写明与服务端 `AppliesToClient` 对空列表的处理差异
- [ ] `NodeCard.tsx` — 内部按 uuid 过滤；过滤后为空则整个延迟区块不渲染
- [ ] `NodeTable.tsx` — `TableRow` 同样过滤；为空显示 `—`
- [ ] `mock-server.mjs` — `PING_TASKS` 加 `clients`，把 `h8 Hotel 台北` 排除在全部任务之外
- [ ] `browser-check.mjs` — 断言「没配探测的节点不显示药丸」「配了的节点显示」

**验证**：改回不过滤时那条断言必须失败。

## 阶段 2：首屏骨架

- [ ] `components/Skeleton.tsx` 新建 — `SkeletonCard` / `SkeletonRow`，骨架块基础类走 `--color-km-track`
- [ ] `index.css` — `km-skeleton` 类 + `prefers-reduced-motion` 里关动画
- [ ] `pages/Index.tsx` — `loading && nodes.length === 0` 时渲染 6 张骨架卡或骨架行；汇总条数值位也上骨架
- [ ] 确认已有节点时不会退回骨架（轮询期间不闪）

**验证**：假服务端加延迟或直接断网首屏，肉眼确认骨架出现。

## 阶段 3：登录 / 后台入口三态

- [ ] `Navbar.tsx` — `showAdmin: boolean` 改 `authEntry: 'admin' | 'login' | 'none'`
- [ ] 齿轮图标（后台）与进入箭头（登录）两套，都用 `<a href="/admin">`
- [ ] 加 `km-auth-entry` 锚点
- [ ] `pages/Index.tsx` 与 `pages/NodeDetail.tsx` — 传三态；`viewer === null` 映射到 `'none'`
- [ ] i18n 加 `nav.login`
- [ ] `browser-check.mjs` — 已登录断言后台入口，`--guest` 模式断言登录入口

**验证**：`--guest` 下若显示后台入口，断言必须失败。

## 阶段 4：分组筛选

- [ ] `hooks/useNodes.ts` — 新增 `useGroups()`，模块级缓存，按节点数降序
- [ ] `pages/Index.tsx`
  - 筛选状态 + `km-minimal-group` 持久化
  - 选中组失效时在派生层回退到「全部」，不用 effect 纠正
  - `groups.length === 0` 时整行不渲染
  - 芯片行加 `km-index-groups`
  - 从 `nodes` 派生 `visibleNodes` 传给两个视图
  - 汇总条保持全量，不跟筛选变
- [ ] `NodeTable.tsx` — `ColumnKey` 加 `'group'`，插在 `'name'` 之后
- [ ] `mock-server.mjs` — 节点加 `group`，含一个单节点组和一个不分组的节点
- [ ] i18n 加 `nav.group` `group.all`
- [ ] `browser-check.mjs` — 13 改 14；断言芯片存在、点击后节点数变化、刷新后保留
- [ ] `render-check.mjs` — 扩展引用稳定性断言覆盖 `buildGroups`

**验证**：改掉排序方向或去掉缓存时，对应断言必须失败。

## 阶段 5：收尾

- [ ] 三份 locale 同步，无未替换占位符
- [ ] 通读改动文件，注释中文、无墓碑注释
- [ ] `preview.png` 重新生成（芯片行会改变页面几何，四个采样区域可能要重算）
- [ ] 清理临时脚本

## 校验命令

```
npm run build
npm test                        format + smoke + render ×3 + dev:check
node scripts/browser-check.mjs  真实浏览器 + 构建产物
npm run package                 归档契约
```

## 回退点

基线是当前工作区状态（上一批改动已验证全绿但未提交）。每阶段结束是一个可回退位置。

阶段 4 影响面最大（数据层 + 两个视图 + 两个脚本），若中途发现分组派生导致快照不稳定，回到 design.md 第一节重新评估缓存策略。
