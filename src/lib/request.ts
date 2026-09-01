/**
 * REST 降级路径用的极简 fetch 封装。
 *
 * Komari 出错时返回的是 HTTP 200 加响应体里的 `status: "error"`，所以信封
 * 必须手动拆。session cookie 是 HttpOnly 同源的，`fetch` 默认就会带上。
 */

import type { ApiEnvelope } from './types'

export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status = 0) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

interface RequestOptions {
  signal?: AbortSignal | undefined
  method?: 'GET' | 'POST'
  body?: unknown
}

/** 拆信封；传输层失败和信封内失败都抛错。 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { signal, method = 'GET', body } = options

  const init: RequestInit = { method }
  if (signal) init.signal = signal
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' }
    init.body = JSON.stringify(body)
  }

  const response = await fetch(path, init)

  if (!response.ok) {
    throw new ApiError(`${method} ${path} failed with ${response.status}`, response.status)
  }

  let payload: ApiEnvelope<T>
  try {
    payload = (await response.json()) as ApiEnvelope<T>
  } catch {
    throw new ApiError(`${method} ${path} returned a malformed body`, response.status)
  }

  // 不能保证每个接口都套信封，所以只在信封存在且明确报错时才拒绝。
  if (payload && typeof payload === 'object' && 'status' in payload) {
    if (payload.status !== 'success') {
      throw new ApiError(payload.message || `${path} reported an error`, response.status)
    }
    return payload.data
  }

  return payload as unknown as T
}

/** 同源路径的绝对 WebSocket 地址，https 下自动用 wss。 */
export function websocketUrl(path: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${path}`
}
