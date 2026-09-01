/**
 * 只够用来判断截图有没有内容的 PNG 解码器。
 *
 * 目的不是完整解码，而是回答一个问题：这张图是真的页面，还是一片空白。
 * 纯色图的颜色数极低、单一颜色占比极高，据此就能判定。
 */

import { inflateSync } from 'node:zlib'

/** 逐字节还原 PNG 的五种行过滤器。 */
function unfilter(raw, width, height, channels) {
  const stride = width * channels
  const out = Buffer.alloc(stride * height)
  let pos = 0

  for (let y = 0; y < height; y += 1) {
    const filter = raw[pos]
    pos += 1
    const line = raw.subarray(pos, pos + stride)
    pos += stride
    const target = out.subarray(y * stride, (y + 1) * stride)
    const prior = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null

    for (let x = 0; x < stride; x += 1) {
      const value = line[x] ?? 0
      const left = x >= channels ? (target[x - channels] ?? 0) : 0
      const up = prior ? (prior[x] ?? 0) : 0
      const upLeft = prior && x >= channels ? (prior[x - channels] ?? 0) : 0

      let result
      switch (filter) {
        case 0:
          result = value
          break
        case 1:
          result = value + left
          break
        case 2:
          result = value + up
          break
        case 3:
          result = value + ((left + up) >> 1)
          break
        case 4: {
          // Paeth：取和 left+up-upLeft 差值最小的那个作为预测值。
          const p = left + up - upLeft
          const dl = Math.abs(p - left)
          const du = Math.abs(p - up)
          const dul = Math.abs(p - upLeft)
          result = value + (dl <= du && dl <= dul ? left : du <= dul ? up : upLeft)
          break
        }
        default:
          throw new Error(`未知的 PNG 过滤器 ${filter}`)
      }
      target[x] = result & 0xff
    }
  }
  return out
}

/**
 * @param {Buffer} buffer PNG 文件内容
 * @returns {{width:number,height:number,colors:number,brightness:number,dominant:number}}
 */
export function analysePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG 文件')

  let offset = 8
  let width = 0
  let height = 0
  let colorType = 0
  let bitDepth = 0
  const idat = []

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii')
    const data = buffer.subarray(offset + 8, offset + 8 + length)

    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8] ?? 0
      colorType = data[9] ?? 0
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    offset += 12 + length
  }

  if (bitDepth !== 8) throw new Error(`只支持 8 位色深，实际 ${bitDepth}`)
  // 2 = 真彩色，6 = 真彩色 + alpha
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0
  if (channels === 0) throw new Error(`不支持的颜色类型 ${colorType}`)

  const pixels = unfilter(inflateSync(Buffer.concat(idat)), width, height, channels)

  // 每 4 个像素采样一次就够判断，全量遍历没必要。
  const seen = new Map()
  let brightnessSum = 0
  let sampled = 0

  for (let i = 0; i < pixels.length; i += channels * 4) {
    const r = pixels[i] ?? 0
    const g = pixels[i + 1] ?? 0
    const b = pixels[i + 2] ?? 0
    const key = (r << 16) | (g << 8) | b
    seen.set(key, (seen.get(key) ?? 0) + 1)
    brightnessSum += (r + g + b) / 3
    sampled += 1
  }

  let max = 0
  for (const count of seen.values()) if (count > max) max = count

  return {
    width,
    height,
    colors: seen.size,
    brightness: Math.round(brightnessSum / Math.max(sampled, 1)),
    dominant: Number(((max / Math.max(sampled, 1)) * 100).toFixed(1)),
    // 留出原始像素，供按区域采样用
    pixels,
    channels,
  }
}

/**
 * 按矩形区域统计。
 *
 * 全图聚合指标会骗人：浅色主题大片白底，"只有导航栏"和"内容齐全"的
 * 平均亮度几乎一样。要判断某块区域到底有没有东西，只能单独看那块。
 *
 * @returns {{colors:number, brightness:number, flat:boolean}}
 */
export function sampleRegion(png, x, y, w, h) {
  const { pixels, channels, width } = png
  const seen = new Set()
  let sum = 0
  let count = 0

  for (let row = y; row < Math.min(y + h, png.height); row += 2) {
    for (let col = x; col < Math.min(x + w, width); col += 2) {
      const i = (row * width + col) * channels
      const r = pixels[i] ?? 0
      const g = pixels[i + 1] ?? 0
      const b = pixels[i + 2] ?? 0
      seen.add((r << 16) | (g << 8) | b)
      sum += (r + g + b) / 3
      count += 1
    }
  }

  return {
    colors: seen.size,
    brightness: Math.round(sum / Math.max(count, 1)),
    // 一个区域只有个别颜色，基本就是纯色块，说明那里什么都没画
    flat: seen.size <= 3,
  }
}
