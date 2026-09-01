/**
 * 在裸 TCP socket 上实现一个浏览器形状的极简 WebSocket。
 *
 * 为了跑一个检查而装 `ws` 不值得，所以这里只实现主题传输层实际用到的部分：
 * 连接、发文本、收文本、关闭。
 *
 * 只支持文本帧，不支持分片、扩展和 ping/pong。
 */

import { createHash, randomBytes } from 'node:crypto'
import { connect } from 'node:net'

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

export class NodeWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  constructor(url) {
    this.readyState = NodeWebSocket.CONNECTING
    this.onopen = null
    this.onmessage = null
    this.onclose = null
    this.onerror = null

    const parsed = new URL(url)
    const port = Number(parsed.port || (parsed.protocol === 'wss:' ? 443 : 80))
    const key = randomBytes(16).toString('base64')
    const expected = createHash('sha1').update(key + GUID).digest('base64')

    this._handshakeDone = false
    this._buffer = Buffer.alloc(0)

    this._socket = connect(port, parsed.hostname, () => {
      this._socket.write(
        `GET ${parsed.pathname} HTTP/1.1\r\n` +
          `Host: ${parsed.host}\r\n` +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          `Sec-WebSocket-Key: ${key}\r\n` +
          'Sec-WebSocket-Version: 13\r\n\r\n',
      )
    })

    this._socket.on('data', (chunk) => {
      this._buffer = Buffer.concat([this._buffer, chunk])

      if (!this._handshakeDone) {
        const end = this._buffer.indexOf('\r\n\r\n')
        if (end === -1) return
        const head = this._buffer.subarray(0, end).toString('utf8')
        this._buffer = this._buffer.subarray(end + 4)
        if (!head.includes(expected)) {
          this._fail(new Error('bad websocket handshake'))
          return
        }
        this._handshakeDone = true
        this.readyState = NodeWebSocket.OPEN
        this.onopen?.({})
      }

      this._drainFrames()
    })

    this._socket.on('error', (error) => this._fail(error))
    this._socket.on('close', () => {
      if (this.readyState === NodeWebSocket.CLOSED) return
      this.readyState = NodeWebSocket.CLOSED
      this.onclose?.({})
    })
  }

  _fail(error) {
    this.readyState = NodeWebSocket.CLOSED
    this.onerror?.({ error })
    this.onclose?.({})
    this._socket.destroy()
  }

  _drainFrames() {
    for (;;) {
      const buffer = this._buffer
      if (buffer.length < 2) return

      const opcode = buffer[0] & 0x0f
      let length = buffer[1] & 0x7f
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

      const payload = buffer.subarray(cursor, cursor + length)
      this._buffer = buffer.subarray(cursor + length)

      if (opcode === 0x8) {
        this.close()
        return
      }
      if (opcode === 0x1) {
        this.onmessage?.({ data: payload.toString('utf8') })
      }
      // 这个协议里不会出现二进制帧和控制帧。
    }
  }

  send(text) {
    if (this.readyState !== NodeWebSocket.OPEN) {
      throw new Error('socket is not open')
    }
    const payload = Buffer.from(String(text), 'utf8')
    // 按 RFC 6455，客户端帧必须掩码。
    const mask = randomBytes(4)
    const masked = Buffer.from(payload)
    for (let i = 0; i < masked.length; i += 1) masked[i] ^= mask[i % 4]

    let header
    if (payload.length < 126) {
      header = Buffer.from([0x81, 0x80 | payload.length])
    } else if (payload.length < 65536) {
      header = Buffer.alloc(4)
      header[0] = 0x81
      header[1] = 0x80 | 126
      header.writeUInt16BE(payload.length, 2)
    } else {
      header = Buffer.alloc(10)
      header[0] = 0x81
      header[1] = 0x80 | 127
      header.writeBigUInt64BE(BigInt(payload.length), 2)
    }
    this._socket.write(Buffer.concat([header, mask, masked]))
  }

  close() {
    if (this.readyState === NodeWebSocket.CLOSED) return
    this.readyState = NodeWebSocket.CLOSED
    try {
      this._socket.end()
    } catch {
      // 已经断了。
    }
    this.onclose?.({})
  }
}
