/**
 * 构建后的契约校验。
 *
 * 抓的是那些只在主题装到服务端之后才暴露、本地 `vite preview` 一切正常的问题：
 *
 *   1. <title> 或描述被改写，运营者的自定义站点名失效。
 *   2. 缺少 head/body 的闭合标签，自定义注入失效。
 *   3. 产物名以 `_` 开头，Go 的 embed 会跳过，装上就 404。
 *   4. 资源路径前缀不对，深层路由白屏。
 *
 * 由 `npm run verify` 调用。任何一项失败都会打印报告并以非零码退出。
 */
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const DIST = 'dist'
const MANIFEST = 'komari-theme.json'

// 必须在 dist/index.html 里字节级一致地出现。Komari 靠精确字符串匹配替换，
// 所以任何重新格式化都是一次静默的功能退化。
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

// 先读 manifest：下面校验资源路径前缀时要用到 short。
const manifest = await readFile(MANIFEST, 'utf8')
  .then(JSON.parse)
  .catch((err) => {
    fail(`${MANIFEST} unreadable at repo root: ${err.message}`)
    return null
  })
const manifestShort = typeof manifest?.short === 'string' ? manifest.short : null

const html = await readFile(join(DIST, 'index.html'), 'utf8').catch(() => null)
if (html === null) {
  fail(`${DIST}/index.html not found — run the build first.`)
} else {
  // Komari 替换每个哨兵的第一处匹配，Vite 注入 bundle 标签时也一样。哨兵只
  // 活在注释里、或者出现两次，都意味着运营者的自定义内容落到了一个不起作用的
  // 位置 —— 而构建和本地预览都照常通过。
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

  // Vite 在它找到的第一个 head 闭合标签处注入 bundle 标签，所以注释里写出
  // 那个标签就会把它们吞掉。构建成功，哨兵计数看起来也对，装上去是白屏。
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

  /*
   * 资源路径必须是 /themes/{short}/dist/ 前缀的绝对路径。
   *
   * 相对路径（base: './'）在深层路由上会崩：服务端对未匹配路径返回
   * index.html，浏览器把 ./assets/x.js 解析成 /instance/assets/x.js，
   * 拿回来的是 HTML，按 MIME 拒绝执行，白屏。
   */
  const expectedBase = manifestShort ? `/themes/${manifestShort}/dist/` : null
  const assetRefs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((ref) => /\.(js|css|svg|png|woff2?)$/.test(ref))

  if (assetRefs.length === 0) {
    fail('index.html 里没有任何资源引用，构建产物不完整')
  }
  for (const ref of assetRefs) {
    if (ref.startsWith('./') || ref.startsWith('../')) {
      fail(`资源用了相对路径，深层路由会白屏：${ref}`)
    } else if (expectedBase && ref.startsWith('/') && !ref.startsWith(expectedBase)) {
      fail(`资源路径前缀不对，应为 ${expectedBase}：${ref}`)
    }
  }
}

// 针对上面那个问题的源码级防线。规则写在模板上而不是产物上：绝不在注释里
// 写出 head/body 的闭合标签。
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

  // 哨兵是字节级匹配，所以这个文件必须保持纯 ASCII 且无 BOM。注意 Windows
  // PowerShell 的 `Set-Content -Encoding utf8` 会加 BOM，落在 doctype 之前，
  // 同时把文件里已有的非 ASCII 字符搞坏。
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
