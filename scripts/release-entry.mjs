/**
 * 发布辅助：校验标签版本、生成 Release 说明与主题市场条目。
 *
 *   node scripts/release-entry.mjs check <tag>
 *   node scripts/release-entry.mjs notes <tag> <owner/repo>
 *
 * 这些逻辑不放进工作流的 YAML：那里的 shell 只有真的推了标签才跑得到，出错
 * 时版本已经发出去了。放在脚本里本地就能验。
 *
 * 归档名由 komari-theme.json 的 short 与 version 决定（见 package.mjs），
 * 所以标签和 manifest 版本必须一致，否则会发出一个版本号对不上的包。
 */

import { createHash } from 'node:crypto'
import { appendFile, readFile, stat } from 'node:fs/promises'

const [mode, tag, repo] = process.argv.slice(2)

function die(message) {
  console.error(message)
  process.exit(1)
}

if (!mode || !tag) {
  die('用法: node scripts/release-entry.mjs <check|notes> <tag> [owner/repo]')
}
if (mode !== 'check' && mode !== 'notes') {
  die(`未知模式 ${mode}，只支持 check 与 notes`)
}

const manifest = JSON.parse(await readFile('komari-theme.json', 'utf8'))
const { short, version } = manifest
const tagVersion = tag.replace(/^v/, '')

if (tagVersion !== version) {
  die(
    `标签 ${tag} 与 komari-theme.json 的 version=${version} 不一致。\n` +
      '归档名按 manifest 生成，两者不同就会发出一个版本号对不上的包。',
  )
}

if (mode === 'check') {
  console.log(`版本一致：${tag} → ${version}`)
  process.exit(0)
}

if (!repo) die('notes 模式需要第三个参数 owner/repo')

const zipName = `komari-theme-${short}-${version}.zip`
const buffer = await readFile(zipName).catch(() => die(`找不到 ${zipName}，先跑 npm run package`))
const sha256 = createHash('sha256').update(buffer).digest('hex')
const kb = ((await stat(zipName)).size / 1024).toFixed(1)

/*
 * 市场条目。两处地址都钉在标签上而不是分支上：
 *   - preview 必须是能直接取到的绝对图片地址，归档里那份服务端读不到；
 *     指向分支的话以后换截图会把历史版本的预览一起改掉。
 *   - download 用 Release 资产直链，配合 sha256 才能一键安装（缺一则
 *     服务端把 installable 判为 false，市场里只能跳转仓库）。
 */
const entry = {
  name: manifest.name,
  short,
  description: manifest.description,
  version,
  author: manifest.author,
  url: manifest.url,
  preview: `https://raw.githubusercontent.com/${repo}/${tag}/preview.png`,
  download: `https://github.com/${repo}/releases/download/${tag}/${zipName}`,
  sha256,
}

console.log(
  [
    '## 安装',
    '',
    '后台 → 主题 → 上传主题，选择下面的归档。或在主题市场里直接安装。',
    '',
    '| | |',
    '| --- | --- |',
    `| 归档 | \`${zipName}\` |`,
    `| 大小 | ${kb} kB |`,
    `| SHA256 | \`${sha256}\` |`,
    '',
    '<details>',
    `<summary>主题市场条目（提给 komari-monitor/theme-market 的 v1.json）</summary>`,
    '',
    '```json',
    JSON.stringify(entry, null, 2),
    '```',
    '',
    '</details>',
  ].join('\n'),
)

// 供工作流后续步骤取归档名，免得在 YAML 里再拼一遍。
if (process.env['GITHUB_OUTPUT']) {
  await appendFile(process.env['GITHUB_OUTPUT'], `zip=${zipName}\nsha256=${sha256}\n`)
}
