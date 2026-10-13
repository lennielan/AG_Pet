/**
 * extension/src/server-bridge.ts
 * RFC-6455 WebSocket Server Bridge for streaming agent state events to desktop pet overlay.
 *
 * Implements pure Node.js RFC-6455 framing, unmasking, broadcast, heartbeat,
 * and client command handling (e.g. focus_ide, pet_ready, pet_close).
 */

import * as http from 'node:http';
import * as net from 'node:net';
import * as crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  IPCClientMessage,
  IPCServerMessage,
  StatePayload,
  PetConfig,
} from '../../shared/types';
import {
  IPC_HEARTBEAT_INTERVAL_MS,
  validateIPCMessage,
  validateStatePayload,
} from '../../shared/constants';

export interface ServerBridgeOptions {
  port?: number;
  heartbeatIntervalMs?: number;
  autoStartHeartbeat?: boolean;
}

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export class ServerBridge extends EventEmitter {
  private server: http.Server | null = null;
  private clients: Set<net.Socket> = new Set();
  private clientBuffers: Map<net.Socket, Buffer> = new Map();
  private port: number = 0;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private heartbeatIntervalMs: number;

  constructor(options: ServerBridgeOptions = {}) {
    super();
    this.port = options.port || 0;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs || IPC_HEARTBEAT_INTERVAL_MS;
  }

  /**
   * Starts the HTTP and WebSocket upgrade server on specified port.
   * If port is 0, an ephemeral port is allocated by the OS.
   */
  public listen(port?: number): Promise<number> {
    const targetPort = port !== undefined ? port : this.port;

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        res.writeHead(426, { 'Content-Type': 'text/plain' });
        res.end('Upgrade Required - AG Pet RFC-6455 WebSocket Bridge');
      });

      this.server.on('upgrade', (req, socket, head) => {
        this.handleUpgrade(req, socket as net.Socket, head);
      });

      this.server.on('error', (err) => {
        this.emit('error', err);
        reject(err);
      });

      this.server.listen(targetPort, '127.0.0.1', () => {
        const address = this.server?.address();
        if (address && typeof address === 'object') {
          this.port = address.port;
        } else {
          this.port = targetPort;
        }
        this.startHeartbeat();
        this.emit('listening', this.port);
        resolve(this.port);
      });
    });
  }

  /**
   * Upgrades incoming HTTP connection to RFC-6455 WebSocket socket.
   */
  private handleUpgrade(req: http.IncomingMessage, socket: net.Socket, _head: Buffer): void {
    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }

    const acceptKey = crypto
      .createHash('sha1')
      .update(key + WS_GUID)
      .digest('base64');

    const headers = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`,
      '\r\n',
    ];

    socket.write(headers.join('\r\n'));
    this.clients.add(socket);
    this.clientBuffers.set(socket, Buffer.alloc(0));

    socket.on('data', (chunk: Buffer) => {
      this.handleSocketData(socket, chunk);
    });

    socket.on('close', () => {
      this.clients.delete(socket);
      this.clientBuffers.delete(socket);
      this.emit('client_disconnected', socket);
    });

    socket.on('error', (_err) => {
      this.clients.delete(socket);
      this.clientBuffers.delete(socket);
    });

    this.emit('connection', socket);
  }

  /**
   * Parses RFC-6455 incoming frames from client.
   * Handles multi-chunk accumulation and unmasking.
   */
  private handleSocketData(socket: net.Socket, chunk: Buffer): void {
    const prev = this.clientBuffers.get(socket) || Buffer.alloc(0);
    let buffer = Buffer.concat([prev, chunk]);

    while (buffer.length >= 2) {
      const byte0 = buffer[0];
      const byte1 = buffer[1];
      const opcode = byte0 & 0x0f;
      const isMasked = (byte1 & 0x80) !== 0;
      let payloadLen = byte1 & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (buffer.length < 4) break;
        payloadLen = buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (buffer.length < 10) break;
        payloadLen = Number(buffer.readBigUInt64BE(2));
        offset = 10;
      }

      let mask: Buffer | null = null;
      if (isMasked) {
        if (buffer.length < offset + 4) break;
        mask = buffer.subarray(offset, offset + 4);
        offset += 4;
      }

      if (buffer.length < offset + payloadLen) {
        // Incomplete frame, wait for more data
        break;
      }

      const payload = Buffer.from(buffer.subarray(offset, offset + payloadLen));
      if (mask) {
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= mask[i % 4];
        }
      }

      // Consume this frame from buffer
      buffer = buffer.subarray(offset + payloadLen);

      // Handle Opcode
      if (opcode === 1) {
        // Text Frame
        const text = payload.toString('utf8');
        try {
          const json = JSON.parse(text);
          this.handleClientMessage(json, socket);
        } catch (_err) {
          this.emit('raw_message', text, socket);
        }
      } else if (opcode === 8) {
        // Close Frame
        this.sendCloseFrame(socket);
        socket.end();
        break;
      } else if (opcode === 9) {
        // Ping Frame -> reply with Pong
        this.sendPongFrame(socket, payload);
      } else if (opcode === 10) {
        // Pong Frame
        this.emit('pong', socket);
      }
    }

    this.clientBuffers.set(socket, buffer);
  }

  /**
   * Dispatches typed client messages to extension handlers.
   */
  private handleClientMessage(msg: any, socket: net.Socket): void {
    const validation = validateIPCMessage(msg, 'client-to-server');
    if (!validation.valid) {
      this.emit('invalid_message', msg, validation.error);
      return;
    }

    const clientMsg = msg as IPCClientMessage;
    this.emit('message', clientMsg, socket);

    switch (clientMsg.type) {
      case 'focus_ide':
        this.emit('focus_ide', socket);
        break;
      case 'pet_ready':
        this.emit('pet_ready', socket);
        break;
      case 'pet_close':
        this.emit('pet_close', socket);
        break;
      case 'config_update':
        if (clientMsg.config) {
          this.emit('config_update', clientMsg.config, socket);
        }
        break;
    }
  }

  /**
   * Broadcasts an IPC message or StatePayload to all connected clients.
   */
  public broadcast(message: IPCServerMessage | StatePayload | Record<string, unknown>): void {
    let envelope: IPCServerMessage;

    if ('state' in message && 'summary' in message && 'timestamp' in message) {
      envelope = {
        type: 'state_update',
        payload: message as StatePayload,
      };
    } else if ('type' in message) {
      envelope = message as IPCServerMessage;
    } else {
      envelope = {
        type: 'state_update',
        payload: message as any,
      };
    }

    const json = JSON.stringify(envelope);
    const frame = this.createFrame(json);

    for (const client of this.clients) {
      try {
        if (!client.destroyed && client.writable) {
          client.write(frame);
        }
      } catch (_err) {
        this.clients.delete(client);
      }
    }
  }

  /**
   * Encodes a UTF-8 text string into an RFC-6455 server-to-client unmasked frame.
   */
  private createFrame(text: string): Buffer {
    const payload = Buffer.from(text, 'utf8');
    const header: number[] = [0x81]; // FIN bit (0x80) + Text opcode (0x01)

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
      for (const b of lenBuf) {
        header.push(b);
      }
    }

    return Buffer.concat([Buffer.from(header), payload]);
  }

  private sendCloseFrame(socket: net.Socket): void {
    try {
      const closeFrame = Buffer.from([0x88, 0x00]); // FIN + Close opcode
      socket.write(closeFrame);
    } catch (_err) {}
  }

  private sendPongFrame(socket: net.Socket, payload: Buffer): void {
    try {
      const header = Buffer.from([0x8a, payload.length & 0x7f]); // FIN + Pong opcode
      socket.write(Buffer.concat([header, payload]));
    } catch (_err) {}
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.broadcast({
        type: 'heartbeat',
        timestamp: Date.now(),
      });
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Shuts down bridge server and cleanly terminates all client connections.
   */
  public close(): Promise<void> {
    this.stopHeartbeat();

    return new Promise((resolve) => {
      for (const client of this.clients) {
        try {
          this.sendCloseFrame(client);
          client.destroy();
        } catch (_err) {}
      }
      this.clients.clear();
      this.clientBuffers.clear();

      if (this.server) {
        this.server.close(() => {
          this.server = null;
          this.emit('close');
          resolve();
        });
      } else {
        this.emit('close');
        resolve();
      }
    });
  }

  public getPort(): number {
    return this.port;
  }

  public getClientCount(): number {
    return this.clients.size;
  }

  public getClients(): ReadonlySet<net.Socket> {
    return this.clients;
  }
}
