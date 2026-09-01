/**
 * 极简 ZIP 写入器。
 *
 * 存在的理由：Windows PowerShell 5.1 的 `Compress-Archive` 写出来的条目名用
 * 反斜杠分隔。ZIP 规范要求正斜杠，而 Komari 解包主题用的 Go `archive/zip`
 * 会把 `dist\index.html` 当成一个扁平文件名 —— 装上去没有 `dist/` 目录，
 * 所有资源 404。
 *
 * 用 zlib 做 deflate，压不动的内容退回 stored。
 */

import { deflateRawSync } from 'node:zlib'
import { writeFile } from 'node:fs/promises'

/** 标准 CRC-32（多项式 0xEDB88320），每个 ZIP 头都要求。 */
const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let c = i
    for (let bit = 0; bit < 8; bit += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
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

/** MS-DOS 日期时间，基础规范唯一支持的时间戳格式。 */
function dosDateTime(date) {
  const time =
    (Math.floor(date.getSeconds() / 2) & 0x1f) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((date.getHours() & 0x1f) << 11)
  const day =
    (date.getDate() & 0x1f) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    ((Math.max(date.getFullYear() - 1980, 0) & 0x7f) << 9)
  return { time, day }
}

/**
 * @param {{name: string, data: Buffer}[]} entries names must use `/`
 * @param {string} outPath
 */
export async function writeZip(entries, outPath) {
  const now = new Date()
  const { time, day } = dosDateTime(now)

  const locals = []
  const centrals = []
  let offset = 0

  for (const entry of entries) {
    // 守住这个模块存在的全部理由。
    if (entry.name.includes('\\')) {
      throw new Error(`zip entry "${entry.name}" contains a backslash`)
    }

    const nameBytes = Buffer.from(entry.name, 'utf8')
    const raw = entry.data
    const deflated = deflateRawSync(raw, { level: 9 })
    // method 8 = deflate，0 = stored。绝不让"压缩"把文件搞得更大。
    const useDeflate = deflated.length < raw.length
    const payload = useDeflate ? deflated : raw
    const method = useDeflate ? 8 : 0
    const crc = crc32(raw)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0) // local file header signature
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0, 6) // flags
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(day, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(payload.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    local.writeUInt16LE(0, 28) // extra field length

    locals.push(local, nameBytes, payload)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0) // central directory signature
    central.writeUInt16LE(20, 4) // version made by
    central.writeUInt16LE(20, 6) // version needed
    central.writeUInt16LE(0, 8) // flags
    central.writeUInt16LE(method, 10)
    central.writeUInt16LE(time, 12)
    central.writeUInt16LE(day, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(payload.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt16LE(0, 30) // extra
    central.writeUInt16LE(0, 32) // comment
    central.writeUInt16LE(0, 34) // disk number
    central.writeUInt16LE(0, 36) // internal attrs
    // 外部属性：高 16 位放 unix mode 0644。必须 `>>> 0`，因为 JS 的位移是
    // 有符号 32 位运算，直接左移会变成负数。
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38)
    central.writeUInt32LE(offset, 42)

    centrals.push(central, nameBytes)
    offset += local.length + nameBytes.length + payload.length
  }

  const centralBuffer = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0) // end of central directory
  end.writeUInt16LE(0, 4) // this disk
  end.writeUInt16LE(0, 6) // disk with central dir
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralBuffer.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20) // comment length

  await writeFile(outPath, Buffer.concat([...locals, centralBuffer, end]))
}
