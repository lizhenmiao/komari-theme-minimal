/**
 * 零依赖的假 Komari 服务端，供本地开发和冒烟测试用。
 *
 *   node scripts/mock-server.mjs [端口]        默认 4928，传 0 由系统分配
 *   node scripts/mock-server.mjs --no-rpc2     强制走 REST + /api/clients
 *   node scripts/mock-server.mjs --no-metrics  强制走 getRecords 历史路径
 *
 * 提供构建产物 dist/，以及足够跑通每条数据路径的接口：
 *
 *   WS/POST /api/rpc2   JSON-RPC 2.0：rpc.methods、common:getNodes、
 *                       common:getNodesLatestStatus、common:getPublicInfo、
 *                       common:getRecords、public:queryMetrics、
 *                       public:getPingMetricStats、public:getPublicPingTasks
 *   WS      /api/clients   嵌套结构的降级路径（发 get 指令）
 *   GET     /api/public | /api/nodes | /api/task/ping | /api/records/load
 *   SPA fallback，让客户端路由能落地
 */

import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const noRpc2 = args.includes('--no-rpc2')
const noMetrics = args.includes('--no-metrics')
/** 切成未登录访客，用来验证后台入口被隐藏。 */
const guestMode = args.includes('--guest')
const port = Number(args.find((a) => /^\d+$/.test(a)) ?? 4928)
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const DIST = join(ROOT, 'dist')

const GB = 1024 ** 3
const MB = 1024 ** 2
const TB = 1024 ** 4

/* ------------------------------------------------------------------ */
/* 假数据                                                              */
/* ------------------------------------------------------------------ */

/**
 * 刻意跨越 MB 到 TB 量级，并覆盖每一种哨兵值。
 *
 * 两处刻意做成和数组顺序无关：
 *
 * - `weight` 取 0-6 且顺序打乱。真实实例的 weight 是后台拖拽按下标赋的
 *   （0 开始递增），而且服务端对节点不排序。取值打乱之后，期望顺序既不是
 *   数组顺序也不是它的反序 —— 比较器方向写反会立刻被断言抓到。
 * - `region` 三种形式都有：国旗 emoji（真实实例就是这个）、两位国家代码、
 *   运营者自填的任意文字。三条渲染分支都要有覆盖。
 */
const NODES = [
  mkNode({
    uuid: 'a1', name: 'Alpha 香港', region: '🇭🇰', tags: '生产;边缘', group: 'FreeCloud',
    os: 'Debian 12', arch: 'x86_64', virt: 'KVM', cpu: 'AMD EPYC 7B13',
    cores: 4, mem: 7.76 * GB, swap: 2 * GB, disk: 79.2 * GB,
    limit: 10 * TB, limitType: 'sum', price: 5, expired: '2026-11-03T00:00:00+08:00',
    weight: 3,
  }),
  mkNode({
    uuid: 'b2', name: 'Bravo 东京', region: 'JP', tags: '生产', group: 'FreeCloud',
    os: 'Ubuntu 24.04', arch: 'x86_64', virt: 'KVM',
    cpu: 'Intel Xeon Platinum 8375C', cores: 8, mem: 15.6 * GB, swap: 2 * GB,
    disk: 158 * GB, limit: 0, limitType: 'sum', price: 24, expired: null,
    weight: 0,
  }),
  mkNode({
    uuid: 'c3', name: 'Charlie 洛杉矶', region: '🇺🇸', tags: '备份;冷存', group: 'Oracle',
    os: 'Rocky Linux 9', arch: 'x86_64', virt: 'LXC', cpu: 'AMD Ryzen 9 5950X',
    cores: 2, mem: 3.84 * GB, swap: 0, disk: 39.2 * GB,
    limit: 2 * TB, limitType: 'max', price: -1, expired: '2026-09-12T00:00:00+08:00',
    weight: 5, offline: true,
  }),
  mkNode({
    uuid: 'd4', name: 'Delta 法兰克福', region: 'DE', tags: '边缘', group: 'Oracle',
    os: 'Alpine 3.20', arch: 'aarch64', virt: 'Docker', cpu: 'Ampere Altra',
    cores: 2, mem: 1.94 * GB, swap: 512 * MB, disk: 39.2 * GB,
    limit: 2 * TB, limitType: 'sum', price: 3.5, currency: 'EUR',
    expired: '2026-09-04T00:00:00+08:00', weight: 1,
  }),
  mkNode({
    uuid: 'e5', name: 'Echo 新加坡', region: '🇸🇬', tags: '', group: 'Oracle',
    os: 'Debian 13', arch: 'x86_64', virt: 'KVM', cpu: 'Intel Xeon E5-2680 v4',
    cores: 1, mem: 492 * MB, swap: 0, disk: 19.6 * GB,
    limit: 1 * TB, limitType: 'down', price: 0, expired: '2030-08-19T00:00:00+08:00',
    weight: 6,
  }),
  mkNode({
    uuid: 'f6', name: 'Golf 圣何塞', region: 'US', tags: '测试', group: '华为云',
    os: 'CentOS 7', arch: 'x86_64', virt: 'OpenVZ', cpu: 'Intel Xeon E3-1230 v3',
    cores: 1, mem: 256 * MB, swap: 256 * MB, disk: 9.8 * GB,
    limit: 100 * GB, limitType: 'sum', price: 2,
    // 已经过期：用来测过期药丸。
    expired: '2026-07-18T00:00:00+08:00', weight: 2,
  }),
  mkNode({
    // region 是运营者自填的文字，映射不出国家代码，必须退回文本显示。
    // 单节点分组：真实实例上有三个这样的组，芯片计数要显示 1
    uuid: 'g7', name: 'Foxtrot 首尔', region: '内网', tags: '生产;高配', group: 'DGN',
    os: 'Ubuntu 22.04', arch: 'x86_64', virt: 'none',
    cpu: 'AMD Ryzen 9 7950X3D', cores: 32, mem: 128 * GB, swap: 8 * GB,
    disk: 2 * TB, limit: 200 * TB, limitType: 'sum', price: 180,
    expired: '2026-09-01T00:00:00+08:00', weight: 4, gpu: 'NVIDIA RTX 4090',
  }),
  mkNode({
    /*
     * 后台选「长期」时写入的哨兵日期。真实实例上实测是 2225-12-11，
     * 服务端按「超过当前时间 100 年」判定（utils/renewal/renewal.go:48-52），
     * 所以这里用同一个值。少了这个节点，长期分支就完全没有检查覆盖，
     * 页面会把它显示成 12/11/2225 和「剩 72785 天」而没人发现。
     */
    /*
     * 名称和 tag 都刻意不含「长期」二字：否则页面上出现这个词有两个可能来源，
     * 「到期显示为长期」这条断言会被名称或 tag 满足，测不到真正的逻辑。
     *
     * group 留空：验证部分节点未分组时，芯片的计数只算有分组的那些。
     */
    uuid: 'h8', name: 'Hotel 台北', region: 'TW', tags: '自有',
    os: 'Debian 12', arch: 'x86_64', virt: 'KVM', cpu: 'Intel N100',
    cores: 4, mem: 8 * GB, swap: 0, disk: 128 * GB,
    limit: 0, limitType: 'sum', price: 99,
    expired: '2225-12-11T00:00:00Z', weight: 7,
  }),
]

function mkNode(o) {
  return {
    uuid: o.uuid,
    name: o.name,
    tags: o.tags,
    region: o.region,
    // 空串是「未分组」，运营者可以只给部分节点分组。
    group: o.group ?? '',
    os: o.os,
    arch: o.arch,
    virtualization: o.virt,
    kernel_version: '6.8.0-45-generic',
    cpu_name: o.cpu,
    cpu_cores: o.cores,
    // 0 表示未知，UI 必须隐藏而不是把 0 打出来。
    cpu_physical_cores: o.cores > 4 ? o.cores / 2 : 0,
    // 字符串 "None" 是「无 GPU」的哨兵值。
    gpu_name: o.gpu ?? 'None',
    mem_total: Math.round(o.mem),
    swap_total: Math.round(o.swap),
    disk_total: Math.round(o.disk),
    weight: o.weight,
    price: o.price,
    currency: o.currency ?? 'USD',
    billing_cycle: 30,
    auto_renewal: true,
    expired_at: o.expired,
    traffic_limit: Math.round(o.limit),
    traffic_limit_type: o.limitType,
    hidden: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: new Date().toISOString(),
    _offline: Boolean(o.offline),
  }
}

/**
 * 探测任务。`clients` 是适用节点的 uuid 列表，运营者可以只给部分节点配探测。
 *
 * h8 刻意不出现在任何任务里：没有这个样本，「未配置探测的节点不显示药丸」
 * 这条分支就没有检查覆盖，而它正是过滤逻辑缺失时会出问题的形态。
 */
const PING_CLIENTS = ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7']

const PING_TASKS = [
  { id: 1, name: '电信', interval: 60, type: 'icmp', clients: PING_CLIENTS },
  { id: 2, name: '联通', interval: 60, type: 'icmp', clients: PING_CLIENTS },
  // 移动只配了一部分节点，用来验证逐任务过滤而不是「有没有配探测」的一刀切
  { id: 3, name: '移动', interval: 60, type: 'icmp', clients: ['a1', 'b2', 'c3'] },
]

const THEME_SETTINGS = {
  defaultView: 'grid',
  refreshInterval: 2,
  showDisk: true,
  showLoad: true,
  showSparkline: true,
  showTraffic: true,
  showExpiry: true,
  showPrice: true,
  showPing: true,
  // Stored as a JSON string, as the managed form does.
  featuredPingTasks: '[1,2,3]',
  historyHours: 4,
  maxPoints: 500,
  featuredNodes: '[]',
  footerHtml: '<p>Mock deployment</p>',
}
/* ------------------------------------------------------------------ */
/* 合成指标                                                            */
/* ------------------------------------------------------------------ */

/** 按 (uuid, seed) 确定性生成，让数值平滑变化而不是乱跳。 */
function wobble(uuid, seed, base, amplitude, t = Date.now() / 1000) {
  let h = 0
  for (let i = 0; i < uuid.length; i += 1) h = (h * 31 + uuid.charCodeAt(i)) % 1000
  const phase = (h + seed * 97) / 40
  const slow = Math.sin(t / 60 + phase)
  const fast = Math.sin(t / 11 + phase * 2)
  return Math.max(0, base + (slow * 0.65 + fast * 0.35) * amplitude)
}

function statusFor(node, at = Date.now()) {
  const t = at / 1000
  const offline = node._offline
  const cpu = offline ? 0 : Math.min(wobble(node.uuid, 1, 42, 34, t), 100)
  const ramPct = offline ? 0 : Math.min(wobble(node.uuid, 2, 58, 30, t), 99)
  const diskPct = Math.min(wobble(node.uuid, 3, 46, 22, t), 99)
  const swapPct = node.swap_total > 0 && !offline ? Math.min(wobble(node.uuid, 4, 18, 14, t), 99) : 0
  // 累计计数器只能单调递增。
  const elapsed = Math.max(0, at / 1000 - 1_760_000_000)
  return {
    client: node.uuid,
    time: new Date(at).toISOString(),
    online: !offline,
    cpu,
    gpu: node.gpu_name === 'None' ? 0 : wobble(node.uuid, 9, 30, 25, t),
    ram: Math.round((ramPct / 100) * node.mem_total),
    ram_total: node.mem_total,
    swap: Math.round((swapPct / 100) * node.swap_total),
    swap_total: node.swap_total,
    disk: Math.round((diskPct / 100) * node.disk_total),
    disk_total: node.disk_total,
    load: offline ? 0 : wobble(node.uuid, 5, node.cpu_cores * 0.4, node.cpu_cores * 0.35, t),
    load5: offline ? 0 : wobble(node.uuid, 6, node.cpu_cores * 0.38, node.cpu_cores * 0.3, t),
    load15: offline ? 0 : wobble(node.uuid, 7, node.cpu_cores * 0.34, node.cpu_cores * 0.25, t),
    temp: offline ? 0 : wobble(node.uuid, 8, 48, 12, t),
    net_in: offline ? 0 : Math.round(wobble(node.uuid, 10, 4.2e7, 4e7, t)),
    net_out: offline ? 0 : Math.round(wobble(node.uuid, 11, 1.8e7, 1.6e7, t)),
    net_total_up: Math.round(elapsed * 4200 + node.weight * 1e9),
    net_total_down: Math.round(elapsed * 9100 + node.weight * 2.4e9),
    process: offline ? 0 : Math.round(wobble(node.uuid, 12, 180, 90, t)),
    connections: offline ? 0 : Math.round(wobble(node.uuid, 13, 620, 400, t)),
    connections_udp: offline ? 0 : Math.round(wobble(node.uuid, 14, 40, 30, t)),
    uptime: offline ? 0 : Math.round(3600 * 24 * 12 + node.weight * 3600),
    message: '',
  }
}

/** `/api/clients` 降级路径用的嵌套结构。 */
function nestedFor(node) {
  const s = statusFor(node)
  return {
    cpu: { usage: s.cpu },
    gpu: { count: node.gpu_name === 'None' ? 0 : 1, average_usage: s.gpu },
    ram: { total: s.ram_total, used: s.ram },
    swap: { total: s.swap_total, used: s.swap },
    disk: { total: s.disk_total, used: s.disk },
    load: { load1: s.load, load5: s.load5, load15: s.load15 },
    network: {
      up: s.net_out,
      down: s.net_in,
      totalUp: s.net_total_up,
      totalDown: s.net_total_down,
    },
    connections: { tcp: s.connections, udp: s.connections_udp },
    temp: s.temp,
    process: s.process,
    uptime: s.uptime,
    message: '',
    updated_at: s.time,
  }
}

/**
 * 指标仓库里的键名。带点的命名空间形式，和状态记录的字段名是两套。
 * 取自真实实例的 public:listMetricDefinitions。
 */
const METRIC_DEFS = [
  { name: 'cpu.usage', type: 'gauge', unit: '%' },
  { name: 'memory.used', type: 'gauge', unit: 'bytes' },
  { name: 'swap.used', type: 'gauge', unit: 'bytes' },
  { name: 'disk.used', type: 'gauge', unit: 'bytes' },
  { name: 'load.average', type: 'gauge', unit: '' },
  { name: 'net.in.rate', type: 'gauge', unit: 'bytes/s' },
  { name: 'net.out.rate', type: 'gauge', unit: 'bytes/s' },
  { name: 'net.total.up', type: 'counter', unit: 'bytes' },
  { name: 'net.total.down', type: 'counter', unit: 'bytes' },
  { name: 'process.count', type: 'gauge', unit: 'count' },
  { name: 'connections.tcp', type: 'gauge', unit: 'count' },
  { name: 'ping.latency_ms', type: 'gauge', unit: 'ms' },
  { name: 'ping.loss', type: 'gauge', unit: 'ratio' },
].map((d) => ({ ...d, description: d.name, retention_days: 31 }))

/** 指标键 -> 从一条状态快照里取值。用量类给的是字节，不是百分比。 */
const METRIC_VALUE = {
  'cpu.usage': (s) => s.cpu,
  'memory.used': (s) => s.ram,
  'swap.used': (s) => s.swap,
  'disk.used': (s) => s.disk,
  'load.average': (s) => s.load,
  'net.in.rate': (s) => s.net_in,
  'net.out.rate': (s) => s.net_out,
  'net.total.up': (s) => s.net_total_up,
  'net.total.down': (s) => s.net_total_down,
  'process.count': (s) => s.process,
  'connections.tcp': (s) => s.connections,
}

/**
 * queryMetrics 的返回：每个「实体 × 指标」一条序列，点是 {time,value,count}。
 *
 * 不是扁平的记录数组。假服务端一旦在这里编一个更方便的形状，客户端就会照着
 * 它写，然后在真实实例上一条曲线都画不出来。
 */
function metricSeries(uuids, metricKeys, hours, maxPoints) {
  const points = Math.min(maxPoints, Math.max(30, Math.round(hours * 30)))
  const stepMs = (hours * 3600 * 1000) / points
  const end = Date.now()
  const series = []

  const push = (key, uuid, list) => {
    const def = METRIC_DEFS.find((d) => d.name === key)
    series.push({
      metric_key: key,
      entity_id: uuid,
      type: def?.type ?? 'gauge',
      unit: def?.unit ?? '',
      retention_days: 31,
      downsampled: true,
      downsample_algorithm: 'avg',
      max_points: maxPoints,
      interval_seconds: stepMs / 1000,
      count: list.length,
      points: list,
    })
  }

  for (const uuid of uuids) {
    const node = NODES.find((n) => n.uuid === uuid)
    if (!node) continue
    for (const key of metricKeys) {
      /*
       * ping 的两个指标按探测任务拆成多条序列，靠点上的 task_id 标签区分。
       * 其余指标一个实体一条。
       */
      if (key === 'ping.latency_ms' || key === 'ping.loss') {
        for (const task of PING_TASKS) {
          const raw = pingPoints(uuid, task.id, hours, maxPoints)
          const list =
            key === 'ping.loss'
              ? raw.map((p) => ({ ...p, value: p.value < 0 ? 1 : 0 }))
              : raw
          push(key, uuid, list)
        }
        continue
      }
      const read = METRIC_VALUE[key]
      if (!read) continue
      const list = []
      for (let i = points; i >= 0; i -= 1) {
        const at = end - i * stepMs
        list.push({
          time: new Date(at).toISOString(),
          value: read(statusFor(node, at)),
          count: 1,
        })
      }
      push(key, uuid, list)
    }
  }

  return {
    count: series.length,
    default_points: 500,
    start: new Date(end - hours * 3600 * 1000).toISOString(),
    end: new Date(end).toISOString(),
    server_downsample_default: true,
    series,
  }
}

/** 以 StatusRecord 形式给出的历史，供 getRecords 降级路径用。 */
function statusHistory(uuid, hours, maxPoints) {
  const node = NODES.find((n) => n.uuid === uuid)
  if (!node) return []
  const points = Math.min(maxPoints, Math.max(30, Math.round(hours * 30)))
  const stepMs = (hours * 3600 * 1000) / points
  const end = Date.now()
  const out = []
  for (let i = points; i >= 0; i -= 1) {
    const at = end - i * stepMs
    const s = statusFor(node, at)
    out.push({
      client: uuid,
      time: new Date(at).toISOString(),
      cpu: s.cpu,
      gpu: s.gpu,
      ram: s.ram,
      ram_total: s.ram_total,
      swap: s.swap,
      swap_total: s.swap_total,
      disk: s.disk,
      disk_total: s.disk_total,
      load: s.load,
      temp: s.temp,
      net_in: s.net_in,
      net_out: s.net_out,
      net_total_up: s.net_total_up,
      net_total_down: s.net_total_down,
      process: s.process,
      connections: s.connections,
      connections_udp: s.connections_udp,
    })
  }
  return out
}

/**
 * ping 采样。大约每 17 个点造一次丢失 —— 图表的断口渲染要靠这个才能测。
 *
 * 返回带 `task_id` 标签的点，形状和 queryMetrics 的序列点一致：服务端把
 * 延迟存成 `ping.latency_ms`，多个探测任务靠标签区分，而且**标签值是字符串**
 * （见 web/rpc/jsonrpc/public.metric.go 的 `point.Tags["task_id"]`）。
 */
function pingPoints(uuid, taskId, hours, maxPoints) {
  const node = NODES.find((n) => n.uuid === uuid)
  if (!node) return []
  const points = Math.min(maxPoints, Math.max(20, Math.round(hours * 20)))
  const stepMs = (hours * 3600 * 1000) / points
  const end = Date.now()
  const out = []
  for (let i = points; i >= 0; i -= 1) {
    const at = end - i * stepMs
    const lost = node._offline || (i + taskId) % 17 === 0
    out.push({
      time: new Date(at).toISOString(),
      // -1 标记探测丢失，不是负延迟。
      value: lost ? -1 : Math.round(wobble(uuid, 20 + taskId, 40 + taskId * 12, 14, at / 1000)),
      count: 1,
      tags: { task_id: String(taskId) },
    })
  }
  return out
}

/** getPingMetricStats 的聚合统计。不是时间序列。 */
function pingStats(uuids, taskIds, hours, maxPoints) {
  const stats = []
  for (const uuid of uuids) {
    const node = NODES.find((n) => n.uuid === uuid)
    if (!node) continue
    for (const taskId of taskIds) {
      const task = PING_TASKS.find((t) => t.id === taskId)
      const points = pingPoints(uuid, taskId, hours, maxPoints)
      const good = points.filter((p) => p.value >= 0).map((p) => p.value)
      const sorted = [...good].sort((a, b) => a - b)
      const quantile = (q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : undefined)
      const avg = good.length ? good.reduce((a, b) => a + b, 0) / good.length : undefined
      stats.push({
        entity_id: uuid,
        // 真实实例这里是字符串
        task_id: String(taskId),
        name: task?.name ?? `task-${taskId}`,
        type: task?.type ?? 'icmp',
        interval: task?.interval ?? 60,
        total: points.length,
        valid: good.length,
        loss: points.length ? (points.length - good.length) / points.length : 0,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        avg,
        latest: good[good.length - 1],
        p50: quantile(0.5),
        p99: quantile(0.99),
        p99_p50_ratio: 1,
      })
    }
  }
  return {
    start: new Date(Date.now() - hours * 3600 * 1000).toISOString(),
    end: new Date().toISOString(),
    interval_seconds: (hours * 3600) / Math.max(1, Math.min(maxPoints, 20)),
    stats,
    count: stats.length,
  }
}
/* ------------------------------------------------------------------ */
/* JSON-RPC                                                            */
/* ------------------------------------------------------------------ */

const RPC_METHODS = [
  'rpc.methods',
  'common:getNodes',
  'common:getNodesLatestStatus',
  'common:getPublicInfo',
  'common:getRecords',
  'public:getPublicPingTasks',
  'public:getPingMetricStats',
  'public:getMe',
  ...(noMetrics ? [] : ['public:queryMetrics', 'public:listMetricDefinitions']),
]

function publicNodes() {
  // 内部的 `_offline` 标记不能离开服务端。
  return NODES.map(({ _offline, ...rest }) => rest)
}

function handleRpc(method, params = {}) {
  switch (method) {
    case 'rpc.methods':
      return RPC_METHODS
    /*
     * 这两个方法返回的是**以 uuid 为键的字典**，不是数组。
     * 见 web/rpc/jsonrpc/common.go 的 getNodes：
     *   「返回以 uuid 为键的字典（每个 value 自身也包含 uuid 字段）」
     *
     * 注意和 REST 的 /api/nodes 不一样，那个信封里的 data 是数组。若这里照
     * REST 返数组，客户端的 Array.isArray 判断会在假服务端恒真、在真实实例
     * 恒假 —— 真机上一个节点都出不来，而各层检查全绿。
     */
    case 'common:getNodes':
      return Object.fromEntries(publicNodes().map((node) => [node.uuid, node]))
    case 'common:getNodesLatestStatus':
      return Object.fromEntries(NODES.map((node) => [node.uuid, statusFor(node)]))
    case 'common:getPublicInfo':
      return publicInfo()
    /*
     * 即便指定了 uuid 也要包一层信封 —— 真实实例就是这样返的：
     * `{ count, records: { [uuid]: [...] }, from, to }`。直接返数组的话，
     * 客户端的信封剥离逻辑就没有任何一层检查覆盖得到。
     */
    case 'common:getRecords': {
      const hours = Number(params.hours ?? 4)
      const max = Number(params.maxCount ?? 4000)
      const uuids = params.uuid ? [String(params.uuid)] : NODES.map((n) => n.uuid)
      const records = {}
      let count = 0
      for (const uuid of uuids) {
        const list = statusHistory(uuid, hours, max)
        records[uuid] = list
        count += list.length
      }
      return {
        count,
        records,
        from: new Date(Date.now() - hours * 3600 * 1000).toISOString(),
        to: new Date().toISOString(),
      }
    }
    case 'public:listMetricDefinitions':
      return METRIC_DEFS
    case 'public:queryMetrics': {
      if (noMetrics) throw new Error('queryMetrics disabled')
      const ids = Array.isArray(params.entity_ids) && params.entity_ids.length
        ? params.entity_ids
        : NODES.map((n) => n.uuid)
      const requested = Array.isArray(params.metric_keys) ? params.metric_keys.map(String) : []
      /*
       * 键名不认就报错，和真实实例一致（`unknown metric key: cpu`）。
       * 静默返空会把「键名写错」伪装成「这段时间没数据」，客户端拿不到任何
       * 信号；不管传什么键都给数据的话，键名全写错也不会有检查发现。
       */
      const known = new Set(METRIC_DEFS.map((d) => d.name))
      const unknown = requested.filter((key) => !known.has(key))
      if (unknown.length > 0) {
        const error = new Error(`unknown metric key: ${unknown[0]}`)
        error.code = -32602
        throw error
      }
      const keys = requested.length > 0 ? requested : METRIC_DEFS.map((d) => d.name)
      const hours = Number(params.hours ?? 4)
      const max = Number(params.max_points ?? 500)
      return metricSeries(ids.map(String), keys, hours, max)
    }
    case 'public:getMe':
      return viewer()
    case 'public:getPublicPingTasks':
      return PING_TASKS
    /*
     * 返回的是**聚合统计**（min/max/avg/latest/p50/p99/loss），不是时间序列。
     * 见 web/rpc/jsonrpc/public.metric.go 的 publicPingMetricTaskStats。
     * 延迟曲线要走 queryMetrics 的 ping.latency_ms，按 task_id 标签拆分。
     */
    case 'public:getPingMetricStats': {
      const ids = Array.isArray(params.entity_ids) && params.entity_ids.length
        ? params.entity_ids
        : NODES.map((n) => n.uuid)
      const tasks = Array.isArray(params.task_ids) && params.task_ids.length
        ? params.task_ids
        : PING_TASKS.map((t) => t.id)
      const hours = Number(params.hours ?? 4)
      const max = Number(params.max_points ?? 500)
      return pingStats(ids.map(String), tasks.map(Number), hours, max)
    }
    default: {
      const error = new Error(`unknown method ${method}`)
      error.code = -32601
      throw error
    }
  }
}

function publicInfo() {
  return {
    sitename: 'Komari Mock',
    description: 'A simple server monitor tool.',
    allow_cors: false,
    private_site: false,
    theme: 'minimal',
    theme_settings: THEME_SETTINGS,
  }
}

/**
 * 当前访客。默认已登录，这样后台入口这条分支才有检查覆盖；
 * 传 --guest 切成未登录，用来验证入口确实被隐藏。
 *
 * 真实服务端未登录时返回 `{ username: 'Guest', logged_in: false }` 而不是 401
 * （web/rpc/jsonrpc/public.go 的 publicGetMe），这里照做。
 */
function viewer() {
  if (guestMode) return { username: 'Guest', logged_in: false }
  return {
    username: 'admin',
    logged_in: true,
    uuid: '00000000-0000-0000-0000-000000000001',
    sso_type: '',
    sso_id: '',
    '2fa_enabled': false,
  }
}

/* ------------------------------------------------------------------ */
/* 极简 WebSocket 服务端（RFC 6455，只支持文本帧）                       */
/* ------------------------------------------------------------------ */

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

function acceptKey(key) {
  return createHash('sha1').update(key + WS_GUID).digest('base64')
}

/** 只支持文本，不分片、无扩展。对这个协议够用。 */
function encodeFrame(text) {
  const payload = Buffer.from(text, 'utf8')
  const length = payload.length
  let header
  if (length < 126) {
    header = Buffer.from([0x81, length])
  } else if (length < 65536) {
    header = Buffer.alloc(4)
    header[0] = 0x81
    header[1] = 126
    header.writeUInt16BE(length, 2)
  } else {
    header = Buffer.alloc(10)
    header[0] = 0x81
    header[1] = 127
    header.writeBigUInt64BE(BigInt(length), 2)
  }
  return Buffer.concat([header, payload])
}

/** 返回 `buffer` 里解出来的文本帧，以及尚未消费的尾部。 */
function decodeFrames(buffer) {
  const messages = []
  let offset = 0
  while (offset + 2 <= buffer.length) {
    const first = buffer[offset]
    const second = buffer[offset + 1]
    const opcode = first & 0x0f
    const masked = (second & 0x80) !== 0
    let length = second & 0x7f
    let cursor = offset + 2

    if (length === 126) {
      if (cursor + 2 > buffer.length) break
      length = buffer.readUInt16BE(cursor)
      cursor += 2
    } else if (length === 127) {
      if (cursor + 8 > buffer.length) break
      length = Number(buffer.readBigUInt64BE(cursor))
      cursor += 8
    }

    let mask
    if (masked) {
      if (cursor + 4 > buffer.length) break
      mask = buffer.subarray(cursor, cursor + 4)
      cursor += 4
    }
    if (cursor + length > buffer.length) break

    const payload = Buffer.from(buffer.subarray(cursor, cursor + length))
    if (mask) {
      for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4]
    }
    offset = cursor + length

    if (opcode === 0x8) {
      messages.push({ close: true })
    } else if (opcode === 0x1) {
      messages.push({ text: payload.toString('utf8') })
    }
    // 忽略 ping/pong 和二进制帧；这个协议不会发它们。
  }
  return { messages, rest: buffer.subarray(offset) }
}
/* ------------------------------------------------------------------ */
/* HTTP 与 upgrade                                                     */
/* ------------------------------------------------------------------ */

/** 从 manifest 读，和 vite.config.ts 的 base 保持同一个来源。 */
const THEME_SHORT = JSON.parse(
  await readFile(join(ROOT, 'komari-theme.json'), 'utf8'),
).short

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
}

function sendJson(res, data, status = 200) {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

/** REST 响应统一套 {status, message, data} 信封。 */
function sendEnvelope(res, data) {
  sendJson(res, { status: 'success', message: '', data })
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  const path = url.pathname

  if (path === '/api/rpc2' && req.method === 'POST') {
    if (noRpc2) {
      res.writeHead(404).end('rpc2 disabled')
      return
    }
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    let payload
    try {
      payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch {
      sendJson(res, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } })
      return
    }
    try {
      sendJson(res, { jsonrpc: '2.0', id: payload.id, result: handleRpc(payload.method, payload.params) })
    } catch (error) {
      sendJson(res, {
        jsonrpc: '2.0',
        id: payload.id,
        error: { code: error.code ?? -32603, message: error.message },
      })
    }
    return
  }

  if (path === '/api/public') return sendEnvelope(res, publicInfo())
  if (path === '/api/nodes') return sendEnvelope(res, publicNodes())
  if (path === '/api/task/ping') return sendEnvelope(res, PING_TASKS)
  if (path === '/api/me') return sendEnvelope(res, viewer())

  if (path === '/api/records/load') {
    const uuid = url.searchParams.get('uuid') ?? NODES[0].uuid
    const hours = Number(url.searchParams.get('hours') ?? 4)
    return sendEnvelope(res, statusHistory(uuid, hours, 500))
  }

  if (path.startsWith('/api/recent/')) {
    const uuid = path.slice('/api/recent/'.length)
    const node = NODES.find((n) => n.uuid === uuid)
    if (!node) return sendJson(res, { status: 'error', message: 'not found', data: null }, 404)
    return sendEnvelope(res, nestedFor(node))
  }

  if (path.startsWith('/api/')) {
    return sendJson(res, { status: 'error', message: `no mock for ${path}`, data: null }, 404)
  }

  /*
   * 静态资源。真实服务端把 /themes/{short}/ 映射到主题包解压根，所以
   * dist/assets/x.js 的公开地址是 /themes/minimal/dist/assets/x.js。
   * 这里必须照做，否则测不出 base 配错导致的深层路由白屏。
   */
  const THEME_PREFIX = `/themes/${THEME_SHORT}/dist/`

  const sendFile = async (relative) => {
    const candidate = normalize(join(DIST, relative))
    if (!candidate.startsWith(DIST)) {
      res.writeHead(403).end('forbidden')
      return true
    }
    try {
      const info = await stat(candidate)
      if (!info.isFile()) return false
      const body = await readFile(candidate)
      res.writeHead(200, {
        'Content-Type': MIME[extname(candidate)] ?? 'application/octet-stream',
      })
      res.end(body)
      return true
    } catch {
      return false
    }
  }

  /*
   * /themes/:id/*path 是纯静态查找：命中返回文件，未命中 404。
   *
   * 绝不能在这里回退到 index.html —— 真实服务端（web/public/public.go 的
   * /themes/:id/*path 路由）就是直接 404。一旦加了 fallback，
   * /themes/minimal/dist/instance/a1 会在假服务端出页面、在真实实例上 404，
   * 等于把 bug 藏进测试替身里。
   */
  if (path.startsWith(THEME_PREFIX)) {
    if (await sendFile(path.slice(THEME_PREFIX.length))) return
    res.writeHead(404).end('not found')
    return
  }

  /*
   * 其余路径走 noRoute：先在 dist/ 下按原路径找文件，找不到就返回
   * index.html。页面 URL 因此始终在站点根下（/、/instance/xxx），
   * 只有资源 URL 带 /themes/{short}/dist/ 前缀。
   */
  if (path !== '/' && (await sendFile(path.replace(/^\/+/, '')))) return

  try {
    const html = await readFile(join(DIST, 'index.html'))
    res.writeHead(200, { 'Content-Type': MIME['.html'] })
    res.end(html)
  } catch {
    res.writeHead(500).end('dist/index.html missing — run `npm run build` first')
  }
})

server.on('upgrade', (req, socket) => {
  const path = (req.url ?? '').split('?')[0]
  const key = req.headers['sec-websocket-key']

  const isRpc = path === '/api/rpc2' && !noRpc2
  const isClients = path === '/api/clients'
  if (!key || (!isRpc && !isClients)) {
    socket.destroy()
    return
  }

  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`,
  )

  let buffer = Buffer.alloc(0)
  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk])
    const { messages, rest } = decodeFrames(buffer)
    buffer = rest

    for (const message of messages) {
      if (message.close) {
        socket.end()
        return
      }
      const text = message.text ?? ''

      if (isClients) {
        // 裸文本协议：收到 "get" 就回一帧。没有请求 ID。
        if (text.trim() !== 'get') continue
        const data = {}
        for (const node of NODES) data[node.uuid] = nestedFor(node)
        socket.write(
          encodeFrame(
            JSON.stringify({
              status: 'success',
              // 这里在线状态和载荷是分开的。
              data: { online: NODES.filter((n) => !n._offline).map((n) => n.uuid), data },
            }),
          ),
        )
        continue
      }

      let payload
      try {
        payload = JSON.parse(text)
      } catch {
        continue
      }
      try {
        socket.write(
          encodeFrame(
            JSON.stringify({
              jsonrpc: '2.0',
              id: payload.id,
              result: handleRpc(payload.method, payload.params),
            }),
          ),
        )
      } catch (error) {
        socket.write(
          encodeFrame(
            JSON.stringify({
              jsonrpc: '2.0',
              id: payload.id,
              error: { code: error.code ?? -32603, message: error.message },
            }),
          ),
        )
      }
    }
  })

  socket.on('error', () => socket.destroy())
})

// 端口传 0 让系统分配空闲端口，避免并行跑测试时互相撞。下面会用机器可读的
// 形式把实际端口打出来。
server.listen(port, () => {
  const actual = server.address().port
  console.log(`mock komari  http://127.0.0.1:${actual}`)
  console.log(`  rpc2        ${noRpc2 ? 'DISABLED (REST + /api/clients path)' : 'enabled'}`)
  console.log(`  queryMetrics ${noMetrics ? 'DISABLED (getRecords path)' : 'enabled'}`)
  console.log(`  nodes       ${NODES.length} (1 offline, 1 expired)`)
  console.log(`MOCK_PORT=${actual}`)
})
