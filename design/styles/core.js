/*
 * 风格样张共用逻辑：历史数据、SVG 图表引擎、详情页图表定义、首页表格。
 *
 * 两种风格（Vercel / Apple）只在视觉层不同，数据和图表逻辑完全共用 ——
 * 这也是将来落地 src/ 时的结构：一套逻辑，两套皮肤。
 *
 * 颜色一律走页面定义的 CSS 变量，本文件不写任何色值：
 *   --ch-grid  网格线        --ch-axis  坐标文字      --ch-main  主序列
 *   --ch-alt   次序列(Swap)  --ch-s1/s2/s3  网络、延迟的区分色
 *   --ch-warm  越过 75%      --ch-hot   越过 90%      --ch-bg    圆点描边底色
 *   --ch-cross 十字准线      --ch-hatch 离线斜纹      --ch-track 斜纹底
 *
 * 依赖同目录 data.js 提供的 window.RACK。
 */
;(function () {
  'use strict'
  const R = window.RACK
  const { esc } = R

  const RANGES = [
    ['1h', '1 小时', 1, 120],
    ['4h', '4 小时', 4, 240],
    ['24h', '24 小时', 24, 288],
    ['7d', '7 天', 168, 336],
    ['30d', '30 天', 720, 360],
  ]

  const tasksOf = (n) => Object.keys(n.ping).map((k) => R.PING_TASKS.find((t) => t.id === +k))

  // ---------- 历史数据：时间的确定性函数，切区间不会每次都变样 ----------
  function history(n, key) {
    const [, , hours, count] = RANGES.find((r) => r[0] === key)
    const tasks = tasksOf(n)
    const now = Date.now() / 1000
    const step = (hours * 3600) / (count - 1)
    const offAt = n.online ? Infinity : now - (n.offlineFor + (now - R.NOW0))
    const rnd = (k, b) => {
      const x = Math.sin(n.seed * 9301 + k * 49297 + b * 0.618) * 43758.5453
      return x - Math.floor(x)
    }
    const out = { key, ts: [], cpu: [], mem: [], swap: [], disk: [], up: [], down: [], load: [], ping: {}, lossAt: {} }
    for (const t of tasks) {
      out.ping[t.id] = []
      out.lossAt[t.id] = []
    }
    const TAU = Math.PI * 2
    for (let i = 0; i < count; i++) {
      const t = now - (count - 1 - i) * step
      const b = Math.floor(t / step)
      out.ts.push(t)
      if (t > offAt) {
        for (const k of ['cpu', 'mem', 'swap', 'disk', 'up', 'down', 'load']) out[k].push(null)
        for (const tk of tasks) out.ping[tk.id].push(null)
        continue
      }
      const day = Math.sin((TAU * t) / 86400 + n.seed * 6)
      const hr = Math.sin((TAU * t) / 6100 + n.seed * 11)
      const noise = (k) => rnd(k, b) * 2 - 1
      let cpu = n.swing
        ? 72 + 16 * Math.sin((TAU * t) / 2700 + n.seed * 6) + 4 * noise(1)
        : n.base.cpu + n.amp.cpu * (0.7 * day + 0.5 * hr + 0.45 * noise(1))
      if (rnd(2, b) > 0.985) cpu += 25
      cpu = R.clamp(cpu, 0.5, 99.8)
      out.cpu.push(cpu)
      out.mem.push(R.clamp(n.base.mem + n.amp.mem * (day + 0.5 * noise(3)), 1, 99.5))
      out.swap.push(n.swap ? R.clamp(n.base.swap + 2 * day + 0.6 * noise(4), 0, 100) : null)
      out.disk.push(R.clamp(n.base.disk - (3 * (now - t)) / (30 * 86400) + 0.15 * noise(5), 0, 100))
      const burst = rnd(6, b) > 0.97 ? 2.6 : 1
      out.up.push(Math.max(0, n.net.up * (1 + 0.45 * day + 0.35 * noise(7)) * burst))
      out.down.push(Math.max(0, n.net.down * (1 + 0.5 * day + 0.35 * noise(8)) * burst))
      out.load.push(Math.max(0, ((n.cores * cpu) / 100) * (1 + 0.05 * noise(9))))
      tasks.forEach((tk, j) => {
        if (rnd(20 + j, b) < (n.loss || 0.004) * 1.4) {
          out.ping[tk.id].push(null)
          out.lossAt[tk.id].push(i)
        } else {
          out.ping[tk.id].push(n.ping[tk.id] * (1 + 0.05 * day + 0.07 * noise(40 + j)) * (rnd(30 + j, b) > 0.98 ? 1.6 : 1))
        }
      })
    }
    const v = R.live(n)
    if (v.online) {
      const L = count - 1
      out.cpu[L] = v.cpu
      out.mem[L] = v.mem
      if (n.swap) out.swap[L] = v.swap
    }
    out.offFrom = n.online ? -1 : out.ts.findIndex((t) => t > offAt)
    return out
  }

  // ---------- SVG 图表 ----------
  function niceStep(raw) {
    if (!(raw > 0)) return 0.25
    const p = Math.pow(10, Math.floor(Math.log10(raw)))
    for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raw) return m * p
    return 10 * p
  }
  function niceMax(v, kind) {
    if (kind !== 'bytes') return niceStep(v / 4) * 4
    let unit = 1
    while (v / unit >= 1000) unit *= 1024
    return niceStep(v / unit / 4) * 4 * unit
  }
  const fmtAxis = {
    pct: (v) => String(Math.round(v)),
    bytes: (v) => (v === 0 ? '0' : R.fmtBytes(v).join('').replace(/\.0+(?=\D)/, '')),
    load: (v) => (v >= 10 ? v.toFixed(0) : v.toFixed(1)),
    ms: (v) => String(Math.round(v)),
  }
  const fmtVal = {
    pct: (v) => `${v.toFixed(1)}%`,
    bytes: (v) => R.bytesText(v, 'B/s'),
    load: (v) => v.toFixed(2),
    ms: (v) => `${Math.round(v)} ms`,
  }
  function pathOf(vals, x, y) {
    let d = ''
    let pen = false
    vals.forEach((v, i) => {
      if (v == null) return (pen = false)
      d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)
      pen = true
    })
    return d
  }
  function areaOf(vals, x, y, base) {
    let d = ''
    let start = -1
    const close = (end) => (d += `L${x(end).toFixed(1)} ${base}L${x(start).toFixed(1)} ${base}Z`)
    vals.forEach((v, i) => {
      if (v == null) {
        if (start >= 0) close(i - 1)
        start = -1
        return
      }
      d += (start < 0 ? 'M' : 'L') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)
      if (start < 0) start = i
    })
    if (start >= 0) close(vals.length - 1)
    return d
  }

  let uid = 0
  /**
   * 画一张图到 el。opts：height、stroke（线宽）、grid（'h' 只画横线）、area（面积起始不透明度）。
   * 占用类序列越过阈值的部分用 clipPath 分三段着色；离线区间铺斜纹；丢包在底边画短刻。
   */
  function chart(el, cfg, data, opts = {}) {
    const H = opts.height || 168
    const PAD = { l: 40, r: 10, t: 8, b: 22 }
    const W = Math.max(240, el.clientWidth)
    const pw = W - PAD.l - PAD.r
    const ph = H - PAD.t - PAD.b
    const N = data.ts.length
    const x = (i) => PAD.l + (i / (N - 1)) * pw
    let max = 100
    if (cfg.kind !== 'pct') {
      let m = 0
      for (const s of cfg.series) for (const v of s.values) if (v != null && v > m) m = v
      if (cfg.ref) m = Math.max(m, cfg.ref.v * 1.15)
      max = niceMax(m * 1.05, cfg.kind)
    }
    const y = (v) => PAD.t + (1 - Math.min(v, max) / max) * ph
    const ticks = cfg.kind === 'pct' ? [0, 25, 50, 75, 100] : [0, 0.25, 0.5, 0.75, 1].map((f) => f * max)
    const id = 'ch' + ++uid
    const base = PAD.t + ph
    const sw = opts.stroke || 1.6
    const P = []

    P.push(`<defs>${cfg.series
      .map((s, si) =>
        s.area
          ? `<linearGradient id="${id}-g${si}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${s.color};stop-opacity:${opts.area ?? 0.22}"/><stop offset="1" style="stop-color:${s.color};stop-opacity:0"/></linearGradient>`
          : '',
      )
      .join('')}
      <pattern id="${id}-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" style="fill:var(--ch-track)"/><rect width="2.5" height="6" style="fill:var(--ch-hatch)"/></pattern>
      ${cfg.thr
        ? `<clipPath id="${id}-hot"><rect x="0" y="0" width="${W}" height="${y(cfg.thr.hot)}"/></clipPath>
           <clipPath id="${id}-warm"><rect x="0" y="${y(cfg.thr.hot)}" width="${W}" height="${y(cfg.thr.warm) - y(cfg.thr.hot)}"/></clipPath>
           <clipPath id="${id}-ok"><rect x="0" y="${y(cfg.thr.warm)}" width="${W}" height="${H}"/></clipPath>`
        : ''}</defs>`)

    for (const tv of ticks) {
      P.push(`<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(tv)}" y2="${y(tv)}" style="stroke:var(--ch-grid)"/>`)
      P.push(`<text x="${PAD.l - 8}" y="${y(tv) + 3.5}" text-anchor="end">${fmtAxis[cfg.kind](tv)}</text>`)
    }
    if (cfg.thr) {
      P.push(`<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(cfg.thr.warm)}" y2="${y(cfg.thr.warm)}" style="stroke:var(--ch-warm)" stroke-opacity=".55" stroke-dasharray="3 4"/>`)
      if (cfg.thr.hot < max) P.push(`<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(cfg.thr.hot)}" y2="${y(cfg.thr.hot)}" style="stroke:var(--ch-hot)" stroke-opacity=".55" stroke-dasharray="3 4"/>`)
    }
    if (cfg.ref) P.push(`<text x="${W - PAD.r}" y="${y(cfg.ref.v) - 6}" text-anchor="end" style="fill:var(--ch-warm)">${esc(cfg.ref.label)}</text>`)

    const longSpan = data.key === '7d' || data.key === '30d'
    const nt = W < 460 ? 3 : 5
    for (let k = 0; k < nt; k++) {
      const i = Math.round((k / (nt - 1)) * (N - 1))
      const d = new Date(data.ts[i] * 1000)
      const label = longSpan ? `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')}` : R.fmtClock(data.ts[i])
      P.push(`<text x="${x(i)}" y="${H - 5}" text-anchor="${k === 0 ? 'start' : k === nt - 1 ? 'end' : 'middle'}">${label}</text>`)
    }
    if (data.offFrom >= 0) {
      const x0 = x(Math.max(0, data.offFrom - 1))
      P.push(`<rect x="${x0}" y="${PAD.t}" width="${W - PAD.r - x0}" height="${ph}" fill="url(#${id}-hatch)" rx="4"/>`)
      if (W - PAD.r - x0 > 50) P.push(`<text x="${(x0 + W - PAD.r) / 2}" y="${PAD.t + ph / 2 + 4}" text-anchor="middle" style="fill:var(--ch-hot);font-size:12px;font-weight:600">离线</text>`)
    }
    cfg.series.forEach((s, si) => {
      const d = pathOf(s.values, x, y)
      if (s.area) P.push(`<path d="${areaOf(s.values, x, y, base)}" fill="url(#${id}-g${si})"/>`)
      const common = `d="${d}" fill="none" stroke-width="${s.dash ? sw * 0.75 : sw}" stroke-linejoin="round" stroke-linecap="round" ${s.dash ? 'stroke-dasharray="4 3"' : ''}`
      if (s.thr && cfg.thr) {
        P.push(`<path ${common} style="stroke:${s.color}" clip-path="url(#${id}-ok)"/>`)
        P.push(`<path ${common} style="stroke:var(--ch-warm)" clip-path="url(#${id}-warm)"/>`)
        P.push(`<path ${common} style="stroke:var(--ch-hot)" clip-path="url(#${id}-hot)"/>`)
      } else P.push(`<path ${common} style="stroke:${s.color}"/>`)
    })
    if (cfg.lossAt) for (const arr of Object.values(cfg.lossAt)) for (const i of arr) P.push(`<rect x="${x(i) - 1}" y="${base - 6}" width="2" height="6" rx="1" style="fill:var(--ch-hot)"/>`)
    P.push(`<g class="xh"></g><rect class="hit" x="${PAD.l}" y="${PAD.t}" width="${pw}" height="${ph}" fill="transparent"/>`)

    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${esc(cfg.title)}历史曲线">${P.join('')}</svg>`

    const svgEl = el.firstChild
    const xh = svgEl.querySelector('.xh')
    svgEl.querySelector('.hit').addEventListener('pointermove', (e) => {
      const r = svgEl.getBoundingClientRect()
      const i = R.clamp(Math.round(((((e.clientX - r.left) / r.width) * W - PAD.l) / pw) * (N - 1)), 0, N - 1)
      const xi = x(i)
      let g = `<line x1="${xi}" x2="${xi}" y1="${PAD.t}" y2="${base}" style="stroke:var(--ch-cross)" stroke-dasharray="2 2"/>`
      const rows = cfg.series.map((s) => {
        const v = s.values[i]
        if (v != null) {
          const c = s.thr && cfg.thr ? (v >= cfg.thr.hot ? 'var(--ch-hot)' : v >= cfg.thr.warm ? 'var(--ch-warm)' : s.color) : s.color
          g += `<circle cx="${xi}" cy="${y(v)}" r="4" style="fill:var(--ch-bg);stroke:${c}" stroke-width="2"/>`
        }
        return `<div class="row"><i style="background:${s.color}"></i><span>${esc(s.name)}</span><b>${v == null ? (data.offFrom >= 0 && i >= data.offFrom ? '离线' : '丢包') : fmtVal[cfg.kind](v)}</b></div>`
      })
      xh.innerHTML = g
      R.tip.show(`<div class="tt">${R.fmtClock(data.ts[i], data.key !== '1h' && data.key !== '4h')}</div>${rows.join('')}`, e.clientX, e.clientY)
    })
    svgEl.querySelector('.hit').addEventListener('pointerleave', () => {
      xh.innerHTML = ''
      R.tip.hide()
    })
  }

  // ---------- 详情页的六张图 ----------
  function stats(vals) {
    let peak = -Infinity
    let sum = 0
    let c = 0
    for (const v of vals)
      if (v != null) {
        if (v > peak) peak = v
        sum += v
        c++
      }
    return c ? { peak, avg: sum / c } : null
  }
  const lvCls = (p) => (p >= R.HOT_AT ? 'hot' : p >= R.WARN_AT ? 'warm' : '')

  /** 返回图表定义。stat 是 [标签, 值, 档位类] 的数组，由页面自己排版。 */
  function charts(n, h) {
    const tasks = tasksOf(n)
    const pctStat = (vals) => {
      const s = stats(vals)
      return s ? [['峰值', Math.round(s.peak) + '%', lvCls(s.peak)], ['均值', Math.round(s.avg) + '%', lvCls(s.avg)]] : []
    }
    const thr = { warm: R.WARN_AT, hot: R.HOT_AT }
    const list = [
      { title: 'CPU', kind: 'pct', thr, series: [{ name: 'CPU', color: 'var(--ch-main)', values: h.cpu, thr: true, area: true }], stat: pctStat(h.cpu) },
      {
        title: n.swap ? '内存与 Swap' : '内存', kind: 'pct', thr,
        keys: n.swap ? [['内存', 'var(--ch-main)'], ['Swap', 'var(--ch-alt)']] : null,
        series: [
          { name: '内存', color: 'var(--ch-main)', values: h.mem, thr: true, area: true },
          ...(n.swap ? [{ name: 'Swap', color: 'var(--ch-alt)', values: h.swap, dash: true }] : []),
        ],
        stat: pctStat(h.mem),
      },
      { title: '磁盘', kind: 'pct', thr, series: [{ name: '磁盘', color: 'var(--ch-main)', values: h.disk, thr: true, area: true }], stat: pctStat(h.disk) },
      {
        title: '平均负载', kind: 'load', thr: { warm: n.cores, hot: n.cores * 2 }, ref: { v: n.cores, label: `${n.cores} 核` },
        series: [{ name: '1 分钟', color: 'var(--ch-main)', values: h.load, thr: true, area: true }],
        stat: (() => {
          const s = stats(h.load)
          return s ? [['峰值', s.peak.toFixed(2), s.peak >= n.cores ? 'warm' : ''], ['均值', s.avg.toFixed(2), '']] : []
        })(),
      },
      {
        title: '网络', kind: 'bytes', wide: true,
        keys: [['下行', 'var(--ch-s1)'], ['上行', 'var(--ch-s2)']],
        series: [
          { name: '下行', color: 'var(--ch-s1)', values: h.down, area: true },
          { name: '上行', color: 'var(--ch-s2)', values: h.up },
        ],
        stat: (() => {
          const d = stats(h.down)
          const u = stats(h.up)
          return d ? [['下行峰值', R.bytesText(d.peak, 'B/s'), ''], ['上行峰值', R.bytesText(u.peak, 'B/s'), '']] : []
        })(),
      },
    ]
    if (tasks.length) {
      let lost = 0
      let all = 0
      for (const t of tasks) {
        lost += h.lossAt[t.id].length
        all += h.ping[t.id].length
      }
      const S = ['var(--ch-s1)', 'var(--ch-s2)', 'var(--ch-s3)']
      list.push({
        title: '延迟', kind: 'ms', wide: true,
        keys: tasks.map((t, i) => [t.name, S[i]]),
        series: tasks.map((t, i) => ({ name: t.name, color: S[i], values: h.ping[t.id] })),
        lossAt: h.lossAt,
        stat: [['丢包', ((lost / all) * 100).toFixed(1) + '%', lost / all >= 0.05 ? 'hot' : lost ? 'warm' : '']],
        note: '曲线断开处是丢包，底边红色短刻标出位置。',
      })
    } else {
      list.push({ title: '延迟', wide: true, empty: '这台节点没有配置延迟探测。在后台的延迟监测里添加任务后，这里会显示各条线路的延迟和丢包。' })
    }
    return list
  }

  /** 一句话状态：没问题就说没问题，有问题按严重程度点名。返回 { lv, html }。 */
  function verdict(n, v) {
    const list = R.issues(n, v)
    const lv = R.nodeLevel(n, v)
    if (!v.online)
      return { lv, title: list[0].long, body: `最后一次上报在 ${R.fmtClock(Date.now() / 1000 - v.offlineFor, true)}。下面的曲线在离线之后断开。` }
    if (!list.length) return { lv, title: '运行正常', body: '各项占用都低于 75%，没有临近到期。' }
    const sorted = [...list].sort((a, b) => (a.lv === b.lv ? 0 : a.lv === 'hot' ? -1 : 1))
    return { lv, title: sorted[0].long, body: sorted.slice(1).map((i) => i.long + '。').join('') }
  }

  // ---------- 首页表格视图（两种风格共用结构，样式各自写） ----------
  function table(list, vals, detailPage) {
    const pct = (p) => (p == null ? '—' : Math.round(p) + '%')
    const meter = (p) =>
      `<div class="t-m"><b class="${lvCls(p)}">${pct(p)}</b><span class="t-bar"><i class="${lvCls(p)}" style="width:${Math.min(100, p ?? 0)}%"></i></span></div>`
    const rows = list
      .map((n) => {
        const v = vals.get(n.uuid)
        const issues = R.issues(n, v).filter((i) => !i.minor)
        const state = !v.online
          ? `<span class="t-state off"><i></i>离线 ${R.fmtDur(v.offlineFor, true)}</span>`
          : issues.length
            ? `<span class="t-state ${issues[0].lv}"><i></i>${esc(issues[0].short)}</span>`
            : `<span class="t-state"><i></i>${R.fmtDur(v.uptime, true)}</span>`
        const ids = Object.keys(n.ping)
        const ping = !ids.length
          ? '<span class="t-faint">未配置</span>'
          : !v.online
            ? '—'
            : ids
                .map((k) => {
                  const c = R.pingCls(v.ping[k], v.loss[k])
                  return `<span class="${c === 't-hot' ? 'hot' : c === 't-warm' ? 'warm' : ''}">${Math.round(v.ping[k])}</span>`
                })
                .join(' / ')
        const q = R.quotaPct(n, v)
        const ex = R.expiryText(n)
        return `<tr data-href="${detailPage}?id=${n.uuid}" tabindex="0">
          <td><div class="t-who">${R.flag(n.region)}<div><b>${esc(n.name)}</b><span>${esc(n.os)}，${n.cores} 核</span></div></div></td>
          <td>${state}</td>
          <td>${meter(v.cpu)}</td><td>${meter(v.mem)}</td><td>${meter(v.disk)}</td>
          <td class="r">${v.online ? `↓ ${R.bytesText(v.down, 'B/s')}<br><span class="t-faint">↑ ${R.bytesText(v.up, 'B/s')}</span>` : '—'}</td>
          <td class="r">↓ ${R.bytesText(v.total.down, 'B')}<br><span class="t-faint">↑ ${R.bytesText(v.total.up, 'B')}</span></td>
          <td class="r">${q == null ? '<span class="t-faint">不限</span>' : `<b class="${lvCls(q)}">${Math.round(q)}%</b>`}</td>
          <td class="r">${ping}${v.online && ids.length ? ' <span class="t-faint">ms</span>' : ''}</td>
          <td class="r ${ex.cls === 't-hot' ? 'hot' : ex.cls === 't-warm' ? 'warm' : ''}">${ex.text}</td>
        </tr>`
      })
      .join('')
    return `<table class="t"><thead><tr>
      <th>节点</th><th>状态</th><th>CPU</th><th>内存</th><th>磁盘</th>
      <th class="r">网速</th><th class="r">累计流量</th><th class="r">配额</th><th class="r">延迟</th><th class="r">到期</th>
      </tr></thead><tbody>${rows}</tbody></table>`
  }
  /** 表格行可点击、可回车进入详情。 */
  function bindTable(root) {
    root.addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-href]')
      if (tr) location.href = tr.dataset.href
    })
    root.addEventListener('keydown', (e) => {
      const tr = e.target.closest('tr[data-href]')
      if (tr && e.key === 'Enter') location.href = tr.dataset.href
    })
  }

  window.CORE = { RANGES, tasksOf, history, chart, charts, verdict, table, bindTable, lvCls }
})()
