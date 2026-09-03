/**
 * 发布辅助：校验标签版本，生成 Release 说明。
 *
 *   node scripts/release-entry.mjs check <tag>
 *   node scripts/release-entry.mjs notes <tag>
 *
 * 这些逻辑不放进工作流的 YAML：那里的 shell 只有真的推了标签才跑得到，出错
 * 时版本已经发出去了。放在脚本里本地就能验。
 *
 * 归档名由 komari-theme.json 的 short 与 version 决定（见 package.mjs），
 * 所以标签和 manifest 版本必须一致，否则会发出一个版本号对不上的包。
 */

import { createHash } from 'node:crypto'
import { appendFile, readFile, stat } from 'node:fs/promises'

const [mode, tag] = process.argv.slice(2)

function die(message) {
  console.error(message)
  process.exit(1)
}

if (!mode || !tag) {
  die('用法: node scripts/release-entry.mjs <check|notes> <tag>')
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

const zipName = `komari-theme-${short}-${version}.zip`
const buffer = await readFile(zipName).catch(() => die(`找不到 ${zipName}，先跑 npm run package`))
const sha256 = createHash('sha256').update(buffer).digest('hex')
const kb = ((await stat(zipName)).size / 1024).toFixed(1)
const displayName = manifest.name?.['zh-CN'] ?? short

/*
 * 说明面向的是要装主题的运营者，不是目录维护者。所以只放安装方式和校验用的
 * 摘要：市场目录的条目字段由 theme-market 的 Action 从 Release 自己推导，
 * 作者和使用者都不需要手填。
 */
console.log(
  [
    '## 安装',
    '',
    `后台 → 主题 → 主题市场，找到 ${displayName} 一键安装；或下载下面的归档，用「上传主题」安装。`,
    '',
    '| | |',
    '| --- | --- |',
    `| 归档 | \`${zipName}\` |`,
    `| 大小 | ${kb} kB |`,
    `| SHA256 | \`${sha256}\` |`,
  ].join('\n'),
)

// 供工作流后续步骤取归档名，免得在 YAML 里再拼一遍。
if (process.env['GITHUB_OUTPUT']) {
  await appendFile(process.env['GITHUB_OUTPUT'], `zip=${zipName}\nsha256=${sha256}\n`)
}
