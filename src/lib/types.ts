/**
 * Komari 接口的数据类型。
 *
 * 同一批指标会以三种互不兼容的结构返回，取决于走的是哪个接口。官方文档
 * 明确说明 StatusRecord 和 Record 不可互换，所以三种结构各有自己的类型，
 * 由 `normalize.ts` 把另两种转成 `NodeStatus` —— 传输层之上统一只用它。
 */
/** 所有 REST 响应的信封。出错时也是 HTTP 200，靠 status 字段区分。 */
export interface ApiEnvelope<T> {
  status: 'success' | 'error'
  message: string
  data: T
}

/**
 * 节点元数据。若干字段用哨兵值而不是 null 表示"无"，逐个标在下面；
 * 把这些值挡在 UI 之外是 `format.ts` 的职责。
 */
export interface Client {
  uuid: string
  name: string
  /** `;` 分隔的字符串，不是数组。 */
  tags: string
  /** 通常是国旗 emoji，也可能是两位国家代码。 */
  region: string
  group: string
  os: string
  arch: string
  virtualization: string
  kernel_version: string
  cpu_name: string
  cpu_cores: number
  /** `0` 表示未知或未上报。 */
  cpu_physical_cores: number
  /** 无 GPU 时是字符串 `"None"`，不是空值。 */
  gpu_name: string
  mem_total: number
  swap_total: number
  disk_total: number
  /** 排序权重，数值大的在前。 */
  weight: number
  /** `-1` 表示免费，`0` 表示未设置。 */
  price: number
  /** 默认是 `$`。 */
  currency: string
  billing_cycle: number
  auto_renewal: boolean
  /** UTC RFC3339Nano；永不过期的节点是 null。 */
  expired_at: string | null
  /** `0` 表示不限量。 */
  traffic_limit: number
  traffic_limit_type: TrafficLimitType
  hidden: boolean
  created_at: string
  updated_at: string
  /** 只有已鉴权的调用方能拿到；否则被打码或直接缺失。 */
  ipv4?: string | undefined
  ipv6?: string | undefined
  remark?: string | undefined
  version?: string | undefined
}

/** 决定已用流量怎么从 net_total_up / net_total_down 算出来。 */
export type TrafficLimitType = 'sum' | 'max' | 'min' | 'up' | 'down'

/**
 * 规范化的实时状态。`common:getNodesLatestStatus` 直接返回这个结构，
 * 所以主传输路径零转换。
 */
export interface NodeStatus {
  client: string
  time: string
  online: boolean
  cpu: number
  gpu: number
  ram: number
  ram_total: number
  swap: number
  swap_total: number
  disk: number
  disk_total: number
  load: number
  load5: number
  load15: number
  temp: number
  net_in: number
  net_out: number
  net_total_up: number
  net_total_down: number
  process: number
  connections: number
  connections_udp: number
  /** 只有嵌套结构才有，RPC2 路径拿不到。 */
  uptime?: number | undefined
  /** 只有嵌套结构才有，RPC2 路径拿不到。 */
  message?: string | undefined
}

/** `common:getRecords` 的历史采样。没有 `online` / `load5` / `load15`。 */
export type StatusRecord = Omit<NodeStatus, 'online' | 'load5' | 'load15' | 'uptime' | 'message'>

/**
 * WS `/api/clients` 和 `GET /api/recent/{uuid}` 返回的嵌套结构。
 * `uptime` 和 `message` 只存在于这里。
 */
export interface NestedStatus {
  cpu: { usage: number }
  gpu: { count: number; average_usage: number }
  ram: { total: number; used: number }
  swap: { total: number; used: number }
  disk: { total: number; used: number }
  load: { load1: number; load5: number; load15: number }
  network: { up: number; down: number; totalUp: number; totalDown: number }
  connections: { tcp: number; udp: number }
  temp?: number
  process: number
  uptime: number
  message: string
  updated_at: string
}

/** WS `/api/clients` 的响应体。`online` 单独放在 data 之外。 */
export interface ClientsFrame {
  status?: string
  data?: {
    online?: string[]
    data?: Record<string, NestedStatus>
  }
}

export interface PublicInfo {
  sitename: string
  description: string
  allow_cors: boolean
  private_site: boolean
  theme: string
  /** 服务端低于 1.0.5 时这个字段不存在。 */
  theme_settings?: Record<string, unknown> | undefined
  custom_head?: string | undefined
  custom_body?: string | undefined
}

export interface PingTask {
  id: number
  name: string
  interval: number
  type: string
  target?: string | undefined
}

/** 一条 ping 采样。`value` 为负表示丢包，不是真的负延迟。 */
export interface PingRecord {
  task_id: number
  client: string
  time: string
  value: number
}

/*
 * 指标定义与聚合算法的类型放在 lib/metrics.ts —— 那里的定义来自真实实例的
 * public:listMetricDefinitions，和这个文件里的状态结构不是一套命名。
 */

/** 合并默认值之后的主题设置。 */
export interface ThemeSettings {
  defaultView: 'grid' | 'table'
  refreshInterval: number
  showDisk: boolean
  showLoad: boolean
  showSparkline: boolean
  showTraffic: boolean
  showExpiry: boolean
  showPrice: boolean
  showPing: boolean
  /** 存储格式是数字任务 ID 的 JSON 字符串，读出来要先 parse。 */
  featuredPingTasks: number[]
  historyHours: number
  maxPoints: number
  /** 存储格式是节点 UUID 的 JSON 字符串，读出来要先 parse。 */
  featuredNodes: string[]
  footerHtml: string
}

/** 节点元数据 + 它的最新状态。 */
export interface NodeView {
  client: Client
  status: NodeStatus | null
}
