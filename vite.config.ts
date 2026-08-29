import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Go's `embed` silently skips files whose names start with `_`, so any emitted
 * chunk named `_virtual`, `_commonjsHelpers`, etc. would 404 once the theme is
 * installed — while working fine in local `vite preview`. Strip the prefix.
 */
const stripLeadingUnderscore = (name: string | undefined): string =>
  (name ?? 'chunk').replace(/^_+/, 'x')

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_TARGET || 'http://127.0.0.1:25774'

  return {
    // Themes are served from /themes/{short}/dist/, never from the domain root.
    base: './',

    plugins: [react(), tailwindcss()],

    build: {
      outDir: 'dist',
      // Komari replaces four literal sentinels in index.html by string match.
      // Never enable an HTML-minifying plugin here or those matches break.
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
        '/api': { target: apiTarget, changeOrigin: true, ws: true },
        // Lets the local dev server answer the manifest request the admin
        // settings form makes, so theme config can be exercised without a build.
        '/themes': { target: apiTarget, changeOrigin: true },
      },
    },
  }
})
