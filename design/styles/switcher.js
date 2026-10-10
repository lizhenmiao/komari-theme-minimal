/*
 * 风格样张底部的切换条：在几种风格之间来回对比用，不属于任何一种风格本身。
 * 刻意做成中性的半透明黑胶囊，免得干扰对样张的观感。
 *
 * 在详情页上切换时停留在同一个节点：带着 ?id= 跳到另一种风格的详情页。
 */
;(function () {
  const file = location.pathname.split('/').pop()
  const onDetail = /-detail\.html$/.test(file)
  const id = new URLSearchParams(location.search).get('id')
  const q = id ? `?id=${encodeURIComponent(id)}` : ''
  const PAGES = onDetail
    ? [
        ['vercel-detail.html' + q, 'Vercel / Linear', 'vercel-detail.html'],
        ['apple-detail.html' + q, 'Apple', 'apple-detail.html'],
      ]
    : [
        ['vercel.html', 'Vercel / Linear', 'vercel.html'],
        ['apple.html', 'Apple', 'apple.html'],
      ]
  const bar = document.createElement('nav')
  bar.setAttribute('aria-label', '风格切换')
  bar.innerHTML = PAGES.map(
    ([href, label, match]) => `<a href="${href}"${match === file ? ' aria-current="page"' : ''}>${label}</a>`,
  ).join('')
  const css = document.createElement('style')
  css.textContent = `
    nav[aria-label="风格切换"] {
      position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 999;
      display: flex; gap: 2px; padding: 4px; border-radius: 999px;
      background: rgb(20 20 20 / 0.82); backdrop-filter: blur(12px);
      box-shadow: 0 8px 30px rgb(0 0 0 / 0.35), inset 0 0 0 1px rgb(255 255 255 / 0.08);
      font: 500 13px/1 system-ui, -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif;
      max-width: calc(100vw - 24px); overflow-x: auto;
    }
    nav[aria-label="风格切换"] a {
      padding: 9px 14px; border-radius: 999px; color: rgb(255 255 255 / 0.66);
      text-decoration: none; white-space: nowrap;
    }
    nav[aria-label="风格切换"] a:hover { color: #fff; }
    nav[aria-label="风格切换"] a[aria-current] { background: #fff; color: #111; }
    @media print { nav[aria-label="风格切换"] { display: none; } }
  `
  document.head.appendChild(css)
  document.body.appendChild(bar)
})()
