/**
 * Builds the installable archive.
 *
 * Komari requires komari-theme.json at the ARCHIVE ROOT, as a sibling of dist/
 * — not inside it. Getting this wrong is the most common install failure.
 *
 *   komari-theme-minimal-<version>.zip
 *   ├── komari-theme.json
 *   ├── preview.png
 *   └── dist/
 *
 * Uses the system `zip` on POSIX and Compress-Archive on Windows so there is no
 * archiver dependency. Run via `npm run package` (build + verify + this).
 */
import { execFileSync } from 'node:child_process'
import { readFile, rm, mkdtemp, cp, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const manifest = JSON.parse(await readFile('komari-theme.json', 'utf8'))
const version = manifest.version ?? '0.0.0'
const out = resolve(`komari-theme-${manifest.short}-${version}.zip`)

const staged = await mkdtemp(join(tmpdir(), 'komari-theme-'))
await cp('dist', join(staged, 'dist'), { recursive: true })
await cp('komari-theme.json', join(staged, 'komari-theme.json'))

const hasPreview = await access('preview.png').then(
  () => true,
  () => false,
)
if (hasPreview) await cp('preview.png', join(staged, 'preview.png'))
else console.warn('  ! preview.png missing — the theme market listing needs one.')

await rm(out, { force: true })

if (process.platform === 'win32') {
  execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path '${join(staged, '*')}' -DestinationPath '${out}'`,
    ],
    { stdio: 'inherit' },
  )
} else {
  execFileSync('zip', ['-rq', out, '.'], { cwd: staged, stdio: 'inherit' })
}

await rm(staged, { recursive: true, force: true })
console.log(`  packaged ${out}`)
