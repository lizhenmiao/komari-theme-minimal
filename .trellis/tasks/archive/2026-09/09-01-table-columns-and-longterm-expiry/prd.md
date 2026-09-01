# 表格列全展示、长期到期与剩余天数修正

## Goal

表格视图默认展示全部列；到期时间超过当前 100 年时按官方判定显示为长期，并且不再输出无意义的剩余天数。

## 背景

用户在真实实例（12 个节点）上使用时提出前两点，核实过程中发现第三点。

## Requirements

### 1. 表格视图默认展示全部列

现状：`NodeTable.tsx` 的 `DEFAULT_VISIBLE` 只含 7 列（`name` `cpu` `memory` `disk` `speed` `traffic` `expiry`），另外 6 列（`spec` `swap` `quota` `load` `ping` `uptime`）默认关闭。

要求默认展示全部 13 列。列可配置能力保留，用户仍可自行关掉。只改默认值 —— `localStorage` 里已存过偏好的用户不受影响，那是他自己的选择。

### 2. 长期到期显示为「长期」

现状：到期日一律渲染成 `MM/DD/YYYY`。用户实例上 AMD1 / AMD2 / ARM 的 `expired_at` 是 `2225-12-11T00:00:00Z`，被显示成 `12/11/2225`，而后台选的是「长期」。

官方判定依据 `utils/renewal/renewal.go:48-52`：

```go
hundredYearsFromNow := localNow.AddDate(100, 0, 0).UTC()
// 如果过期时间超过当前时间100年，视为长期/一次性账单，不续费
if clientExpireTime.After(hundredYearsFromNow) {
    return
}
```

同文件 `:39` 另有一条：`clientExpireTime.Year() < 2` 视为无效值。

要求：

- `expired_at` 超过「当前时间 + 100 年」时显示为「长期」，三个语言包都要
- `expired_at` 为 `null` 时维持现有「永久」文案（后端 `null` 是合法值，见 `database/models/time_test.go:74`）
- 「长期」不显示具体日期，也不显示剩余天数

### 3. 长期节点不显示剩余天数

现状：详情页对 2225 年的节点显示「剩 72785 天」。判定为长期时不输出剩余天数，也不显示到期警示药丸。

## Acceptance Criteria

- [x] 表格视图首次打开（清空 `localStorage`）展示全部 13 列
- [x] 列开关面板仍可用，取消勾选后该列消失且偏好被持久化
- [x] `expired_at` 为 `2225-12-11` 的节点，卡片与详情页均显示「长期」，无日期、无剩余天数、无到期药丸
- [x] `expired_at` 为 `null` 的节点仍显示「永久」
- [x] 正常日期节点（如 `2026-09-11`）行为不变：`MM/DD/YYYY` + 剩余天数
- [x] 已过期节点行为不变：显示过期药丸
- [x] zh-CN / zh-TW / en 三个语言包都有「长期」文案
- [x] 边界：`Year() < 2` 的无效值不崩、不被判为长期
- [x] 全套通过：`tsc` / smoke 75 / render 39×3 / dev-check 10 / browser 39 / package 18 / format-check 25
- [x] 新增断言逐条验证过「改回错误实现时会失败」

## 实施记录

**改动**

- `lib/format.ts`：新增 `isLongTerm()`，用「当前时间 + 100 年」的相对判定（照抄 `renewal.go:48-52`）；`formatExpiry` 和 `daysUntil` 对长期返回 null；`formatExpiry` 补上 `Year() < 2` 的无效值处理
- `NodeCard` / `NodeTable` / `NodeDetail`：区分「永久」（`null`）和「长期」（很远的日期）两种无日期情形
- 三个语言包新增 `node.longTerm`
- `NodeTable`：`DEFAULT_VISIBLE` 改为 `ALL_COLUMNS`
- `mock-server.mjs`：新增 `h8 Hotel 台北`，`expired_at` 用真实哨兵值 `2225-12-11`

**过程中发现并修掉的额外问题**

1. 假数据里没有长期节点，所以这个分支从来没被测到过 —— 这就是它能一直错着的原因
2. `km-dot-live` 的断言不稳定：`waitFor` 只等卡片，而实时状态晚一个来回，此时所有状态点都是离线态。已改为同时等在线点出现
3. 国旗断言偶发失败：`<img>` 进 DOM 和解码完成是两件事。已改为轮询到 `complete`，连跑三次确认稳定
4. 断言用的固定数据起名叫「Hotel 长期」，导致「页面上有长期二字」被名称满足 —— 无效断言，已改名为「Hotel 台北」
5. 多处写死「7 个节点」，加节点后一起要改。已改为从 `/api/nodes` 推导
6. `npm run browser` 不会自己构建，我拿旧产物测出过一次假失败。已在 npm script 里串上 `npm run build`

**新增检查**

`scripts/format-check.mjs`（25 项）：纯函数层的边界断言，覆盖 DOM 层测不到的 null / 非法字符串 / 阈值两侧 / 0001 年。已进 `npm test`。

## 非目标

- 不改列顺序与列宽
- 不改 `null` 的「永久」既有文案
- 不引入新主题设置项：默认全展示由代码常量决定，不做成运营者可配

## Notes

判定阈值必须与服务端一致。用「当前时间 + 100 年」这个相对判定，而不是硬编码某个年份 —— 服务端是相对判定，硬编码会在未来某天悄悄失配。
