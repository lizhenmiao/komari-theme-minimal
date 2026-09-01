# Frontend Development Guidelines

> Komari Monitor 第三方主题的开发约定。**所有文档与代码注释一律用中文**
> （`index.html` 例外，见下）。

---

## 适用范围

本仓库是一个 **纯浏览器端静态包**，没有后端层。构建产物是 zip，装到 Komari
服务端（Go）后由它提供 `index.html` 和静态资源。

`.trellis/spec/backend/` 已删除 —— `trellis init` 按 fullstack 模板生成的，
对本项目不适用。硬填会让子代理拿到虚构的约定。

服务端行为查 `.tmp/komari/`（Go 源码参考克隆，已 gitignore，**不要删**），
不要猜。

---

## Guidelines Index

| 指南 | 内容 | 状态 |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | 分层规则、`lib/` 不许 import React、`km-*` 是检查锚点 | 已填 |
| [Component Guidelines](./component-guidelines.md) | 文件结构、props 约定、`null` 语义、uPlot 限制 | 已填 |
| [Hook Guidelines](./hook-guidelines.md) | store 快照 vs 自己发请求、引用稳定性、AbortController | 已填 |
| [State Management](./state-management.md) | `useSyncExternalStore` 单例 store、按节点订阅、降级链 | 已填 |
| [Type Safety](./type-safety.md) | `unknown` + 手写窄化、严格选项的影响、`null` vs `undefined` | 已填 |
| [Quality Guidelines](./quality-guidelines.md) | 静默失败防范、六层检查、假服务端同构要求 | 已填 |

跨层思考指南在 `.trellis/spec/guides/`（Trellis 自带，已预填）。

---

## Pre-Development Checklist

动代码前逐条过：

1. **接口形状核实了吗** —— 涉及 `/api/*` 或 `/api/rpc2` 的改动，先对着真实实例
   确认返回形状，或查 `.tmp/komari/` 的 Go 源码。照文档推断曾验出六处静默失败。
   详见 [quality-guidelines.md](./quality-guidelines.md) 禁止写法 2。
2. **改的是哪一层** —— `lib/` 纯逻辑不许 import React；组件不发请求；
   hook 是两者之间的桥。
3. **要动 `km-*` 类名吗** —— 先 grep `scripts/`，那些是检查脚本的定位锚点。
4. **要改假服务端吗** —— `scripts/mock-server.mjs` 必须和真实实例同构，
   改之前确认真实行为，并在注释写明依据。
5. **有没有本该跟随服务端的阈值** —— 用相对判定，不要硬编码（如「长期」是
   「当前时间 + 100 年」，不是 2225）。

---

## Quality Check

改完代码后逐条过：

1. `npm run build` —— `tsc -b` 会阻断类型错误
2. `npm test` —— format-check / smoke / render ×3 / dev-check
3. `npm run browser` —— 真实浏览器 + 产物（脚本内已串 build）
4. `npm run package` —— 归档契约
5. **新增断言验证过它会失败吗** —— 把正确实现临时改回错误版本，确认断言报错，
   再恢复。不会失败的断言等于没有断言。
6. 注释是中文吗
7. 有没有留下临时文件（`.tmp-*`、临时诊断脚本）

六层检查各自能看到什么，见 [quality-guidelines.md](./quality-guidelines.md)。

---

## 两条不可协商的约束

**安全**：`theme_settings` 通过无鉴权、全世界可读的 `GET /api/public` 下发 ——
**任何 token、密钥、私有 URL 都不能放进主题配置**。`showPrice` 默认 `false`，
因为价格对每个匿名访客可见。

**兼容**：页脚必须保留 `Powered by Komari Monitor.`；不占用 `/admin` 和
`/terminal` 路由（那两个永远是内置 UI）。

---

## `index.html` 的例外

这一个文件的注释保持**英文且纯 ASCII**，`npm run verify` 强制检查。原因写在文件
顶部：服务端按字节匹配替换四个哨兵，这是唯一「内容被破坏 = 静默失效」的文件，
纯 ASCII 让它对 Windows 工具的编码事故免疫（`Set-Content -Encoding utf8` 会加 BOM，
`Get-Content -Raw` 会把 UTF-8 读成 GBK —— 这个会话里真的毁过一个文件）。
