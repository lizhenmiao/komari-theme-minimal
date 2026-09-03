# 页脚仓库入口与项目 README

## Goal

在页脚版权行后加入主题名与 GitHub 仓库图标链接，并新增根目录 README.md 说明项目定位、主题配置项与本地开发/打包流程，为提交到 Komari 官方主题列表做准备。

## Requirements

### R1 页脚仓库入口

- 页脚左侧现有 `Powered by Komari Monitor.` 之后追加 `· <主题名> <GitHub 图标>`，图标链接到主题仓库。
- 运营者自定义页脚 HTML 仍在行的右端，与这段出处标注分列两侧，视觉上不能被看成一组。
- 链接必须 `target="_blank"` + `rel="noopener noreferrer"`：页脚在所有页面常驻，不能让外链把站点页面替换掉。
- 主题名与仓库地址**不允许在前端源码里再写一份**。`komari-theme.json` 已经是 `name` / `url` 的唯一来源，`vite.config.ts` 也已从它读取 `short`；再抄一份就会漂移。
- 图标需要无障碍名称，走 i18n，不能只有一个裸 `<svg>`。

### R2 项目 README

- 根目录新增 `README.md`，中文单份。
- 必须覆盖：项目定位与截图、安装方式、主题设置项说明、本地开发两种模式（mock / 真实实例代理）、测试分层、打包与发布流程、目录结构。
- 本地开发说明必须与实际脚本一致：端口、环境变量名、mock 的命令行开关都要能照着跑通。
- 打包说明必须写清 `komari-theme.json` 位于**归档根**且与 `dist/` 同级 —— 这是最常见的安装失败原因。
- 发布章节要覆盖提交到官方主题市场所需的字段，含 `download` + `sha256` 必须成对出现、缺一则市场里无法一键安装。

### R3 发布工作流

- 新增 GitHub Actions 工作流，推 `v*` 标签时产出可安装归档并建 Release。
- 必须校验标签版本号与 `komari-theme.json` 的 `version` 一致，不一致直接失败 —— 否则会出现 tag 是 `v0.2.0`、包里却是 `0.1.0` 的情况。
- 必须复用 `npm run package`，不能在工作流里另写一套打包逻辑。
- 必须输出归档的 SHA256，并在 Release 说明里给出可直接粘贴到主题市场 `v1.json` 的条目片段：`download` 与 `sha256` 手工填写时一旦对不上，所有使用者的一键安装都会失败，而本地测不出来。
- 归档作为 Release 资产上传，得到稳定的 `download` 直链。

## Constraints

- 页脚 `Powered by Komari Monitor.` 是主题规范要求，必须原样保留，不能被改写或挪位。
- 注释一律中文，不写墓碑注释（不记录改动历史、不引用设计讨论过程）。
- 不新增运行时依赖。图标沿用项目既有做法：内联 Lucide 路径，不引图标库。
- 不引入指向第三方 CDN 的资源。
- 本任务不创建 git commit。

## Out of Scope

- LICENSE 文件（协议选择由仓库所有者决定）。
- 向 `komari-monitor/theme-market` 实际提交 PR、发 GitHub Release。
- 英文版 README。
- `komari-theme.json` 的 `version` 变更。

## Acceptance Criteria

- [x] 页脚渲染出 `Powered by Komari Monitor. · Minimal` 加一个 GitHub 图标链接，`href` 为 `https://github.com/lizhenmiao/komari-theme-minimal`。
- [x] 该 `href` 与 `komari-theme.json` 的 `url` 字段值一致，且前端源码中不存在第二处硬编码的仓库地址（`src/` 下检索 `github.com` 与 `komari-theme-minimal` 均无命中）。
- [x] 链接带 `target="_blank"` 与 `rel` 含 `noopener`。
- [x] 三种语言各有该链接的无障碍名称，无 `footer.` 前缀的键名泄漏到页面上。
- [x] `tsc -b` 通过（`resolveJsonModule` 已开启）。
- [x] 根目录存在 `README.md`，其中列出的每条命令都存在于 `package.json` 的 `scripts`（已用脚本逐条比对）。
- [x] README 中写到的端口与环境变量名和 `vite.config.ts`、`.env.example`、`scripts/mock-server.mjs` 实际值一致。
- [x] 既有校验全绿：`format:check` 30/30、`smoke` 75/75、`render` 41/41 ×3、`dev:check` 10/10、`browser` 73/73、`package` 18/18。
- [x] `browser-check` 新增断言覆盖页脚链接，且逐条在故意改坏时验证过会失败（见 Notes）。
- [x] 发布工作流 YAML 可被解析，其中出现的 npm 脚本与 `scripts/*.mjs` 引用都存在。
- [x] 工作流里的版本一致性检查在标签与 manifest 版本不符时会失败（`node scripts/release-entry.mjs check v0.2.0` 实测退出码 1）。

## Notes

- 官方主题市场目录：`https://raw.githubusercontent.com/komari-monitor/theme-market/main/v1.json`（`web/api/admin/theme_market.go:25`）。条目校验见同文件 `validateThemeMarketTheme`，`short` 字符集见 `web/api/admin/theme.go:296`。
- 市场条目里的 `preview` 要求绝对 http(s) 地址，和 `komari-theme.json` 里指向归档内文件的 `preview` 是两回事。
- `scripts/render-check.mjs` 与 `scripts/format-check.mjs` 都用 `configFile: false` 构建，不加载 `vite.config.ts`。因此主题元信息不能靠 vite `define` 注入，那两层会拿到未定义的标识符；走 JSON import 才能在 dev / build / SSR / 浏览器四条路径上都成立。

## 实施中发现的问题

### 页脚一直是收缩居中的（既有缺陷，非本次引入）

`<footer>` 是 `.km-layout`（`flex flex-col`）的直接子项，而它带着 `mx-auto`。弹性子项在交叉轴上带 auto 外边距时，auto 会吸走全部剩余空间并压掉 `stretch`，元素于是收缩成内容宽度再居中：实测视口 1500px 下页脚只有 410px、整行居中，`justify-between` 没有任何空间可分配。

`<main>` 上同样的类能正常工作，因为它在普通 block 容器里，不是弹性子项。

本次要求的左右分列在这个缺陷存在时不可能实现，所以顺带修掉：给 `<footer>` 加 `w-full`，宽度确定后 auto 外边距分不到剩余空间。修后页脚左右缘与正文重合（实测 32px / 1552px）。

### `browser-check` 的中文断言依赖宿主语言（既有缺陷，被 R3 变成发布阻塞项）

`browser-check.mjs` 里写死的中文文案（管理后台、登录、表格、全部、长期、永久）要求页面就是中文渲染的，而无头浏览器的语言跟随宿主环境。中文开发机上恰好成立，Linux runner（`LANG=C.UTF-8`）上 `navigator` 报 en，`detectLanguage()`（`src/i18n/index.ts:46`）返回 `'en'`，这些断言集体变红。

实测：把钉住的语言临时改成 `en`，**8 条断言变红**（含级联的「表格视图共用同一筛选 0 行」）。也就是说 R3 的工作流在真实 runner 上永远建不出 Release。

修法是在 `browser-check.mjs` 里钉死环境而不是指望 runner 的 locale：`detectLanguage()` 最优先读 `localStorage` 的 `language` 键，所以正式取样前先写入 `zh-CN`；视口一并钉成 1600x900（页脚几何断言依赖真实宽度）。没有改成「从 locale 文件读期望值」—— 那样就抓不到「文案被误删」，与 `quality-guidelines.md` 冲突。

`render-check.mjs` 不受影响：它在 `installBrowserStubs` 里已把 `navigator` 钉成 `zh-CN`（`:242`）。`dev-check.mjs` 的断言全是结构性的，不比对文案。

顺带新增 `.github/workflows/ci.yml`：`release.yml` 只在推标签时触发，这条路径在发版前从未被执行过，正是本缺陷没被发现的原因。

## 审查后的其他修正

- `README.md` 详情页第五张图写成「累计流量」，实际是**平均负载**（`NodeDetail.tsx:490` `metric.load`）。已改。
- `README.md` 的 mock 开关照抄不生效：实测 `npm run mock --no-rpc2 0` 被 npm 当自身配置吞掉，实际执行 `node scripts/mock-server.mjs 0`，输出 `rpc2 enabled`。已补 `--` 用法与错误示例。
- `theme-meta.ts` 原注释称「Vite 在 JSON 超阈值时会切成 `JSON.parse` 导致具名导出消失」，在 Vite 6.0.7 上不成立（`json.namedExports` 默认为真，根为对象时始终产出具名导出）。已换成经产物实测的真实结论：具名导出使 Rollup 能对默认导出做属性级摇树，配置项文案并未进入客户端产物。
- `themeName()` 的回退链由 `??` 改为 `||`，与「退到第一个非空值」的注释对齐。
- `图标有实际尺寸` 改为卡上下界：内联 svg 缺显式尺寸时回落到 CSS 默认 300x150，只卡「大于 0」照样通过。
- `链接文字含主题名` 先滤掉空串，否则 `includes('')` 恒真。
- `browser-check.mjs` 全文原先没有 `setViewport`，页脚几何断言依赖隐式视口。已显式钉死。

## 断言可失败性验证

新增的 13 条断言逐条用「故意改坏 → 确认变红」验证过：

| 改动 | 预期变红 | 实测 |
| --- | --- | --- |
| 去掉 `km-footer-source` 类 | 页脚有仓库入口 | ✓ 「页脚里没有出处链接」 |
| `href` 改成 example.com | 地址与 manifest 的 url 一致 | ✓ |
| 删 `target` | 在新标签页打开 | ✓ null |
| 删 `rel` | 带 noopener | ✓ 空 |
| 三份词条都删 `footer.source` | 无障碍名称已翻译并完成插值 | ✓ 吐出 `footer.source` |
| `d` 置空 | 图标路径不是空的 | ✓ 0px |
| 去掉 `w-full` | 页脚左右缘与正文对齐、出处与自定义内容分列两端 | ✓ 607/977 对 32/1552，空隙 8px |

两条附带结论：

- `图标有实际尺寸` 与 `图标路径不是空的` 量的不是同一件事 —— `d` 置空后前者仍 ok（svg 保留布局尺寸）、后者变 0。
- `自定义内容贴住右缘` 量的是行内相对位置，页脚塌陷时整行一起变窄，所以这条**检测不到塌陷**，兜住它的是两条对齐断言。
