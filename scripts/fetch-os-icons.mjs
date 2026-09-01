/**
 * 把 Simple Icons（CC0）的 SVG path 内联进 src/components/OsIcon.tsx。
 *
 * 不要手抄 path 数据，跑这个：
 *   node scripts/fetch-os-icons.mjs
 *
 * path 是提交进仓库的，所以构建不依赖网络，主题也永远不会让访客的浏览器去
 * 请求第三方 CDN。
 */

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TARGET = join(ROOT, 'src', 'components', 'OsIcon.tsx')
const VERSION = '13'

/** 本地 key -> Simple Icons 的 slug。 */
const ICONS = {
  ubuntu: 'ubuntu',
  debian: 'debian',
  alpine: 'alpinelinux',
  rocky: 'rockylinux',
  centos: 'centos',
  fedora: 'fedora',
  arch: 'archlinux',
  // 没有 Windows：Simple Icons 因商标问题移除了那个图标，所以 Windows 节点
  // 走通用终端图形。
}

const entries = []
for (const [key, slug] of Object.entries(ICONS)) {
  const url = `https://cdn.jsdelivr.net/npm/simple-icons@${VERSION}/icons/${slug}.svg`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${slug}: HTTP ${response.status}`)
  const svg = await response.text()
  const path = svg.match(/\sd="([^"]+)"/)?.[1]
  if (!path) throw new Error(`${slug}: no path in SVG`)
  // path 里出现单引号会破坏生成出来的字符串字面量。
  if (path.includes("'")) throw new Error(`${slug}: path contains a single quote`)
  entries.push(`  ${key}: '${path}',`)
  console.log(`${key.padEnd(8)} <- ${slug} (${path.length} chars)`)
}

const source = await readFile(TARGET, 'utf8')
const block = entries.join('\n')

let next
if (source.includes('/*ICONS*/')) {
  next = source.replace('/*ICONS*/', block)
} else {
  // 重复运行时：替换 PATHS 对象字面量里的全部内容。
  const pattern = /(const PATHS: Record<OsKey, string> = \{\n)[\s\S]*?(\n\})/
  if (!pattern.test(source)) throw new Error('could not locate the PATHS object')
  next = source.replace(pattern, `$1${block}$2`)
}

await writeFile(TARGET, next, 'utf8')
console.log(`\nwrote ${entries.length} paths into src/components/OsIcon.tsx`)
