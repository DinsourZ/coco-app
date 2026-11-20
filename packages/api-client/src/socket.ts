import type { AppSocketInboundEvent, AppSocketStatus } from '@coco/protocol';
import type { InMemoryAuthStore } from './authStore';
import { validateBackendUrl, type BackendConfig } from './config';

// Keepalive interval stays well inside backend app_ws_idle_timeout_s (default 300s).
export const APP_WS_KEEPALIVE_MS = 30_000;
export const APP_WS_RECONNECT_BASE_MS = 1_000;
export const APP_WS_RECONNECT_MAX_MS = 15_000;

export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'open', listener: () => void): void;
  addEventListener(type: 'message', listener: (ev: { data: unknown }) => void): void;
  addEventListener(type: 'error', listener: () => void): void;
  addEventListener(type: 'close', listener: (ev?: { code?: number; reason?: string }) => void): void;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

export interface OpenAppSocketOptions {
  config: BackendConfig;
  auth: InMemoryAuthStore;
  onMessage: (event: AppSocketInboundEvent) => void;
  onStatus?: (status: AppSocketStatus) => void;
  webSocketFactory?: WebSocketFactory;
  keepaliveMs?: number;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
}

export interface AppSocketHandle {
  close: () => void;
  sendJson: (frame: Record<string, unknown>) => boolean;
}

const WS_OPEN = 1;

/**
 * Opens `/ws/app` using the CoCo OS first-frame auth protocol (`app.auth`).
 *
 * Security invariants:
 * - Never appends tokens to URL query parameters or cookies.
 * - Requires an in-memory `console` bearer token (fails closed with `no_token`).
 * - Sends periodic `ping` frames inside the backend idle timeout.
 */
export function openAppSocket(options: OpenAppSocketOptions): AppSocketHandle | null {
  const token = options.auth.getToken('console');
  if (!token) {
    options.onStatus?.('no_token');
    return null;
  }

  const { appWsUrl } = validateBackendUrl(options.config.baseUrl, {
    allowInsecureLocalHttp: options.config.allowInsecureLocalHttp,
  });

  const factory: WebSocketFactory =
    options.webSocketFactory ??
    ((url: string) => new WebSocket(url) as unknown as WebSocketLike);

  const keepaliveMs = options.keepaliveMs ?? APP_WS_KEEPALIVE_MS;
  const reconnectBaseMs = options.reconnectBaseMs ?? APP_WS_RECONNECT_BASE_MS;
  const reconnectMaxMs = options.reconnectMaxMs ?? APP_WS_RECONNECT_MAX_MS;

  let closedByUser = false;
  let ws: WebSocketLike | null = null;
  let keepaliveTimer: ReturnType<typeof setInterval> | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;

  const clearTimers = () => {
    if (keepaliveTimer !== undefined) {
      clearInterval(keepaliveTimer);
      keepaliveTimer = undefined;
    }
    if (reconnectTimer !== undefined) {
      clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    }
  };

  const connect = () => {
    if (closedByUser) return;
    clearTimers();

    const currentToken = options.auth.getToken('console');
    if (!currentToken) {
      options.onStatus?.('no_token');
      return;
    }

    options.onStatus?.(attempt === 0 ? 'connecting' : 'reconnecting');

    const socket = factory(appWsUrl);
    ws = socket;

    socket.addEventListener('open', () => {
      if (closedByUser || ws !== socket) return;
      // Authenticate exclusively via first application frame.
      socket.send(JSON.stringify({ type: 'app.auth', token: currentToken }));
      attempt = 0;
      options.onStatus?.('connected');
      keepaliveTimer = setInterval(() => {
        if (socket.readyState === WS_OPEN) {
          socket.send(JSON.stringify({ type: 'ping' }));
        }
      }, keepaliveMs);
    });

    socket.addEventListener('message', (ev) => {
      if (typeof ev.data !== 'string') return;
      try {
        const parsed = JSON.parse(ev.data) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const record = parsed as Record<string, unknown>;
          if (typeof record.type === 'string') {
            options.onMessage(record as AppSocketInboundEvent);
          }
        }
      } catch {
        // Ignore malformed server frames rather than crashing the UI.
      }
    });

    socket.addEventListener('error', () => {
      if (ws === socket) {
        options.onStatus?.('error');
      }
    });

    socket.addEventListener('close', (ev) => {
      if (keepaliveTimer !== undefined) {
        clearInterval(keepaliveTimer);
        keepaliveTimer = undefined;
      }
      if (ws === socket) {
        ws = null;
      }
      if (closedByUser) {
        options.onStatus?.('disconnected');
        return;
      }
      // Policy violation (1008) indicates auth rejection: stop reconnecting aggressively.
      if (ev?.code === 1008) {
        options.onStatus?.('error');
        return;
      }
      options.onStatus?.('reconnecting');
      const delay = Math.min(reconnectMaxMs, reconnectBaseMs * 2 ** Math.min(attempt, 4));
      attempt += 1;
      reconnectTimer = setTimeout(connect, delay);
    });
  };

  connect();

  return {
    sendJson: (frame: Record<string, unknown>) => {
      if (!ws || ws.readyState !== WS_OPEN) return false;
      ws.send(JSON.stringify(frame));
      return true;
    },
    close: () => {
      closedByUser = true;
      clearTimers();
      if (ws) {
        try {
          ws.close();
        } catch {
          // Ignore close errors.
        }
        ws = null;
      }
      options.onStatus?.('disconnected');
    },
  };
}
