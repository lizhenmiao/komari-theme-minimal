/**
 * 生成 preview.png（主题市场列表需要）。
 *
 *   node scripts/preview.mjs [--detail]
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

const OUT = join(ROOT, 'preview.png')
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

  const mock = await startMock()
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
    console.log(`  preview.png ${png.width}x${png.height}, ${(info.size / 1024).toFixed(1)} kB`)
    console.log(`  全图 颜色数 ${png.colors}，平均亮度 ${png.brightness}，最大单色占比 ${png.dominant}%`)

    /*
     * 按区域检查，而不是只看全图聚合值。浅色主题白底占大半，"只有导航栏、
     * 下面全空"和"内容齐全"的全图平均亮度几乎一模一样，聚合指标没有分辨能力。
     *
     * 坐标对着 1600x900 视口下的实测几何取：顶栏 55px、汇总条 y=73 高 76、
     * 卡片网格从 y=163 起、单卡 371x427、行距 438。取值时避开区块边界，
     * 免得把相邻的空白也框进来。
     */
    const regions = [
      { name: '顶栏', x: 0, y: 0, w: 1600, h: 55 },
      { name: '汇总条', x: 40, y: 73, w: 1520, h: 76 },
      { name: '第一张卡', x: 40, y: 163, w: 371, h: 427 },
      { name: '第二行卡片', x: 40, y: 601, w: 371, h: 299 },
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
