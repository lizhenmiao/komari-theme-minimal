/**
 * Post-build contract check.
 *
 * Catches the failures that only surface after the theme is installed, when a
 * local `vite preview` still looks perfectly fine:
 *
 *   1. A rewritten <title> or description kills the operator's custom site name.
 *   2. A missing </head> or </body> kills custom head/body injection.
 *   3. An asset named `_foo.js` is skipped by Go's embed and 404s.
 *   4. An absolute asset path breaks under the /themes/{short}/dist/ prefix.
 *
 * Run via `npm run verify`. Exits non-zero with a report on any failure.
 */
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const DIST = 'dist'
const MANIFEST = 'komari-theme.json'

// Must appear byte-for-byte in dist/index.html. Komari substitutes by exact
// string match, so a reformat is a silent feature regression.
const SENTINELS = [
  '<title>Komari Monitor</title>',
  'A simple server monitor tool.',
  '</head>',
  '</body>',
]

const failures = []
const fail = (msg) => failures.push(msg)

const walk = async (dir) => {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(path)))
    else out.push(path)
  }
  return out
}

const html = await readFile(join(DIST, 'index.html'), 'utf8').catch(() => null)
if (html === null) {
  fail(`${DIST}/index.html not found — run the build first.`)
} else {
  // Komari substitutes the FIRST match of each sentinel, and so does Vite when
  // it injects the bundle tags. A sentinel that only survives inside a comment,
  // or that appears twice, means the operator's custom content lands somewhere
  // inert — which still builds and still previews fine locally.
  const stripped = html.replace(/<!--[\s\S]*?-->/g, '')
  const occurrences = (haystack, needle) => haystack.split(needle).length - 1

  for (const sentinel of SENTINELS) {
    const total = occurrences(stripped, sentinel)
    if (total === 0) {
      fail(
        occurrences(html, sentinel) > 0
          ? `sentinel survives only inside an HTML comment, injection is inert: ${sentinel}`
          : `index.html is missing the exact sentinel: ${sentinel}`,
      )
    } else if (total > 1) {
      fail(`sentinel appears ${total}x, only the first is substituted: ${sentinel}`)
    }
  }

  // Vite injects the bundle tags at the first head closing tag it finds, so a
  // comment that spells that tag out swallows them. The build succeeds, the
  // sentinel count still looks right, and the installed theme renders blank.
  for (const [label, pattern] of [
    ['module script', /<script[^>]+type="module"/],
    ['stylesheet link', /<link[^>]+rel="stylesheet"/],
  ]) {
    if (!pattern.test(stripped)) {
      fail(
        pattern.test(html)
          ? `${label} was injected inside an HTML comment, the page will render blank`
          : `${label} is missing from index.html`,
      )
    }
  }

  for (const match of html.matchAll(/(?:src|href)="(\/[^/][^"]*)"/g)) {
    fail(`index.html references an absolute path, use a relative one: ${match[1]}`)
  }
}

// Source-level guard for the failure above, stated as a rule about the template
// rather than about the output: never spell a closing head/body tag inside a
// comment. Vite injects the bundle at the first textual match, so a commented
// copy swallows the tags and the installed theme renders blank while
// `vite preview` still looks correct.
const source = await readFile('index.html', 'utf8').catch(() => null)
if (source === null) {
  fail('index.html not found at the repo root.')
} else {
  for (const comment of source.match(/<!--[\s\S]*?-->/g) ?? []) {
    for (const tag of ['</head>', '</body>']) {
      if (comment.includes(tag)) {
        fail(`index.html spells ${tag} inside a comment; the bundle is injected there`)
      }
    }
  }

  // The sentinels are matched byte-for-byte, so keep this one file pure ASCII
  // with no BOM. Windows PowerShell's `Set-Content -Encoding utf8` prepends a
  // BOM, which lands before <!doctype html> and mangles any non-ASCII already
  // in the file. Both happened during development of this scaffold.
  if (source.charCodeAt(0) === 0xfeff) {
    fail('index.html starts with a BOM; write it as UTF-8 without BOM')
  }
  const nonAscii = [...new Set([...source].filter((ch) => ch.codePointAt(0) > 127))]
  if (nonAscii.length > 0) {
    fail(`index.html must stay pure ASCII, found: ${JSON.stringify(nonAscii.join(''))}`)
  }
}

const files = await walk(DIST).catch(() => [])
for (const file of files) {
  const name = file.split(/[\\/]/).pop()
  if (name.startsWith('_')) {
    fail(`asset starts with "_" and Go's embed will skip it: ${file}`)
  }
}

const manifest = await readFile(MANIFEST, 'utf8')
  .then(JSON.parse)
  .catch((err) => {
    fail(`${MANIFEST} unreadable at repo root: ${err.message}`)
    return null
  })

if (manifest) {
  if (!manifest.name) fail(`${MANIFEST} is missing the required "name" field.`)
  if (!manifest.short) fail(`${MANIFEST} is missing the required "short" field.`)
  else if (!/^[A-Za-z0-9_-]+$/.test(manifest.short)) {
    fail(`"short" allows only letters, digits, _ and -: ${manifest.short}`)
  } else if (manifest.short === 'default') {
    fail('"short" may not be "default".')
  }

  const pkg = await readFile('package.json', 'utf8').then(JSON.parse)
  if (pkg.version !== undefined) {
    fail('package.json must not carry a version; the manifest is the only source.')
  }
}

if (failures.length > 0) {
  console.error(`\n  verify failed (${failures.length})\n`)
  for (const failure of failures) console.error(`  - ${failure}`)
  console.error('')
  process.exit(1)
}

console.log(`  verify passed — ${files.length} files in ${DIST}/`)
