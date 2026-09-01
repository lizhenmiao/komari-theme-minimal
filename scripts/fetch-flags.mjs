/**
 * 把 flag-icons 的 SVG 国旗抓到 public/flags/。
 *
 *   node scripts/fetch-flags.mjs
 *
 * 为什么必须自托管：`region` 字段在实例里通常是国旗 emoji，而 Windows 的
 * Segoe UI Emoji **故意不含国旗字形** —— 区域指示符对在 Windows 上渲染成两个
 * 字母方块，不是国旗。所以不能依赖系统字体。
 *
 * 也不能用第三方国旗 CDN：那会让每个访客的浏览器去请求外部主机，泄漏来访 IP，
 * 内网部署还会裂图。文件提交进仓库，随主题产物一起分发，运行时零外部请求。
 *
 * flag-icons 是 MIT 许可，旗面图形本身属于公有领域。
 */

import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public', 'flags')
const VERSION = '7.2.3'

/**
 * ISO 3166-1 alpha-2 全集，外加 flag-icons 提供的几个常用地区码
 * （gb-eng 之类的次级区划不收，实例里不会出现）。
 */
const CODES = `
ad ae af ag ai al am ao aq ar as at au aw ax az
ba bb bd be bf bg bh bi bj bl bm bn bo bq br bs bt bv bw by bz
ca cc cd cf cg ch ci ck cl cm cn co cr cu cv cw cx cy cz
de dj dk dm do dz
ec ee eg eh er es et
fi fj fk fm fo fr
ga gb gd ge gf gg gh gi gl gm gn gp gq gr gs gt gu gw gy
hk hm hn hr ht hu
id ie il im in io iq ir is it
je jm jo jp
ke kg kh ki km kn kp kr kw ky kz
la lb lc li lk lr ls lt lu lv ly
ma mc md me mf mg mh mk ml mm mn mo mp mq mr ms mt mu mv mw mx my mz
na nc ne nf ng ni nl no np nr nu nz
om
pa pe pf pg ph pk pl pm pn pr ps pt pw py
qa
re ro rs ru rw
sa sb sc sd se sg sh si sj sk sl sm sn so sr ss st sv sx sy sz
tc td tf tg th tj tk tl tm tn to tr tt tv tw tz
ua ug um us uy uz
va vc ve vg vi vn vu
wf ws
ye yt
za zm zw
`
  .trim()
  .split(/\s+/)

/** 去掉注释和多余空白，SVG 体积能小一截，语义不变。 */
function minify(svg) {
  return svg
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

await mkdir(OUT, { recursive: true })

// 先清掉旧文件，避免改了列表之后留下孤儿
for (const name of await readdir(OUT).catch(() => [])) {
  if (name.endsWith('.svg')) await rm(join(OUT, name))
}

let written = 0
let bytes = 0
const failed = []

// 并发抓取，但限制在小批次内，别把 CDN 打出限流
const BATCH = 12
for (let index = 0; index < CODES.length; index += BATCH) {
  const batch = CODES.slice(index, index + BATCH)
  await Promise.all(
    batch.map(async (code) => {
      const url = `https://cdn.jsdelivr.net/npm/flag-icons@${VERSION}/flags/4x3/${code}.svg`
      try {
        const response = await fetch(url)
        if (!response.ok) {
          failed.push(`${code} HTTP ${response.status}`)
          return
        }
        const svg = minify(await response.text())
        if (!svg.startsWith('<svg')) {
          failed.push(`${code} 不是 SVG`)
          return
        }
        await writeFile(join(OUT, `${code}.svg`), svg, 'utf8')
        written += 1
        bytes += Buffer.byteLength(svg)
      } catch (error) {
        failed.push(`${code} ${error.message}`)
      }
    }),
  )
  process.stdout.write(`\r抓取 ${Math.min(index + BATCH, CODES.length)}/${CODES.length}`)
}

process.stdout.write('\n')

// 体积要盯着：主题包会带上这些文件
const largest = []
for (const name of await readdir(OUT)) {
  const info = await stat(join(OUT, name))
  largest.push({ name, size: info.size })
}
largest.sort((a, b) => b.size - a.size)

console.log(`\n写入 ${written} 面，共 ${(bytes / 1024).toFixed(1)} KB，平均 ${Math.round(bytes / written)} 字节`)
console.log('最大的 5 个：')
for (const entry of largest.slice(0, 5)) {
  console.log(`  ${entry.name.padEnd(10)} ${(entry.size / 1024).toFixed(1)} KB`)
}

if (failed.length > 0) {
  console.log(`\n失败 ${failed.length} 个：`)
  for (const line of failed) console.log(`  ${line}`)
  process.exit(1)
}
