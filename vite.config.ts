import { readFileSync } from 'node:fs'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import type { ProxyOptions } from 'vite'

/**
 * Go 的 `embed` 会静默跳过以 `_` 开头的文件名，所以像 `_virtual`、
 * `_commonjsHelpers` 这类 chunk 装到服务端后会 404，而本地 `vite preview`
 * 一切正常。这里把前缀去掉。
 */
const stripLeadingUnderscore = (name: string | undefined): string =>
  (name ?? 'chunk').replace(/^_+/, 'x')

/**
 * 把代理请求的 Origin / Referer 改写成目标实例。
 *
 * 服务端在 CORS 开启时会校验 Origin（web/security/cors.go）：
 * `origin != "" && allowOrigin == ""` 直接 403，而 allowOrigin 要靠
 * `OriginMatchesHost(origin, Request.Host)` 或白名单命中。
 *
 * `changeOrigin` 只改 Host 头，浏览器发出的 Origin 仍然是
 * http://localhost:5273 —— 跟实例的 Host 不符、也不在白名单里，
 * 于是开发态下 /api/* 和 /api/rpc2 全部 403。
 *
 * 这里连 Origin 一起改写，OriginMatchesHost 即可通过，不必去实例后台加白名单。
 * 只影响本地开发；主题装到服务端之后是同源请求，不经过这段逻辑。
 */
const rewriteOrigin =
  (target: string): NonNullable<ProxyOptions['configure']> =>
  (proxy) => {
    const origin = new URL(target).origin
    proxy.on('proxyReq', (proxyReq) => {
      proxyReq.setHeader('origin', origin)
      proxyReq.setHeader('referer', `${origin}/`)
    })
    // WebSocket 升级请求走的是另一个事件，同样要改，否则 rpc2 的 ws 连不上。
    proxy.on('proxyReqWs', (proxyReq) => {
      proxyReq.setHeader('origin', origin)
    })
  }

/** short 只有一个来源：manifest。避免和构建配置写成两处后漂移。 */
const readShortName = (): string => {
  const manifest = JSON.parse(readFileSync('komari-theme.json', 'utf8')) as { short?: string }
  if (!manifest.short) throw new Error('komari-theme.json 缺少 short 字段')
  return manifest.short
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_TARGET || 'http://127.0.0.1:25774'
  const short = readShortName()

  /*
   * 资源前缀和页面路径是两件事，服务端对它们的处理完全不同
   * （web/public/public.go）：
   *
   * - 资源走 `/themes/:id/*path`，纯静态查找，命中返回文件，未命中直接 404。
   * - 页面走 noRoute，返回 dist/index.html。请求的是 `/`、`/instance/xxx`
   *   这类站点根下的路径。
   *
   * 所以产物里的资源引用必须带 /themes/{short}/dist/ 前缀，而客户端路由
   * 匹配的是站点根路径，两者不能混。
   */
  const assetBase = `/themes/${short}/dist/`

  return {
    /*
     * 构建产物用绝对前缀，开发态用 `/`。
     *
     * 构建时不能用 './'：相对路径在 /instance/xxx 这种深层路由上会解析成
     * /instance/assets/index-xxx.js，服务端 noRoute 把 index.html 返回给它，
     * 浏览器按 MIME 拒绝执行，整页白屏。
     *
     * 开发态则必须是 `/`：Vite 把入口挂在 base 下，若这里也用
     * /themes/{short}/dist/，浏览器地址栏里的 pathname 就带上了这段前缀，
     * React Router 匹配不到任何路由，直接被 `path="*"` 兜回首页 ——
     * 详情页永远打不开。用 `/` 之后开发态的页面路径和生产完全一致。
     */
    base: command === 'build' ? assetBase : '/',

    plugins: [react(), tailwindcss()],

    build: {
      outDir: 'dist',
      // Komari 靠字符串匹配替换 index.html 里的四个哨兵，
      // 这里绝对不能启用压缩 HTML 的插件，否则匹配失效。
      rollupOptions: {
        output: {
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: (info) => `assets/${stripLeadingUnderscore(info.name)}-[hash].js`,
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },

    server: {
      port: 5273,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          ws: true,
          configure: rewriteOrigin(apiTarget),
        },

        /*
         * `/themes/*` 整段转发给实例：后台的主题设置表单要读 manifest，
         * 开发态不转发就拿不到。
         *
         * 开发态 base 是 `/`，Vite 自己的模块和 @vite/client 都不在这个前缀
         * 下，所以这里不需要再做例外放行。
         */
        '/themes': {
          target: apiTarget,
          changeOrigin: true,
          configure: rewriteOrigin(apiTarget),
        },
      },
    },
  }
})
