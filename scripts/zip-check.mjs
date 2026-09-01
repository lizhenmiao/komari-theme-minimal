/**
 * 校验打出来的归档确实可安装。
 *
 * 针对真实 zip 而不是暂存目录跑，因为它要防的那一类问题（反斜杠分隔符、
 * manifest 放错位置）只存在于归档内部。
 *
 *   node scripts/zip-check.mjs
 */

import { readFile, readdir } from 'node:fs/promises'
import { inflateRawSync } from 'node:zlib'

let failures = 0
let checks = 0

function check(label, condition, detail = '') {
  checks += 1
  if (condition) {
    console.log(`  ok   ${label}`)
  } else {
    failures += 1
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

/** 读中央目录，条目名以它为准。 */
function readCentralDirectory(buffer) {
  // 从尾部往前扫魔数，定位「中央目录结束记录」。
  let eocd = -1
  for (let i = buffer.length - 22; i >= 0; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd === -1) throw new Error('no end-of-central-directory record')

  const count = buffer.readUInt16LE(eocd + 10)
  let offset = buffer.readUInt32LE(eocd + 16)
  const entries = []

  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`bad central header at ${offset}`)
    }
    const method = buffer.readUInt16LE(offset + 10)
    const crc = buffer.readUInt32LE(offset + 16)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const uncompressedSize = buffer.readUInt32LE(offset + 24)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8')

    entries.push({ name, method, crc, compressedSize, uncompressedSize, localOffset })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let c = i
    for (let bit = 0; bit < 8; bit += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c
  }
  return table
})()

function crc32(buffer) {
  let crc = -1
  for (let i = 0; i < buffer.length; i += 1) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[i]) & 0xff]
  }
  return (crc ^ -1) >>> 0
}

/** 按局部头把某个条目的字节取出来。 */
function extract(buffer, entry) {
  const nameLength = buffer.readUInt16LE(entry.localOffset + 26)
  const extraLength = buffer.readUInt16LE(entry.localOffset + 28)
  const start = entry.localOffset + 30 + nameLength + extraLength
  const payload = buffer.subarray(start, start + entry.compressedSize)
  return entry.method === 8 ? inflateRawSync(payload) : Buffer.from(payload)
}

const files = await readdir('.')
const zipName = files.find((name) => name.endsWith('.zip'))
if (!zipName) {
  console.log('  FAIL no .zip in the project root — run `npm run package` first')
  process.exit(1)
}

console.log(`Archive: ${zipName}`)
const buffer = await readFile(zipName)
const entries = readCentralDirectory(buffer)

// 这一项就是自己写 zip writer 的原因。
const backslashed = entries.filter((entry) => entry.name.includes('\\'))
check('no entry name uses a backslash', backslashed.length === 0, backslashed.map((e) => e.name).join(', '))

// 最常见的安装失败原因。
check(
  'komari-theme.json sits at the archive root',
  entries.some((entry) => entry.name === 'komari-theme.json'),
)
check(
  'komari-theme.json is NOT inside dist/',
  !entries.some((entry) => entry.name === 'dist/komari-theme.json'),
)
check(
  'dist/index.html is present',
  entries.some((entry) => entry.name === 'dist/index.html'),
)
check(
  'assets live under dist/assets/',
  entries.some((entry) => entry.name.startsWith('dist/assets/')),
)
// Go 的 embed 会跳过以下划线开头的文件名。
check(
  'no emitted file starts with an underscore',
  !entries.some((entry) => entry.name.split('/').pop()?.startsWith('_')),
)

// 每个条目都必须能完整往返。
let corrupt = 0
for (const entry of entries) {
  const data = extract(buffer, entry)
  if (data.length !== entry.uncompressedSize || crc32(data) !== entry.crc) corrupt += 1
}
check('every entry decompresses with a matching CRC', corrupt === 0, `${corrupt} corrupt`)

// manifest 必须能 parse，且字段自洽。
const manifestEntry = entries.find((entry) => entry.name === 'komari-theme.json')
if (manifestEntry) {
  const manifest = JSON.parse(extract(buffer, manifestEntry).toString('utf8'))
  check('manifest has a short name', typeof manifest.short === 'string' && manifest.short.length > 0)
  check('manifest short is not "default"', manifest.short !== 'default')
  check('manifest has a version', typeof manifest.version === 'string')
  check('archive filename carries the manifest version', zipName.includes(manifest.version))
}

// Komari 在安装时按字符串替换的那几个哨兵。
const htmlEntry = entries.find((entry) => entry.name === 'dist/index.html')
if (htmlEntry) {
  const html = extract(buffer, htmlEntry).toString('utf8')
  for (const sentinel of [
    '<title>Komari Monitor</title>',
    'A simple server monitor tool.',
    '</head>',
    '</body>',
  ]) {
    check(`packaged index.html keeps the ${JSON.stringify(sentinel)} sentinel`, html.includes(sentinel))
  }
  /*
   * 资源路径必须是 /themes/{short}/dist/ 前缀。
   *
   * 这条断言原本写反了（要求必须相对路径），于是它反过来守住了那个真正的 bug：
   * 相对路径在深层路由上会白屏。断言方向写错比 bug 本身更危险 —— 检查一直是
   * 绿的，问题却一直在。
   */
  const expectedPrefix = manifestEntry
    ? `/themes/${JSON.parse(extract(buffer, manifestEntry).toString('utf8')).short}/dist/`
    : null
  const assetRefs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((ref) => /\.(js|css|svg|png|woff2?)$/.test(ref))

  check('packaged index.html 有资源引用', assetRefs.length > 0)
  check(
    'packaged index.html 不用相对路径',
    assetRefs.every((ref) => !ref.startsWith('./') && !ref.startsWith('../')),
    assetRefs.filter((r) => r.startsWith('.')).join(', '),
  )
  if (expectedPrefix) {
    check(
      `packaged index.html 资源前缀为 ${expectedPrefix}`,
      assetRefs.filter((r) => r.startsWith('/')).every((r) => r.startsWith(expectedPrefix)),
      assetRefs.filter((r) => r.startsWith('/') && !r.startsWith(expectedPrefix)).join(', '),
    )
  }
}

console.log(`\n${checks - failures}/${checks} checks passed`)
if (failures > 0) process.exit(1)
