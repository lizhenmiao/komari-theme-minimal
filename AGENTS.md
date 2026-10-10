# 给 AI 助手 / 贡献者的说明

[Komari Monitor](https://github.com/komari-monitor/komari) 的第三方主题：纯浏览器端静态包，
没有后端。构建产物是一个 zip，装到 Komari 服务端（Go）后由它提供 `index.html` 与静态资源。

## 约定

- **所有文档与代码注释一律用中文**。唯一例外是 `index.html`：注释必须纯 ASCII，且文件里有
  三处服务端按字节替换的哨兵（`<title>`、description、`</head>`），不能改动、不能让插件重排 ——
  `npm run verify` 会检查。
- **零外部请求**：国旗、系统图标、字体全部自托管，不引任何第三方 CDN。否则每个访客的 IP 都会
  泄漏给第三方，内网部署也会直接失效。
- **主题设置经未鉴权、任何访客都能读的 `GET /api/public` 下发**（`theme_settings`）。manifest 里
  不要放任何 token、密钥、私有地址；价格类设置默认关闭。
- **接口形状以真实实例为准，不要照文档推断**（照文档推断曾验出六处静默失败）。判断服务端行为
  查 `.tmp/komari/`（Go 源码参考克隆，已 gitignore，**不要删**）。

## 目录

- `src/lib/` — 纯逻辑，不许 import React（`scripts/format-check.mjs` 直接在 Node 里测它）
- `src/hooks/` — 数据与浏览器状态的桥
- `src/components/` — 展示组件
- `src/pages/` — 首页与详情页：取数据、组装页面模型、按风格分派
- `src/skins/` — 三套界面风格（`classic` / `vercel` / `apple`），只排版不取数据；
  字段换算集中在 `shared/nodeFacts.ts`，令牌覆盖在 `skins.css`
- `scripts/` — 六层检查、假服务端、打包、图标抓取
- `docs/` — 实施方案（`MULTI_STYLE_PLAN.md`）与接口契约

## 改完必须过的检查

```bash
npm run build     # tsc + vite：类型与打包
npm test          # format-check + smoke + render ×3（逐风格）+ dev-check
npm run browser    # 真实 Chrome / Edge 跑三套风格
npm run package   # 构建 + 契约校验 + 打包 + 归档校验
```

动 `km-*` 类名前先 grep `scripts/` —— 那些是检查脚本的定位锚点，改名会让检查静默失效。

## 发布

`npm run bump <版本号>` 改 manifest 版本、提交、打标签（**不推送**）。推送标签 `vX.Y.Z` 触发
GitHub 发布工作流自动打包并发布 Release。
