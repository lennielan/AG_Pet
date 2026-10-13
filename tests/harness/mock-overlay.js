/**
 * mock-overlay.js
 * Mock IPC / WebSocket client and server bridge for testing real-time synchronization.
 */

const http = require('node:http');
const crypto = require('node:crypto');
const EventEmitter = require('node:events');
const { validateIPCMessage } = require('./spec-contracts');

/**
 * Pure Node.js RFC-6455 minimal WebSocket implementation for zero-dependency test harness.
 */
class MinimalWebSocketServer extends EventEmitter {
  constructor() {
    super();
    this.server = null;
    this.clients = new Set();
    this.port = 0;
  }

  listen(port = 0) {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        res.writeHead(426, { 'Content-Type': 'text/plain' });
        res.end('Upgrade Required');
      });

      this.server.on('upgrade', (req, socket, head) => {
        const key = req.headers['sec-websocket-key'];
        if (!key) {
          socket.destroy();
          return;
        }

        const acceptKey = crypto
          .createHash('sha1')
          .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
          .digest('base64');

        const headers = [
          'HTTP/1.1 101 Switching Protocols',
          'Upgrade: websocket',
          'Connection: Upgrade',
          `Sec-WebSocket-Accept: ${acceptKey}`,
          '\r\n'
        ];

        socket.write(headers.join('\r\n'));
        this.clients.add(socket);

        socket.on('data', (buffer) => {
          this._handleFrame(socket, buffer);
        });

        socket.on('close', () => {
          this.clients.delete(socket);
          this.emit('client_disconnected', socket);
        });

        socket.on('error', () => {
          this.clients.delete(socket);
        });

        this.emit('connection', socket);
      });

      this.server.listen(port, '127.0.0.1', () => {
        this.port = this.server.address().port;
        resolve(this.port);
      });

      this.server.on('error', reject);
    });
  }

  _handleFrame(socket, buffer) {
    let cursor = 0;
    while (cursor < buffer.length) {
      if (buffer.length - cursor < 2) break;
      const opcode = buffer[cursor] & 0x0f;
      const isMasked = (buffer[cursor + 1] & 0x80) !== 0;
      let payloadLen = buffer[cursor + 1] & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (buffer.length - cursor < 4) break;
        payloadLen = buffer.readUInt16BE(cursor + 2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (buffer.length - cursor < 10) break;
        payloadLen = Number(buffer.readBigUInt64BE(cursor + 2));
        offset = 10;
      }

      let mask = null;
      if (isMasked) {
        if (buffer.length - cursor < offset + 4) break;
        mask = buffer.subarray(cursor + offset, cursor + offset + 4);
        offset += 4;
      }

      if (buffer.length - cursor < offset + payloadLen) break;

      const payload = Buffer.from(buffer.subarray(cursor + offset, cursor + offset + payloadLen));
      if (mask) {
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= mask[i % 4];
        }
      }

      cursor += offset + payloadLen;

      if (opcode === 1) { // Text
        const text = payload.toString('utf8');
        try {
          const json = JSON.parse(text);
          this.emit('message', json, socket);
        } catch (e) {
          this.emit('raw_message', text, socket);
        }
      } else if (opcode === 8) { // Close
        socket.end();
        break;
      }
    }
  }

  broadcast(message) {
    const text = typeof message === 'string' ? message : JSON.stringify(message);
    const payload = Buffer.from(text, 'utf8');
    const header = [];
    header.push(0x81); // FIN + Text frame

    if (payload.length < 126) {
      header.push(payload.length);
    } else if (payload.length <= 65535) {
      header.push(126);
      header.push((payload.length >> 8) & 0xff);
      header.push(payload.length & 0xff);
    } else {
      header.push(127);
      const lenBuf = Buffer.alloc(8);
      lenBuf.writeBigUInt64BE(BigInt(payload.length));
      for (let b of lenBuf) header.push(b);
    }

    const frame = Buffer.concat([Buffer.from(header), payload]);
    for (const client of this.clients) {
      try {
        client.write(frame);
      } catch (e) {}
    }
  }

  close() {
    return new Promise((resolve) => {
      for (const client of this.clients) {
        try { client.destroy(); } catch (e) {}
      }
      this.clients.clear();
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}

/**
 * Mock Overlay Client using standard global WebSocket.
 */
class MockOverlayClient extends EventEmitter {
  constructor(port) {
    super();
    this.port = port;
    this.ws = null;
    this.connected = false;
    this.receivedMessages = [];
  }

  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new globalThis.WebSocket(`ws://127.0.0.1:${this.port}`);

        let settled = false;
        this.ws.onopen = () => {
          settled = true;
          this.connected = true;
          this.emit('open');
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.receivedMessages.push(data);
            this.emit('message', data);
          } catch (e) {
            this.receivedMessages.push(event.data);
            this.emit('message', event.data);
          }
        };

        this.ws.onerror = (err) => {
          if (!settled) {
            settled = true;
            reject(new Error(`WebSocket connection failed to port ${this.port}`));
          } else if (this.listenerCount('error') > 0) {
            this.emit('error', err);
          }
        };

        this.ws.onclose = () => {
          if (!settled) {
            settled = true;
            reject(new Error(`WebSocket closed before connecting to port ${this.port}`));
          }
          this.connected = false;
          this.emit('close');
        };
      } catch (e) {
        reject(e);
      }
    });
  }

  send(msg) {
    if (!this.connected || !this.ws) {
      throw new Error('WebSocket is not connected');
    }
    const payload = typeof msg === 'string' ? msg : JSON.stringify(msg);
    this.ws.send(payload);
  }

  async waitForMessage(predicate, timeoutMs = 2000) {
    // First check existing messages
    const existing = this.receivedMessages.find(predicate);
    if (existing) return existing;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off('message', handler);
        reject(new Error(`Timeout waiting for message after ${timeoutMs}ms`));
      }, timeoutMs);

      const handler = (msg) => {
        if (predicate(msg)) {
          clearTimeout(timer);
          this.off('message', handler);
          resolve(msg);
        }
      };

      this.on('message', handler);
    });
  }

  disconnect() {
    if (this.ws) {
      try {
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.close();
      } catch (e) {}
    }
    this.connected = false;
  }
}

module.exports = {
  MinimalWebSocketServer,
  MockOverlayClient
};
