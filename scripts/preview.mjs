/**
 * 生成 preview.png（主题市场列表需要）。
 *
 *   node scripts/preview.mjs [--detail] [--style=apple|vercel|classic] [--out=路径]
 *
 * 不传 --style 时用 manifest 的默认风格（与真实服务端补默认值的行为一致）；
 * 不传 --out 时写到仓库根的 preview.png —— 主题市场列表读的就是它。
 *
 * 启动假服务端，用系统里已装的 Chrome / Edge 无头模式截图。不引入
 * Playwright / Puppeteer 这类几百 MB 的依赖。
 *
 * 走 CDP 而不是 `--screenshot` + `--virtual-time-budget`：后者的虚拟时钟会在
 * 数据回来之前就走完预算，拍出来只有导航栏和空白网格。这里等到卡片真的出现
 * 才按快门。
 */

import { access, readFile, writeFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { findBrowser, launch } from './lib/cdp.mjs'
import { ROOT, startMock, waitForApi } from './lib/spawn-mock.mjs'

const argValue = (name) =>
  process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)

const OUT = join(ROOT, argValue('out') ?? 'preview.png')
const STYLE = argValue('style')
const CDP_PORT = 9413

const detail = process.argv.includes('--detail')

async function main() {
  // dist/ 必须先构建好，无头浏览器加载的是打包产物。
  const built = await access(join(ROOT, 'dist', 'index.html')).then(
    () => true,
    () => false,
  )
  if (!built) throw new Error('dist/ 不存在，先跑 npm run build')

  const browserPath = await findBrowser()
  if (!browserPath) throw new Error('没找到 Chrome 或 Edge，无法截图')
  console.log(`  浏览器 ${browserPath}`)

  const mock = await startMock(STYLE ? [`--style=${STYLE}`] : [])
  let session = null
  try {
    await waitForApi(mock.base)
    session = await launch(browserPath, CDP_PORT)
    await session.setViewport(1600, 900)

    const target = detail ? `${mock.base}/instance/a1` : mock.base
    const marker = detail ? 'km-instance-info' : 'km-node-card'
    console.log(`  截图 ${target}`)

    await session.load(target, { waitFor: (html) => html.includes(marker) })
    // 等一拍让进度条的宽度过渡和字体渲染落定
    await new Promise((r) => setTimeout(r, 600))

    await writeFile(OUT, await session.screenshot())

    const info = await stat(OUT)
    const { analysePng, sampleRegion } = await import('./lib/png.mjs')
    const png = analysePng(await readFile(OUT))
    console.log(`  ${OUT} ${png.width}x${png.height}, ${(info.size / 1024).toFixed(1)} kB`)
    console.log(`  全图 颜色数 ${png.colors}，平均亮度 ${png.brightness}，最大单色占比 ${png.dominant}%`)

    /*
     * 按区域检查，而不是只看全图聚合值。浅色主题白底占大半，"只有导航栏、
     * 下面全空"和"内容齐全"的全图平均亮度几乎一模一样，聚合指标没有分辨能力。
     *
     * 三套皮肤的版式不同（经典的汇总条在 y=73，apple 那里还是大标题），所以
     * 不按具体区块取坐标，而是把顶栏以下切成三条横带：任何一条是纯色块，都说明
     * 那一段没渲染出来。左右各留 40px，避开页面两侧的留白。
     */
    const regions = [
      { name: '顶栏', x: 0, y: 0, w: 1600, h: 55 },
      { name: '上部', x: 40, y: 60, w: 1520, h: 240 },
      { name: '中部', x: 40, y: 300, w: 1520, h: 300 },
      { name: '下部', x: 40, y: 600, w: 1520, h: 300 },
    ]

    let empty = 0
    for (const region of regions) {
      const s = sampleRegion(png, region.x, region.y, region.w, region.h)
      console.log(`  ${s.flat ? 'x ' : 'ok'} ${region.name}：颜色数 ${s.colors}，亮度 ${s.brightness}`)
      if (s.flat) empty += 1
    }
    if (empty > 0) throw new Error(`有 ${empty} 个区域是纯色块，页面没渲染完整`)
    console.log('  ok 各区域都有内容')
  } finally {
    if (session) await session.close()
    mock.stop()
  }
}

await main()
