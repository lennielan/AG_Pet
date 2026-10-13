/**
 * desktop-overlay/main/client-bridge.ts
 * Real-time WebSocket IPC bridge client connecting the overlay to the Antigravity extension.
 */

import { EventEmitter } from 'node:events';
import {
  IPCClientMessage,
  IPCServerMessage,
  PetConfig,
  StatePayload,
} from '../../shared/types';
import {
  DEFAULT_WS_PORT,
  WS_MAX_RECONNECT_ATTEMPTS,
  WS_RECONNECT_INTERVAL_MS,
  validateIPCMessage,
  validateStatePayload,
} from '../../shared/constants';

export interface ClientBridgeOptions {
  port?: number;
  host?: string;
  autoConnect?: boolean;
  reconnectIntervalMs?: number;
  maxReconnectAttempts?: number;
}

export class ClientBridge extends EventEmitter {
  private port: number;
  private host: string;
  private reconnectIntervalMs: number;
  private maxReconnectAttempts: number;
  private reconnectAttempts = 0;
  private ws: any = null;
  private connected = false;
  private closedExplicitly = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pendingQueue: IPCClientMessage[] = [];

  constructor(options: ClientBridgeOptions = {}) {
    super();
    this.port = options.port || DEFAULT_WS_PORT;
    this.host = options.host || '127.0.0.1';
    this.reconnectIntervalMs = options.reconnectIntervalMs || WS_RECONNECT_INTERVAL_MS;
    this.maxReconnectAttempts = options.maxReconnectAttempts || WS_MAX_RECONNECT_ATTEMPTS;

    if (options.autoConnect !== false) {
      queueMicrotask(() => {
        this.connect().catch(() => {});
      });
    }
  }

  /**
   * Connects to the local extension WebSocket bridge server.
   */
  public connect(): Promise<void> {
    this.closedExplicitly = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    return new Promise((resolve, reject) => {
      try {
        const url = `ws://${this.host}:${this.port}`;
        const WebSocketClass = (globalThis as any).WebSocket;
        if (!WebSocketClass) {
          const err = new Error('WebSocket is not supported in current environment');
          if (this.listenerCount('error') > 0) {
            this.emit('error', err);
          }
          return reject(err);
        }

        const ws = new WebSocketClass(url);
        this.ws = ws;

        let settled = false;

        ws.onopen = () => {
          settled = true;
          this.connected = true;
          this.reconnectAttempts = 0;
          this.emit('connected');

          // Flush any pending queued messages
          this.flushQueue();

          resolve();
        };

        ws.onmessage = (event: any) => {
          this.handleIncomingMessage(event.data);
        };

        ws.onerror = (err: any) => {
          if (this.listenerCount('error') > 0) {
            this.emit('error', err);
          }
          if (!settled) {
            settled = true;
            reject(new Error(`Failed to connect to ${url}`));
          }
        };

        ws.onclose = () => {
          this.connected = false;
          this.emit('disconnected');

          if (!settled) {
            settled = true;
            reject(new Error(`WebSocket connection closed before opening: ${url}`));
          }

          if (!this.closedExplicitly) {
            this.scheduleReconnect();
          }
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Parses and validates incoming messages from the extension server.
   */
  private handleIncomingMessage(raw: unknown): void {
    if (typeof raw !== 'string') return;

    try {
      const msg: IPCServerMessage = JSON.parse(raw);
      const validation = validateIPCMessage(msg, 'server-to-client');
      if (!validation.valid) {
        return;
      }

      this.emit('message', msg);

      switch (msg.type) {
        case 'state_update':
          if (msg.payload) {
            const stateValidation = validateStatePayload(msg.payload);
            if (stateValidation.valid) {
              this.emit('state_update', msg.payload);
            }
          }
          break;

        case 'config_update':
          if (msg.config) {
            this.emit('config_update', msg.config);
          }
          break;

        case 'heartbeat':
          this.emit('heartbeat', msg.timestamp || Date.now());
          break;

        case 'ack':
          this.emit('ack', msg.messageId);
          break;
      }
    } catch (_e) {
      // Discard invalid JSON payloads gracefully
    }
  }

  /**
   * Sends an IPC message envelope to the extension server.
   */
  public send(message: IPCClientMessage): boolean {
    const validation = validateIPCMessage(message, 'client-to-server');
    if (!validation.valid) {
      return false;
    }

    if (!this.connected || !this.ws || this.ws.readyState !== 1) {
      this.pendingQueue.push(message);
      return false;
    }

    try {
      this.ws.send(JSON.stringify(message));
      return true;
    } catch (_e) {
      this.pendingQueue.push(message);
      return false;
    }
  }

  private flushQueue(): void {
    while (this.pendingQueue.length > 0 && this.connected && this.ws?.readyState === 1) {
      const next = this.pendingQueue.shift();
      if (next) {
        try {
          this.ws.send(JSON.stringify(next));
        } catch (_e) {
          this.pendingQueue.unshift(next);
          break;
        }
      }
    }
  }

  /**
   * Request Antigravity IDE window focus over the bridge.
   */
  public sendFocusRequest(): boolean {
    return this.send({ type: 'focus_ide' });
  }

  /**
   * Notify extension that the pet overlay is initialized and ready.
   */
  public sendPetReady(): boolean {
    return this.send({ type: 'pet_ready' });
  }

  /**
   * Notify extension that the overlay is closing.
   */
  public sendPetClose(): boolean {
    return this.send({ type: 'pet_close' });
  }

  /**
   * Notify extension of configuration updates.
   */
  public sendConfigUpdate(config: Partial<PetConfig>): boolean {
    return this.send({ type: 'config_update', config });
  }

  private scheduleReconnect(): void {
    if (this.closedExplicitly) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('reconnect_failed');
      return;
    }

    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {});
    }, this.reconnectIntervalMs);
  }

  /**
   * Disconnects cleanly and prevents automatic reconnection.
   */
  public disconnect(): void {
    this.closedExplicitly = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch (_e) {}
      this.ws = null;
    }
    this.connected = false;
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public setPort(port: number): void {
    if (this.port !== port) {
      this.port = port;
      if (this.connected) {
        this.disconnect();
        this.connect().catch(() => {});
      }
    }
  }
}
