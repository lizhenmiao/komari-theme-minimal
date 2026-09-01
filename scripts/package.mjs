/**
 * 打出可安装的归档。
 *
 * Komari 要求 komari-theme.json 位于**归档根**，和 dist/ 同级，不是放在里面。
 * 这一点弄错是最常见的安装失败原因。
 *
 *   komari-theme-minimal-<version>.zip
 *   ├── komari-theme.json
 *   ├── preview.png
 *   └── dist/
 *
 * 归档由 scripts/lib/zip.mjs 写出，不用系统工具 —— 原因见那个文件的注释。
 * 由 `npm run package` 调用。
 */
import { access, readFile, readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { writeZip } from './lib/zip.mjs'

const manifest = JSON.parse(await readFile('komari-theme.json', 'utf8'))
const version = manifest.version ?? '0.0.0'
const out = resolve(`komari-theme-${manifest.short}-${version}.zip`)

/** 递归收集文件，条目名统一用 POSIX 分隔符。 */
async function collect(dir, prefix) {
  const entries = []
  for (const name of await readdir(dir)) {
    const full = join(dir, name)
    const info = await stat(full)
    // 不论宿主平台是什么，一律用 `/`。
    const zipName = `${prefix}/${name}`
    if (info.isDirectory()) {
      entries.push(...(await collect(full, zipName)))
    } else {
      entries.push({ name: zipName, data: await readFile(full) })
    }
  }
  return entries
}

const entries = [
  { name: 'komari-theme.json', data: await readFile('komari-theme.json') },
  ...(await collect('dist', 'dist')),
]

const hasPreview = await access('preview.png').then(
  () => true,
  () => false,
)
if (hasPreview) {
  entries.push({ name: 'preview.png', data: await readFile('preview.png') })
} else {
  console.warn('  ! preview.png missing — the theme market listing needs one.')
}

await writeZip(entries, out)

const bytes = (await stat(out)).size
console.log(`  packaged ${out}`)
console.log(`  ${entries.length} entries, ${(bytes / 1024).toFixed(1)} kB`)
