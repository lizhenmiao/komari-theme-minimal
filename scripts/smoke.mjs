/**
 * 冒烟测试：启动假服务端，把主题用到的每条数据路径都跑一遍，再用独立实现的
 * 纯逻辑（单位格式化、流量规则、结构归一）去核对真实响应，以此发现契约漂移。
 *
 *   node scripts/smoke.mjs
 *
 * 任何一项失败即以非零码退出，这样 `npm test` 在 CI 里才有意义。
 */

import { createHash, randomBytes } from 'node:crypto'
import { connect } from 'node:net'

import { startMock, waitForApi } from './lib/spawn-mock.mjs'

/** 假服务端启动时由系统分配。 */
let PORT = 0
let BASE = ''

let failures = 0
let checks = 0

function check(label, condition, detail = '') {
  checks += 1
  if (condition) {
    console.log(`  ok   ${label}`)
  } else {
    failures += 1
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

function section(title) {
  console.log(`\n${title}`)
}

async function rpc(method, params) {
  const res = await fetch(`${BASE}/api/rpc2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const body = await res.json()
  if (body.error) throw new Error(`${method}: ${body.error.message}`)
  return body.result
}

/** 极简 WebSocket 客户端：握手、发一帧文本、收一帧。 */
function wsRoundTrip(path, message) {
  return new Promise((resolve, reject) => {
    const key = randomBytes(16).toString('base64')
    const socket = connect(PORT, '127.0.0.1', () => {
      socket.write(
        `GET ${path} HTTP/1.1\r\nHost: 127.0.0.1:${PORT}\r\nUpgrade: websocket\r\n` +
          `Connection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`,
      )
    })

    const expected = createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64')

    let handshakeDone = false
    let buffer = Buffer.alloc(0)
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error(`${path} timed out`))
    }, 10_000)

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk])

      if (!handshakeDone) {
        const end = buffer.indexOf('\r\n\r\n')
        if (end === -1) return
        const head = buffer.subarray(0, end).toString('utf8')
        if (!head.includes(expected)) {
          clearTimeout(timer)
          socket.destroy()
          reject(new Error(`${path} bad handshake`))
          return
        }
        handshakeDone = true
        buffer = buffer.subarray(end + 4)
        // 客户端帧必须掩码。
        const payload = Buffer.from(message, 'utf8')
        const mask = randomBytes(4)
        const masked = Buffer.from(payload)
        for (let i = 0; i < masked.length; i += 1) masked[i] ^= mask[i % 4]
        socket.write(Buffer.concat([Buffer.from([0x81, 0x80 | payload.length]), mask, masked]))
      }

      if (buffer.length < 2) return
      const second = buffer[1]
      let length = second & 0x7f
      let cursor = 2
      if (length === 126) {
        if (buffer.length < 4) return
        length = buffer.readUInt16BE(2)
        cursor = 4
      } else if (length === 127) {
        if (buffer.length < 10) return
        length = Number(buffer.readBigUInt64BE(2))
        cursor = 10
      }
      if (buffer.length < cursor + length) return

      const text = buffer.subarray(cursor, cursor + length).toString('utf8')
      clearTimeout(timer)
      socket.destroy()
      resolve(text)
    })

    socket.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}
/* ------------------------------------------------------------------ */
/* 独立实现一份 src/lib 的纯逻辑，用真实响应来核对                       */
/* ------------------------------------------------------------------ */

function formatBytes(n, short = false) {
  if (!Number.isFinite(n) || n <= 0) return short ? '0' : '0 B'
  const units = short ? ['B', 'K', 'M', 'G', 'T', 'P'] : ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1)
  const value = n / 1024 ** i
  const digits = i === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2
  return short ? `${value.toFixed(digits)}${units[i]}` : `${value.toFixed(digits)} ${units[i]}`
}

function trafficUsed(status, type) {
  const up = status.net_total_up
  const down = status.net_total_down
  if (type === 'up') return up
  if (type === 'down') return down
  if (type === 'max') return Math.max(up, down)
  if (type === 'min') return Math.min(up, down)
  return up + down
}

async function main() {
  const mock = await startMock()
  PORT = mock.port
  BASE = mock.base

  try {
    await waitForApi(BASE)

    /* ---------------- 传输层契约 ---------------- */
    section('RPC2')
    const methods = await rpc('rpc.methods')
    check('rpc.methods returns an array', Array.isArray(methods), typeof methods)
    for (const required of [
      'common:getNodes',
      'common:getNodesLatestStatus',
      'common:getPublicInfo',
      'public:queryMetrics',
      'public:getPingMetricStats',
    ]) {
      check(`advertises ${required}`, methods.includes(required))
    }

    /*
     * 这两个方法返回**以 uuid 为键的字典**，不是数组（web/rpc/jsonrpc/common.go
     * 的 getNodes：「返回以 uuid 为键的字典」）。注意和 REST /api/nodes 不同，
     * 那个信封里的 data 是数组 —— 客户端必须两种都认，否则 RPC 可用的实例上
     * 一个节点都出不来，而且请求全是 200，没有任何报错。
     */
    const nodeMap = await rpc('common:getNodes')
    check('getNodes 返回 uuid 字典而非数组', !Array.isArray(nodeMap) && typeof nodeMap === 'object')
    const nodes = Object.values(nodeMap)
    check('字典里有节点', nodes.length > 0, `${nodes.length}`)
    check(
      '字典的键就是节点自身的 uuid',
      Object.entries(nodeMap).every(([key, node]) => key === node.uuid),
    )
    check(
      '内部的 _offline 标记没有泄漏',
      nodes.every((node) => !('_offline' in node)),
    )

    const statusMap = await rpc('common:getNodesLatestStatus')
    check('getNodesLatestStatus 也返回 uuid 字典', !Array.isArray(statusMap) && typeof statusMap === 'object')
    const statuses = Object.values(statusMap)
    check('每条状态自带 online', statuses.every((s) => typeof s.online === 'boolean'))
    check(
      '每条状态自带 load5 与 load15',
      statuses.every((s) => typeof s.load5 === 'number' && typeof s.load15 === 'number'),
    )

    /* ---------------- 哨兵值 ---------------- */
    section('Sentinel values')
    check(
      'a node has expired_at null (never expires)',
      nodes.some((node) => node.expired_at === null),
    )
    check('a node has price -1 (free)', nodes.some((node) => node.price === -1))
    check('a node has price 0 (unset)', nodes.some((node) => node.price === 0))
    check(
      'a node has gpu_name "None"',
      nodes.some((node) => node.gpu_name === 'None'),
    )
    check(
      'a node has cpu_physical_cores 0 (unknown)',
      nodes.some((node) => node.cpu_physical_cores === 0),
    )
    check(
      'tags is a semicolon string, not an array',
      nodes.every((node) => typeof node.tags === 'string'),
    )
    check(
      'a node has swap_total 0 (swap disabled)',
      nodes.some((node) => node.swap_total === 0),
    )

    /* ---------------- 单位跨量级 ---------------- */
    section('Unit scaling across the fixture set')
    const memUnits = new Set(nodes.map((node) => formatBytes(node.mem_total).split(' ')[1]))
    check('memory spans more than one unit', memUnits.size > 1, [...memUnits].join(','))
    const diskUnits = new Set(nodes.map((node) => formatBytes(node.disk_total).split(' ')[1]))
    check('disk spans more than one unit', diskUnits.size > 1, [...diskUnits].join(','))
    check('256 MB renders as MB', formatBytes(256 * 1024 ** 2) === '256 MB', formatBytes(256 * 1024 ** 2))
    check('2 TB renders as TB', formatBytes(2 * 1024 ** 4) === '2.00 TB', formatBytes(2 * 1024 ** 4))
    check('zero renders as 0 B, never NaN', formatBytes(0) === '0 B')
    check('negative renders as 0 B, never NaN', formatBytes(-5) === '0 B')

    /* ---------------- 流量计费规则 ---------------- */
    section('traffic_limit_type')
    const sample = { net_total_up: 300, net_total_down: 700 }
    check('sum  = up + down', trafficUsed(sample, 'sum') === 1000)
    check('max  = larger', trafficUsed(sample, 'max') === 700)
    check('min  = smaller', trafficUsed(sample, 'min') === 300)
    check('up   = upload only', trafficUsed(sample, 'up') === 300)
    check('down = download only', trafficUsed(sample, 'down') === 700)
    check(
      'the fixtures cover more than one rule',
      new Set(nodes.map((node) => node.traffic_limit_type)).size > 1,
    )
    check(
      'a node has traffic_limit 0 (unmetered)',
      nodes.some((node) => node.traffic_limit === 0),
    )

    /* ---------------- 历史数据 ---------------- */
    section('历史数据')
    /*
     * 指标键名是带点的命名空间形式，和状态记录的字段名（cpu、ram、net_in）
     * 完全是两套。用错了服务端直接报 `unknown metric key`。
     */
    const definitions = await rpc('public:listMetricDefinitions')
    check('指标定义是数组', Array.isArray(definitions), typeof definitions)
    check(
      '指标定义用 name 字段而非 key',
      definitions[0] && 'name' in definitions[0] && !('key' in definitions[0]),
    )
    const names = new Set(definitions.map((d) => d.name))
    for (const key of ['cpu.usage', 'memory.used', 'load.average', 'net.in.rate']) {
      check(`定义里有 ${key}`, names.has(key))
    }

    const metricKeys = ['cpu.usage', 'memory.used', 'disk.used', 'load.average', 'net.in.rate']
    const metrics = await rpc('public:queryMetrics', {
      entity_ids: [nodes[0].uuid],
      metric_keys: metricKeys,
      hours: 4,
      downsample: true,
      max_points: 120,
      aggregation: 'avg',
      aggregation_by_metric: { 'cpu.usage': 'max', 'memory.used': 'avg' },
    })
    check('queryMetrics 返回 series 而非扁平记录', Array.isArray(metrics.series))
    check('每个请求的指标都有一条序列', metrics.series.length >= metricKeys.length, `${metrics.series?.length}`)
    const cpuSeries = metrics.series.find((s) => s.metric_key === 'cpu.usage')
    check('序列带 metric_key', Boolean(cpuSeries))
    check('序列带 entity_id', cpuSeries?.entity_id === nodes[0].uuid)
    check('序列的点在 points 数组里', Array.isArray(cpuSeries?.points), typeof cpuSeries?.points)
    check('点的形状是 {time,value}', typeof cpuSeries?.points?.[0]?.value === 'number')
    check('遵守 max_points', cpuSeries.points.length <= 121, `${cpuSeries?.points?.length}`)
    check(
      '时间戳带时区',
      cpuSeries.points.every((p) => /Z$|[+-]\d\d:\d\d$/.test(p.time)),
    )
    // 用量类指标给的是字节，不是百分比 —— 客户端要自己按总量换算
    const memSeries = metrics.series.find((s) => s.metric_key === 'memory.used')
    check('内存以字节给出而非百分比', memSeries?.points?.[0]?.value > 1000, `${memSeries?.points?.[0]?.value}`)

    let rejected = null
    try {
      await rpc('public:queryMetrics', { entity_ids: [nodes[0].uuid], metric_keys: ['cpu'], hours: 1 })
    } catch (error) {
      rejected = error.message
    }
    check('旧式键名被拒绝', rejected !== null && /unknown metric key/.test(rejected), rejected ?? '被接受了')

    /*
     * getRecords 即便指定 uuid 也会包一层信封，records 是按 uuid 分组的字典。
     */
    const single = await rpc('common:getRecords', { uuid: nodes[0].uuid, hours: 2 })
    check('getRecords 返回信封', !Array.isArray(single) && typeof single === 'object')
    check('信封含 records / count / from / to', ['records', 'count', 'from', 'to'].every((k) => k in single))
    check('records 按 uuid 分组', Array.isArray(single.records?.[nodes[0].uuid]))
    check('分组里是 StatusRecord', typeof single.records[nodes[0].uuid][0]?.net_total_up === 'number')

    /* ---------------- ping ---------------- */
    section('Ping')
    /*
     * getPingMetricStats 给的是**聚合统计**，没有时间序列 —— 画曲线要靠
     * queryMetrics 的 ping.latency_ms，按 task_id 标签拆分。把这个方法当成
     * 采样数组用，在真机上一条延迟都取不到，而且返回 200 毫无报错。
     */
    const pings = await rpc('public:getPingMetricStats', {
      entity_ids: [nodes[0].uuid],
      task_ids: [1, 2, 3],
      hours: 4,
      max_points: 200,
    })
    check('返回 stats 而非 records', Array.isArray(pings.stats), Object.keys(pings).join(','))
    check('带 interval_seconds', typeof pings.interval_seconds === 'number')
    const stat = pings.stats[0]
    check('统计项带 entity_id', typeof stat?.entity_id === 'string')
    check('task_id 是字符串', typeof stat?.task_id === 'string', typeof stat?.task_id)
    check('带聚合值 latest / avg / loss', ['latest', 'avg', 'loss'].every((k) => k in stat))
    check('没有时间序列字段', !('points' in stat) && !('time' in stat))

    // 延迟曲线的真实来源
    const pingMetrics = await rpc('public:queryMetrics', {
      entity_ids: [nodes[0].uuid],
      metric_keys: ['ping.latency_ms'],
      hours: 4,
      downsample: true,
      max_points: 200,
      aggregation: 'avg',
    })
    const latency = pingMetrics.series.filter((s) => s.metric_key === 'ping.latency_ms')
    check('延迟按任务拆成多条序列', latency.length > 1, `${latency.length} 条`)
    const tagged = latency.flatMap((s) => s.points ?? [])
    check('点上带 task_id 标签', typeof tagged[0]?.tags?.task_id === 'string')
    check('丢失的探测用 -1', tagged.some((p) => p.value === -1))
    check(
      '丢失只用 -1，不是任意负数',
      tagged.filter((p) => p.value < 0).every((p) => p.value === -1),
    )

    /* ---------------- 降级路径 ---------------- */
    section('Fallback: WS /api/clients')
    const frame = await wsRoundTrip('/api/clients', 'get')
    const parsed = JSON.parse(frame)
    check('frame has data.data keyed by uuid', typeof parsed.data?.data === 'object')
    check('frame has a separate data.online array', Array.isArray(parsed.data?.online))
    const firstNested = Object.values(parsed.data.data)[0]
    check('nested shape uses cpu.usage', typeof firstNested?.cpu?.usage === 'number')
    check('nested shape uses ram.total / ram.used', typeof firstNested?.ram?.total === 'number')
    check('nested shape is the only source of uptime', typeof firstNested?.uptime === 'number')
    check(
      'online array excludes the offline node',
      parsed.data.online.length === Object.keys(parsed.data.data).length - 1,
      `${parsed.data.online.length} of ${Object.keys(parsed.data.data).length}`,
    )

    section('RPC2 over WebSocket')
    const wsReply = JSON.parse(
      await wsRoundTrip('/api/rpc2', JSON.stringify({ jsonrpc: '2.0', id: 42, method: 'rpc.methods' })),
    )
    check('reply echoes the request id', wsReply.id === 42, String(wsReply.id))
    check('reply carries a result', Array.isArray(wsReply.result))

    section('REST envelope')
    const publicRes = await fetch(`${BASE}/api/public`)
    const publicBody = await publicRes.json()
    check('wraps data in {status,message,data}', publicBody.status === 'success' && 'data' in publicBody)
    check('exposes theme_settings', typeof publicBody.data.theme_settings === 'object')
    check(
      'featuredPingTasks is a JSON string needing a parse',
      typeof publicBody.data.theme_settings.featuredPingTasks === 'string',
    )
    const errorRes = await fetch(`${BASE}/api/does-not-exist`)
    const errorBody = await errorRes.json()
    check('errors are reported in-band', errorBody.status === 'error')
  } finally {
    mock.stop()
  }

  console.log(`\n${checks - failures}/${checks} checks passed`)
  if (failures > 0) {
    console.log(`${failures} FAILED`)
    process.exit(1)
  }
}

await main()
