/*
 * 风格样张共用：模拟数据、格式化、状态判定、浮层。（从已删除的机柜版设计稿沿用，顶栏 / 外观部分已无页面使用。）
 *
 * 普通 <script> 而不是 ES module：module 在 file:// 下会被 CORS 拦掉，
 * 设计稿要能双击直接打开。
 *
 * 实时值是「时间的函数」而不是随机数：首页和详情页在同一时刻算出同一个值，
 * 两页来回切换不会对不上。字段形状参照 scripts/mock-server.mjs。
 */
;(function () {
  'use strict'

  const K = 1024
  const M = K * 1024
  const G = M * 1024
  const T = G * 1024
  const DAY = 86400
  const NOW0 = Date.now() / 1000

  const WARN_AT = 75
  const HOT_AT = 90

  const PING_TASKS = [
    { id: 1, name: '电信' },
    { id: 2, name: '联通' },
    { id: 3, name: '移动' },
  ]

  /*
   * 覆盖的边界：常态、CPU 过高（Delta）、磁盘过高（Lima）、配额超限且已过期（Golf）、
   * 两台离线（Charlie / Mike）、临近到期（Delta 2 天、Juliet 7 天）、无 Swap（Echo / Hotel）、
   * 无探测任务（Papa）、region 映射不出国旗（Foxtrot「内网」）、未分组（Hotel / Papa）、
   * 会周期性越过阈值的节点（Oscar），用来演示热力墙闪烁。
   */
  const NODES = [
    {
      uuid: 'a1', name: 'Alpha 香港', region: 'HK', group: 'FreeCloud', tags: ['生产', '边缘'],
      os: 'Debian 12', arch: 'x86_64', virt: 'KVM', cpu_name: 'AMD EPYC 7B13', cores: 4,
      kernel: '6.1.0-25-amd64', mem: 7.76 * G, swap: 2 * G, disk: 79.2 * G,
      base: { cpu: 19, mem: 78, disk: 40.4, swap: 23 }, amp: { cpu: 9, mem: 2.5 },
      net: { up: 1.21 * M, down: 5.59 * M }, total: { up: 114 * G, down: 247 * G },
      limit: 10 * T, limitType: 'sum', expiresIn: 24, price: '4.99 USD', cycle: 30,
      uptime: 12 * DAY + 3 * 3600, ping: { 1: 49, 2: 63, 3: 76 }, proc: 142, conn: 88,
    },
    {
      uuid: 'b2', name: 'Bravo 东京', region: 'JP', group: 'FreeCloud', tags: ['生产'],
      os: 'Ubuntu 24.04', arch: 'x86_64', virt: 'KVM', cpu_name: 'AMD EPYC 9654', cores: 8,
      kernel: '6.8.0-45-generic', mem: 15.6 * G, swap: 2 * G, disk: 158 * G,
      base: { cpu: 45, mem: 56, disk: 32.4, swap: 31 }, amp: { cpu: 11, mem: 3 },
      net: { up: 842 * K, down: 3.81 * M }, total: { up: 111 * G, down: 240 * G },
      limit: 0, expiresIn: null, price: '12 USD', cycle: 30,
      uptime: 12 * DAY, ping: { 1: 46, 2: 76, 3: 72 }, proc: 231, conn: 412,
    },
    {
      uuid: 'c3', name: 'Charlie 洛杉矶', region: 'US', group: 'Oracle', tags: ['备份', '冷存'],
      os: 'Rocky Linux 9', arch: 'x86_64', virt: 'LXC', cpu_name: 'AMD Ryzen 9 5950X', cores: 2,
      kernel: '5.14.0-427.el9', mem: 3.84 * G, swap: 0, disk: 39.2 * G,
      base: { cpu: 6, mem: 31, disk: 33, swap: 0 }, amp: { cpu: 3, mem: 1 },
      net: { up: 12 * K, down: 30 * K }, total: { up: 41 * G, down: 63 * G },
      limit: 2 * T, limitType: 'max', expiresIn: 180, price: '0', cycle: 0,
      uptime: 0, offlineFor: 3 * 3600 + 14 * 60, ping: { 1: 152, 2: 160, 3: 171 }, proc: 0, conn: 0,
    },
    {
      uuid: 'd4', name: 'Delta 法兰克福', region: 'DE', group: 'Oracle', tags: ['边缘'],
      os: 'Alpine 3.20', arch: 'aarch64', virt: 'Docker', cpu_name: 'Ampere Altra', cores: 2,
      kernel: '6.6.41-0-virt', mem: 1.94 * G, swap: 512 * M, disk: 39.2 * G,
      base: { cpu: 92, mem: 51, disk: 53, swap: 16 }, amp: { cpu: 4, mem: 2 },
      net: { up: 3.81 * M, down: 2.72 * M }, total: { up: 112 * G, down: 242 * G },
      limit: 2 * T, limitType: 'sum', expiresIn: 2, price: '3.5 EUR', cycle: 30,
      uptime: 12 * DAY + 1 * 3600, ping: { 1: 50, 2: 65 }, proc: 96, conn: 1204,
    },
    {
      uuid: 'e5', name: 'Echo 新加坡', region: 'SG', group: 'Oracle', tags: [],
      os: 'Debian 13', arch: 'x86_64', virt: 'KVM', cpu_name: 'Intel Xeon E5-2680 v4', cores: 1,
      kernel: '6.12.9-amd64', mem: 492 * M, swap: 0, disk: 19.6 * G,
      base: { cpu: 40, mem: 40, disk: 67, swap: 0 }, amp: { cpu: 8, mem: 2 },
      net: { up: 520 * K, down: 1.1 * M }, total: { up: 98 * G, down: 156 * G },
      limit: 1 * T, limitType: 'sum', expiresIn: 61, price: '2 USD', cycle: 30,
      uptime: 34 * DAY, ping: { 1: 63, 2: 61 }, proc: 64, conn: 37,
    },
    {
      uuid: 'f6', name: 'Golf 圣何塞', region: 'US', group: '华为云', tags: ['测试'],
      os: 'CentOS 7', arch: 'x86_64', virt: 'OpenVZ', cpu_name: 'Intel Xeon E3-1230 v3', cores: 1,
      kernel: '3.10.0-1160.el7', mem: 256 * M, swap: 256 * M, disk: 9.8 * G,
      base: { cpu: 34, mem: 40, disk: 57, swap: 14 }, amp: { cpu: 7, mem: 2 },
      net: { up: 2.16 * M, down: 4.82 * M }, total: { up: 113 * G, down: 244 * G },
      limit: 100 * G, limitType: 'sum', expiresIn: -46, price: '1 USD', cycle: 30,
      uptime: 12 * DAY + 2 * 3600, ping: { 1: 63, 2: 61 }, proc: 41, conn: 22,
    },
    {
      uuid: 'g7', name: 'Foxtrot 首尔', region: '内网', group: 'DGN', tags: ['生产', '高配'],
      os: 'Ubuntu 22.04', arch: 'x86_64', virt: '物理机', cpu_name: 'AMD EPYC 7543', cores: 32,
      kernel: '5.15.0-122-generic', mem: 128 * G, swap: 8 * G, disk: 2 * T,
      base: { cpu: 34, mem: 67, disk: 43, swap: 9 }, amp: { cpu: 10, mem: 3 },
      net: { up: 9.2 * M, down: 14.6 * M }, total: { up: 1.1 * T, down: 2.3 * T },
      limit: 200 * T, limitType: 'sum', expiresIn: null, price: '', cycle: 0,
      uptime: 96 * DAY, ping: { 1: 38, 2: 44, 3: 41 }, proc: 512, conn: 3380,
    },
    {
      uuid: 'h8', name: 'Hotel 台北', region: 'TW', group: '', tags: ['自有'],
      os: 'Debian 12', arch: 'x86_64', virt: 'KVM', cpu_name: 'Intel N100', cores: 4,
      kernel: '6.1.0-25-amd64', mem: 8 * G, swap: 0, disk: 128 * G,
      base: { cpu: 22, mem: 87, disk: 41, swap: 0 }, amp: { cpu: 6, mem: 1.5 },
      net: { up: 1.72 * M, down: 8.66 * M }, total: { up: 117 * G, down: 256 * G },
      limit: 0, expiresIn: null, price: '', cycle: 0,
      uptime: 41 * DAY, ping: { 1: 24, 2: 31 }, proc: 188, conn: 240,
    },
    {
      uuid: 'i9', name: 'India 孟买', region: 'IN', group: '华为云', tags: [],
      os: 'Ubuntu 22.04', arch: 'x86_64', virt: 'KVM', cpu_name: 'Intel Xeon Platinum 8272CL', cores: 2,
      kernel: '5.15.0-122-generic', mem: 3.8 * G, swap: 1 * G, disk: 60 * G,
      base: { cpu: 12, mem: 38, disk: 22, swap: 4 }, amp: { cpu: 5, mem: 1 },
      net: { up: 310 * K, down: 920 * K }, total: { up: 22 * G, down: 51 * G },
      limit: 500 * G, limitType: 'max', expiresIn: 120, price: '5 USD', cycle: 30,
      uptime: 7 * DAY + 5 * 3600, ping: { 1: 182, 2: 205, 3: 166 }, loss: 0.03, proc: 97, conn: 41,
    },
    {
      uuid: 'j10', name: 'Juliet 伦敦', region: 'GB', group: 'FreeCloud', tags: ['生产'],
      os: 'Debian 12', arch: 'x86_64', virt: 'KVM', cpu_name: 'AMD EPYC 7763', cores: 2,
      kernel: '6.1.0-25-amd64', mem: 1.9 * G, swap: 1 * G, disk: 40 * G,
      base: { cpu: 8, mem: 44, disk: 35, swap: 2 }, amp: { cpu: 4, mem: 1 },
      net: { up: 240 * K, down: 610 * K }, total: { up: 31 * G, down: 74 * G },
      limit: 1 * T, limitType: 'sum', expiresIn: 7, price: '3 GBP', cycle: 30,
      uptime: 58 * DAY, ping: { 1: 158, 2: 172 }, proc: 83, conn: 29,
    },
    {
      uuid: 'k11', name: 'Kilo 阿姆斯特丹', region: 'NL', group: 'Oracle', tags: [],
      os: 'Debian 12', arch: 'x86_64', virt: 'KVM', cpu_name: 'Intel Xeon Gold 6148', cores: 1,
      kernel: '6.1.0-25-amd64', mem: 0.95 * G, swap: 512 * M, disk: 20 * G,
      base: { cpu: 3, mem: 29, disk: 18, swap: 1 }, amp: { cpu: 2, mem: 1 },
      net: { up: 18 * K, down: 44 * K }, total: { up: 4.1 * G, down: 9.8 * G },
      limit: 0, expiresIn: 300, price: '0', cycle: 0,
      uptime: 140 * DAY, ping: { 1: 211, 2: 196, 3: 224 }, proc: 52, conn: 8,
    },
    {
      uuid: 'l12', name: 'Lima 悉尼', region: 'AU', group: 'DGN', tags: [],
      os: 'Ubuntu 24.04', arch: 'x86_64', virt: 'KVM', cpu_name: 'AMD EPYC 7J13', cores: 4,
      kernel: '6.8.0-45-generic', mem: 8 * G, swap: 2 * G, disk: 80 * G,
      base: { cpu: 28, mem: 52, disk: 91.3, swap: 6 }, amp: { cpu: 8, mem: 2 },
      net: { up: 760 * K, down: 2.4 * M }, total: { up: 66 * G, down: 133 * G },
      limit: 3 * T, limitType: 'sum', expiresIn: 88, price: '6 AUD', cycle: 30,
      uptime: 22 * DAY, ping: { 1: 132, 2: 141, 3: 150 }, proc: 133, conn: 156,
    },
    {
      uuid: 'm13', name: 'Mike 圣保罗', region: 'BR', group: '华为云', tags: [],
      os: 'Debian 12', arch: 'x86_64', virt: 'KVM', cpu_name: 'Intel Xeon E5-2690 v4', cores: 2,
      kernel: '6.1.0-25-amd64', mem: 2 * G, swap: 1 * G, disk: 40 * G,
      base: { cpu: 10, mem: 35, disk: 28, swap: 3 }, amp: { cpu: 3, mem: 1 },
      net: { up: 50 * K, down: 120 * K }, total: { up: 12 * G, down: 27 * G },
      limit: 1 * T, limitType: 'sum', expiresIn: 45, price: '4 USD', cycle: 30,
      uptime: 0, offlineFor: 26 * 3600 + 8 * 60, ping: { 1: 290, 2: 301 }, proc: 0, conn: 0,
    },
    {
      uuid: 'n14', name: 'November 多伦多', region: 'CA', group: 'DGN', tags: ['备份'],
      os: 'Rocky Linux 9', arch: 'x86_64', virt: 'KVM', cpu_name: 'Intel Xeon E5-2650 v2', cores: 2,
      kernel: '5.14.0-427.el9', mem: 4 * G, swap: 2 * G, disk: 500 * G,
      base: { cpu: 16, mem: 33, disk: 71, swap: 5 }, amp: { cpu: 5, mem: 1 },
      net: { up: 4.4 * M, down: 220 * K }, total: { up: 1.4 * T, down: 88 * G },
      limit: 5 * T, limitType: 'up', expiresIn: 200, price: '7 USD', cycle: 30,
      uptime: 63 * DAY, ping: { 1: 221, 2: 230, 3: 240 }, proc: 104, conn: 19,
    },
    {
      uuid: 'o15', name: 'Oscar 大阪', region: 'JP', group: 'FreeCloud', tags: ['测试'],
      os: 'Ubuntu 24.04', arch: 'x86_64', virt: 'KVM', cpu_name: 'Intel Xeon Platinum 8160', cores: 4,
      kernel: '6.8.0-45-generic', mem: 8 * G, swap: 2 * G, disk: 60 * G,
      base: { cpu: 72, mem: 61, disk: 30, swap: 12 }, amp: { cpu: 0, mem: 2 }, swing: true,
      net: { up: 5.1 * M, down: 6.3 * M }, total: { up: 302 * G, down: 410 * G },
      limit: 4 * T, limitType: 'sum', expiresIn: 75, price: '9 USD', cycle: 30,
      uptime: 3 * DAY + 7 * 3600, ping: { 1: 52, 2: 58, 3: 61 }, proc: 160, conn: 523,
    },
    {
      uuid: 'p16', name: 'Papa 巴黎', region: 'FR', group: '', tags: [],
      os: 'Debian 12', arch: 'x86_64', virt: 'KVM', cpu_name: 'AMD EPYC 7282', cores: 2,
      kernel: '6.1.0-25-amd64', mem: 2 * G, swap: 0, disk: 30 * G,
      base: { cpu: 18, mem: 46, disk: 26, swap: 0 }, amp: { cpu: 6, mem: 1 },
      net: { up: 380 * K, down: 1.3 * M }, total: { up: 40 * G, down: 92 * G },
      limit: 0, expiresIn: 150, price: '3 EUR', cycle: 30,
      uptime: 19 * DAY, ping: {}, proc: 77, conn: 33,
    },
  ]

  for (const n of NODES) {
    n.online = !n.offlineFor
    n.expires = n.expiresIn == null ? null : NOW0 + n.expiresIn * DAY
    n.seed = hash(n.uuid)
  }

  // ---------- 实时值 ----------

  function hash(s) {
    let h = 2166136261
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
    return (h >>> 0) / 4294967295
  }
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

  /** 两条不同周期的正弦叠加，看起来像真实抖动，又是确定性的。 */
  function wob(seed, k, t) {
    const ph = seed * 6.283 + k * 1.7
    return 0.62 * Math.sin(t / (6.5 + k) + ph) + 0.38 * Math.sin(t / (2.1 + k * 0.6) + ph * 2.3)
  }

  function live(n, t = Date.now() / 1000) {
    if (!n.online) {
      return {
        online: false, cpu: null, mem: null, disk: n.base.disk, swap: null,
        up: 0, down: 0, load: [0, 0, 0], ping: {}, loss: {},
        total: n.total, proc: 0, conn: 0, uptime: 0, offlineFor: n.offlineFor + (t - NOW0),
      }
    }
    const s = n.seed
    // Oscar 在 55 ~ 93 之间慢摆，周期约 50 秒，会周期性越过 75 与 90。
    const cpu = n.swing
      ? clamp(74 + 19 * Math.sin(t / 8 + s * 6), 0, 100)
      : clamp(n.base.cpu + n.amp.cpu * wob(s, 0, t), 0.5, 99.5)
    const mem = clamp(n.base.mem + n.amp.mem * wob(s, 1, t), 1, 99.5)
    const swap = n.swap ? clamp(n.base.swap + 1.2 * wob(s, 2, t), 0, 100) : null
    const f = 1 + 0.45 * wob(s, 3, t)
    const g = 1 + 0.45 * wob(s, 4, t)
    const el = t - NOW0
    const ping = {}
    const loss = {}
    for (const id in n.ping) {
      ping[id] = Math.max(1, n.ping[id] * (1 + 0.06 * wob(s, 5 + +id, t)))
      loss[id] = n.loss ? n.loss * (1 + 0.5 * wob(s, 9 + +id, t)) : 0
    }
    const l1 = (n.cores * cpu) / 100
    return {
      online: true, cpu, mem, disk: n.base.disk, swap,
      up: n.net.up * f, down: n.net.down * g,
      load: [l1, l1 * (0.9 + 0.08 * wob(s, 6, t)), l1 * (0.82 + 0.06 * wob(s, 7, t))],
      ping, loss,
      total: { up: n.total.up + n.net.up * el, down: n.total.down + n.net.down * el },
      proc: Math.round(n.proc + 4 * wob(s, 8, t)), conn: Math.round(n.conn * (1 + 0.05 * wob(s, 9, t))),
      uptime: n.uptime + el, offlineFor: 0,
    }
  }

  /** 按 traffic_limit_type 计算配额已用量，与现版 src/lib/format.ts 的 trafficUsed 同义。 */
  function quotaUsed(n, v) {
    const { up, down } = v.total
    switch (n.limitType) {
      case 'max': return Math.max(up, down)
      case 'min': return Math.min(up, down)
      case 'up': return up
      case 'down': return down
      default: return up + down
    }
  }
  const LIMIT_TYPE_TEXT = { sum: '上下行合计', max: '取较大方向', min: '取较小方向', up: '仅上行', down: '仅下行' }

  function quotaPct(n, v) {
    if (!n.limit) return null
    return (quotaUsed(n, v) / n.limit) * 100
  }

  function daysLeft(n) {
    if (n.expires == null) return null
    return Math.round((n.expires - Date.now() / 1000) / DAY)
  }

  // ---------- 状态判定 ----------

  /** 单项占用 → 档位。low / mid 都属于「常态」，只是热力墙上深浅不同。 */
  function level(p) {
    if (p == null) return 'low'
    if (p >= HOT_AT) return 'hot'
    if (p >= WARN_AT) return 'warm'
    if (p >= 50) return 'mid'
    return 'low'
  }
  const barClass = (p) => (p >= HOT_AT ? 'hot' : p >= WARN_AT ? 'warm' : '')
  const textClass = (p) => (p >= HOT_AT ? 't-hot' : p >= WARN_AT ? 't-warm' : '')

  /** 热力墙用的「最热一项」：CPU / 内存 / 磁盘 / 配额取最大。 */
  function hottest(n, v) {
    const items = [
      ['CPU', v.cpu],
      ['内存', v.mem],
      ['磁盘', v.disk],
    ]
    const q = quotaPct(n, v)
    if (q != null) items.push(['配额', q])
    let best = items[0]
    for (const it of items) if ((it[1] ?? -1) > (best[1] ?? -1)) best = it
    return { label: best[0], pct: best[1] }
  }

  /**
   * 节点的问题清单，首页「需要注意」和详情页一句话状态共用。
   * lv：hot = 必须处理，warm = 留意。只有 hot 与临近到期进首页清单，75~90 的只染色不点名。
   */
  function issues(n, v) {
    const out = []
    if (!v.online) {
      out.push({ lv: 'hot', short: `离线 ${fmtDur(v.offlineFor, true)}`, long: `已离线 ${fmtDur(v.offlineFor)}` })
      return out
    }
    const q = quotaPct(n, v)
    if (q != null && q >= HOT_AT) {
      const used = fmtBytes(quotaUsed(n, v)).join(' ')
      const lim = fmtBytes(n.limit).join(' ')
      out.push({
        lv: 'hot',
        short: q >= 100 ? '配额已用完' : `配额 ${Math.round(q)}%`,
        long: q >= 100
          ? `流量配额已用完：已用 ${used}，额度 ${lim}（${LIMIT_TYPE_TEXT[n.limitType]}）`
          : `流量配额即将用完：已用 ${used}，额度 ${lim}`,
      })
    }
    for (const [k, lb, lbz] of [['cpu', 'CPU', 'CPU '], ['mem', '内存', '内存'], ['disk', '磁盘', '磁盘']]) {
      const p = v[k]
      if (p >= HOT_AT) out.push({ lv: 'hot', short: `${lb} ${Math.round(p)}%`, long: `${lbz}占用过高，当前 ${Math.round(p)}%` })
      else if (p >= WARN_AT) out.push({ lv: 'warm', minor: true, short: `${lb} ${Math.round(p)}%`, long: `${lbz}占用偏高，当前 ${Math.round(p)}%` })
    }
    const d = daysLeft(n)
    if (d != null && d < 0) out.push({ lv: 'hot', short: `已过期 ${-d} 天`, long: `服务已过期 ${-d} 天` })
    else if (d != null && d <= 7) out.push({ lv: 'warm', short: `${d} 天后到期`, long: `服务 ${d} 天后到期` })
    return out
  }

  /** 整个节点的档位：卡片顶边、表格行、详情页状态条用。 */
  function nodeLevel(n, v) {
    const list = issues(n, v)
    if (!v.online) return 'off'
    if (list.some((i) => i.lv === 'hot')) return 'hot'
    if (list.length) return 'warm'
    return 'ok'
  }

  // ---------- 格式化 ----------

  /** 返回 [数值, 单位]，单位单独上样式。三位有效数字。 */
  function fmtBytes(b) {
    const units = ['B', 'K', 'M', 'G', 'T', 'P']
    let i = 0
    let v = b
    while (v >= 1000 && i < units.length - 1) {
      v /= 1024
      i++
    }
    const s = v >= 100 || i === 0 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)
    return [s, units[i]]
  }
  const bytesHtml = (b, suffix = '') => {
    const [n, u] = fmtBytes(b)
    return `${n}<span class="unit">${u}${suffix}</span>`
  }
  const bytesText = (b, suffix = '') => fmtBytes(b).join(' ') + suffix

  function fmtDur(s, short) {
    const d = Math.floor(s / DAY)
    const h = Math.floor((s % DAY) / 3600)
    const m = Math.floor((s % 3600) / 60)
    if (d > 0) return short || h === 0 ? `${d} 天` : `${d} 天 ${h} 小时`
    if (h > 0) return short || m === 0 ? `${h} 小时` : `${h} 小时 ${m} 分`
    return `${Math.max(m, 1)} 分钟`
  }

  const pad = (x) => String(x).padStart(2, '0')
  function fmtDate(sec) {
    const d = new Date(sec * 1000)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }
  function fmtClock(sec, withDate) {
    const d = new Date(sec * 1000)
    const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
    return withDate ? `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}` : hm
  }

  function expiryText(n) {
    const d = daysLeft(n)
    if (d == null) return { text: '长期', cls: '' }
    if (d < 0) return { text: `已过期 ${-d} 天`, cls: 't-hot' }
    if (d <= 7) return { text: `${d} 天后`, cls: 't-warm' }
    return { text: fmtDate(n.expires), cls: '' }
  }

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

  /** 两位国家代码走自托管国旗；映射不出来的（运营者自填文字）原样显示。 */
  function flag(region, cls = 'flag') {
    if (/^[A-Z]{2}$/.test(region)) {
      return `<img class="${cls}" src="../../public/flags/${region.toLowerCase()}.svg" alt="${region}" />`
    }
    return `<span class="region-text">${esc(region)}</span>`
  }

  function pingCls(ms, loss) {
    if (loss >= 0.05 || ms >= 300) return 't-hot'
    if (ms >= 150) return 't-warm'
    return ''
  }

  // ---------- 外观 ----------

  const THEME_KEY = 'km-rack-theme'
  function toggleTheme() {
    const dark = document.documentElement.classList.toggle('dark')
    try {
      localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light')
    } catch {}
    document.dispatchEvent(new CustomEvent('themechange'))
    syncThemeIcon()
  }
  function syncThemeIcon() {
    const b = document.querySelector('[data-act="theme"]')
    if (!b) return
    const dark = document.documentElement.classList.contains('dark')
    b.innerHTML = dark ? ICON.sun : ICON.moon
    b.title = dark ? '切换到浅色' : '切换到深色'
    b.setAttribute('aria-label', b.title)
  }

  // ---------- 图标 ----------

  const svg = (d, s = 18) =>
    `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`
  const ICON = {
    grid: svg('<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>', 16),
    table: svg('<path d="M3.5 6h17M3.5 12h17M3.5 18h17"/>', 16),
    globe: svg('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.5 3.8 5.3 3.8 8.5s-1.2 6-3.8 8.5c-2.6-2.5-3.8-5.3-3.8-8.5s1.2-6 3.8-8.5Z"/>'),
    sun: svg('<circle cx="12" cy="12" r="3.8"/><path d="M12 3v1.8M12 19.2V21M3 12h1.8M19.2 12H21M5.6 5.6l1.3 1.3M17.1 17.1l1.3 1.3M5.6 18.4l1.3-1.3M17.1 6.9l1.3-1.3"/>'),
    moon: svg('<path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1Z"/>'),
    admin: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 4v16M12.5 9h4M12.5 12.5h4"/>', 16),
    back: svg('<path d="M14.5 6 8.5 12l6 6"/>', 16),
  }

  /** 品牌标：三条长短不一的 1U 横条，最长的一条是暖色 —— 就是热力墙本身。 */
  const LOGO = `<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
    <rect x="1" y="1" width="24" height="24" rx="6" fill="var(--panel)" stroke="var(--line-2)"/>
    <rect x="6" y="7" width="9" height="3" rx="1" fill="var(--cool)"/>
    <rect x="6" y="11.5" width="14" height="3" rx="1" fill="var(--warm-fill)"/>
    <rect x="6" y="16" width="6" height="3" rx="1" fill="var(--bar)"/>
  </svg>`

  /** 顶栏。首页带视图切换，详情页不带。 */
  function header({ page }) {
    const view =
      page === 'index'
        ? `<div class="seg" role="group" aria-label="视图">
            <button type="button" data-view="grid" aria-pressed="true">${ICON.grid}<span class="lbl">卡片</span></button>
            <button type="button" data-view="table" aria-pressed="false">${ICON.table}<span class="lbl">表格</span></button>
          </div>`
        : ''
    return `<header class="top"><div class="wrap top-in">
      <a class="brand" href="index.html">${LOGO}<span>Komari Mock</span></a>
      <div class="top-stats" aria-live="off">
        <span>在线 <b data-k="online">—</b></span>
        <span>实时 <b data-k="rate">—</b></span>
        <span class="hide-sm">累计 <b data-k="total">—</b></span>
      </div>
      <div class="top-tools">
        ${view}
        <button type="button" class="icon-btn" title="语言：简体中文（设计稿未接入）" aria-label="语言">${ICON.globe}</button>
        <button type="button" class="icon-btn" data-act="theme"></button>
        <a class="btn" href="#" title="已登录时显示；访客显示「登录」">${ICON.admin}<span class="lbl">后台</span></a>
      </div>
    </div></header>`
  }

  function mountHeader(el, opts) {
    el.outerHTML = header(opts)
    document.querySelector('[data-act="theme"]').addEventListener('click', toggleTheme)
    syncThemeIcon()
    updateHeaderStats()
  }

  function updateHeaderStats() {
    const top = document.querySelector('.top')
    if (!top) return
    let on = 0
    let up = 0
    let down = 0
    let tu = 0
    let td = 0
    for (const n of NODES) {
      const v = live(n)
      if (v.online) on++
      up += v.up
      down += v.down
      tu += v.total.up
      td += v.total.down
    }
    top.querySelector('[data-k="online"]').textContent = `${on} / ${NODES.length}`
    top.querySelector('[data-k="rate"]').textContent = `↑ ${bytesText(up, '/s')}  ↓ ${bytesText(down, '/s')}`
    top.querySelector('[data-k="total"]').textContent = `↑ ${bytesText(tu)}  ↓ ${bytesText(td)}`
  }

  // ---------- 浮层 ----------

  let tipEl = null
  const tip = {
    show(html, x, y) {
      if (!tipEl) {
        tipEl = document.createElement('div')
        tipEl.className = 'tip'
        tipEl.setAttribute('role', 'tooltip')
        document.body.appendChild(tipEl)
      }
      tipEl.innerHTML = html
      tipEl.classList.add('on')
      const r = tipEl.getBoundingClientRect()
      let left = x + 14
      let top = y + 14
      if (left + r.width > innerWidth - 8) left = x - r.width - 14
      if (top + r.height > innerHeight - 8) top = y - r.height - 14
      tipEl.style.left = `${Math.max(8, left)}px`
      tipEl.style.top = `${Math.max(8, top)}px`
    },
    hide() {
      tipEl?.classList.remove('on')
    },
  }

  window.RACK = {
    K, M, G, T, DAY, NOW0, WARN_AT, HOT_AT,
    NODES, PING_TASKS, LIMIT_TYPE_TEXT,
    live, quotaUsed, quotaPct, daysLeft, level, barClass, textClass, hottest, issues, nodeLevel,
    fmtBytes, bytesHtml, bytesText, fmtDur, fmtDate, fmtClock, expiryText, esc, flag, pingCls,
    hash, clamp, wob,
    ICON, mountHeader, updateHeaderStats, tip,
  }
})()
