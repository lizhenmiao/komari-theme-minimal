/**
 * 版本号变更：改 manifest、提交、打标签，一步完成。
 *
 *   npm run bump 0.2.0
 *
 * 发布卡点要求标签与 komari-theme.json 的 version 相等（见 release-entry.mjs）。
 * 手动分三步做迟早会漏一步，所以合成一条命令，让两者不可能对不上。
 *
 * 不推送。推标签会真的发一个版本出去，这一步必须是显式的。
 */

import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'

const version = process.argv[2]

function die(message) {
  console.error(message)
  process.exit(1)
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()

if (!version) die('用法: npm run bump <版本号>，例如 npm run bump 0.2.0')

/*
 * 形状按 semver 卡，允许 0.2.0-rc1 这类预发布后缀 —— Komari 只要求 version
 * 非空，带后缀是合法的，但标签必须跟着写成 v0.2.0-rc1。
 */
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  die(`版本号 ${version} 不是 semver 形状。不要带 v 前缀，脚本会自己加。`)
}

/*
 * 工作区必须干净。否则这次提交会把无关改动一起卷进「发布 vX」这个 commit，
 * 事后没法把版本变更单独取出来或回退。
 */
const dirty = git('status', '--porcelain')
if (dirty) {
  die(`工作区有未提交的改动，先处理掉再发版：\n${dirty}`)
}

const tag = `v${version}`
const existing = git('tag', '--list', tag)
if (existing) die(`标签 ${tag} 已存在。要重发这个版本，先删掉标签和对应的 Release。`)

const source = await readFile('komari-theme.json', 'utf8')
const manifest = JSON.parse(source)
if (manifest.version === version) {
  die(`komari-theme.json 的 version 已经是 ${version} 了，没有要改的。`)
}
const from = manifest.version

/*
 * 只替换 version 那一行，不做 JSON.stringify 回写：整份重新序列化会把键顺序
 * 和缩进洗一遍，diff 变成整文件改动，评审时看不出真正改了什么。
 */
const next = source.replace(
  /("version"\s*:\s*)"[^"]*"/,
  (_, prefix) => `${prefix}${JSON.stringify(version)}`,
)
if (next === source) die('没能在 komari-theme.json 里定位到 version 字段')
await writeFile('komari-theme.json', next, 'utf8')

git('add', 'komari-theme.json')
git('commit', '-m', `chore: 发布 ${tag}`)
git('tag', tag)

console.log(`  ${from} → ${version}`)
console.log(`  已提交并打上标签 ${tag}（未推送）`)
console.log('')
console.log('  确认无误后推送，这会触发发布工作流：')
console.log(`    git push origin HEAD ${tag}`)
