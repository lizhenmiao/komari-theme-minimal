/**
 * `/api/rpc2` 的 JSON-RPC 2.0 客户端，优先 WebSocket，兜底 HTTP POST。
 * 要求服务端 >= 1.0.7；更老的版本这个端点直接 404，`probe()` 会把这个情况
 * 报出来，调用方据此整条改走 REST。
 *
 * 文档只规定了信封格式，心跳、重连策略、close code 含义、错误码编号都没有
 * 约定。下面这些属于自行设计的部分，逐处标注。
 */

import { websocketUrl } from './request'

const RPC_PATH = '/api/rpc2'
const CALL_TIMEOUT_MS = 15_000
const BACKOFF_BASE_MS = 500
const BACKOFF_CAP_MS = 30_000

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: unknown
}

interface JsonRpcError {
  code?: number
  message?: string
  data?: unknown
}

interface JsonRpcResponse {
  jsonrpc?: string
  id?: number | null
  result?: unknown
  error?: JsonRpcError
}

export class RpcError extends Error {
  readonly code: number | undefined
  constructor(message: string, code?: number) {
    super(message)
    this.name = 'RpcError'
    this.code = code
  }
}

interface Pending {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export type RpcState = 'idle' | 'connecting' | 'open' | 'closed'

export class JsonRpcClient {
  private socket: WebSocket | null = null
  private nextId = 1
  private readonly pending = new Map<number, Pending>()
  /** socket 打开前发出的调用，open 时按序冲出去。 */
  private queue: string[] = []
  private attempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private disposed = false
  private state: RpcState = 'idle'
  private readonly listeners = new Set<(state: RpcState) => void>()
  /** WS 彻底失败后置位，避免继续重试一个死端点。 */
  private websocketUnavailable = false
  /** 成功打开过一次即为 true，用来区分"正在重连"和"被拦截"。 */
  private everOpened = false
  /** `probe()` 确认 POST 端点可用后置位。 */
  private httpUsable = false

  onStateChange(listener: (state: RpcState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getState(): RpcState {
    return this.state
  }

  private setState(next: RpcState): void {
    if (this.state === next) return
    this.state = next
    for (const listener of this.listeners) listener(next)
  }

  connect(): void {
    if (this.disposed || this.websocketUnavailable) return
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) return

    this.setState('connecting')
    let socket: WebSocket
    try {
      socket = new WebSocket(websocketUrl(RPC_PATH))
    } catch {
      // 地址非法时构造函数会抛错，直接当作永久不可用。
      this.websocketUnavailable = true
      this.setState('closed')
      return
    }
    this.socket = socket

    socket.onopen = () => {
      this.attempts = 0
      this.everOpened = true
      this.setState('open')
      const queued = this.queue
      this.queue = []
      for (const frame of queued) socket.send(frame)
    }

    socket.onmessage = (event) => {
      if (typeof event.data !== 'string') return
      this.handleFrame(event.data)
    }

    socket.onerror = () => {
      // `onclose` 一定紧随其后，重连调度统一放在那里。
    }

    socket.onclose = () => {
      this.socket = null
      this.setState('closed')
      // 在飞的请求全部失败：死掉的 socket 上永远不会再有响应回来。
      this.rejectAll(new RpcError('rpc socket closed'))

      /*
       * 一次都没打开成功就关闭了，而 POST 已知可用：说明升级请求被拒
       * （比如反向代理把 Upgrade 头剥掉了）。这时停止重试 socket，改走
       * `probe()` 已经验证过的 POST。没有这一步的话，明明存在一条通路，
       * 客户端却会让每个调用都失败。
       */
      if (!this.everOpened && this.httpUsable) {
        this.websocketUnavailable = true
        this.queue = []
        return
      }
      this.scheduleReconnect()
    }
  }

  private handleFrame(raw: string): void {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return
    }
    // 批量响应不在文档范围内，但容错处理一下，别整帧丢掉。
    const frames: JsonRpcResponse[] = Array.isArray(parsed)
      ? (parsed as JsonRpcResponse[])
      : [parsed as JsonRpcResponse]

    for (const frame of frames) {
      if (typeof frame?.id !== 'number') continue
      const pending = this.pending.get(frame.id)
      if (!pending) continue
      this.pending.delete(frame.id)
      clearTimeout(pending.timer)
      if (frame.error) {
        // 防御式处理：文档只提到 InvalidParams 和 InternalError，没有数字码表，
        // 所以绝不按 code 分支。
        pending.reject(new RpcError(frame.error.message ?? 'rpc error', frame.error.code))
      } else {
        pending.resolve(frame.result)
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer) return
    this.attempts += 1
    // 指数退避 + 全抖动，带上限。文档对此没有任何指引。
    const ceiling = Math.min(BACKOFF_BASE_MS * 2 ** (this.attempts - 1), BACKOFF_CAP_MS)
    const delay = Math.random() * ceiling
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
  }

  /** 能走 socket 就走 socket，否则退到 HTTP POST。 */
  async call<T>(method: string, params?: unknown): Promise<T> {
    if (this.disposed) throw new RpcError('rpc client disposed')

    if (this.websocketUnavailable) {
      return this.callOverHttp<T>(method, params)
    }

    if (!this.socket) this.connect()

    const id = this.nextId++
    const payload: JsonRpcRequest = { jsonrpc: '2.0', id, method }
    if (params !== undefined) payload.params = params
    const frame = JSON.stringify(payload)

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new RpcError(`${method} timed out`))
      }, CALL_TIMEOUT_MS)

      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      })

      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(frame)
      } else {
        // 先缓存，等 `onopen` 按序冲出去。
        this.queue.push(frame)
      }
    }).catch((error: unknown) => {
      /*
       * socket 在这次调用期间死了。当 POST 已知可用、且 socket 从未成功
       * 打开过时，改走 POST 重试一次，而不是把一个本可绕开的失败抛给调用方。
       * 这里判断 `everOpened` 而不是 `websocketUnavailable` 标志，是为了不
       * 依赖 `onclose` 有没有先跑完。
       */
      if (this.httpUsable && !this.everOpened && !this.disposed) {
        return this.callOverHttp<T>(method, params)
      }
      throw error
    })
  }

  /** 同样的 JSON-RPC 信封，走一次性 POST。 */
  private async callOverHttp<T>(method: string, params?: unknown): Promise<T> {
    const payload: JsonRpcRequest = { jsonrpc: '2.0', id: this.nextId++, method }
    if (params !== undefined) payload.params = params

    const response = await fetch(RPC_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      throw new RpcError(`rpc POST ${method} failed with ${response.status}`)
    }
    const frame = (await response.json()) as JsonRpcResponse
    if (frame.error) {
      throw new RpcError(frame.error.message ?? 'rpc error', frame.error.code)
    }
    return frame.result as T
  }

  /**
   * 用 POST 做一次连通性探测。启动时调用，这样低于 1.0.7 的服务端能立刻
   * 判定出来，不用干等 WebSocket 的退避周期。
   */
  async probe(): Promise<boolean> {
    try {
      await this.callOverHttp<unknown>('rpc.methods')
      // 记下来，这样 WebSocket 升级被拒时能回落到这条路。
      this.httpUsable = true
      return true
    } catch {
      this.websocketUnavailable = true
      return false
    }
  }

  dispose(): void {
    this.disposed = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.rejectAll(new RpcError('rpc client disposed'))
    this.socket?.close()
    this.socket = null
    this.setState('idle')
  }
}
