import { describe, expect, it, vi } from 'vitest';
import { InMemoryAuthStore, openAppSocket, type WebSocketLike } from '@coco/api-client';
import type { AppSocketStatus } from '@coco/protocol';
import { SYNTHETIC_CONSOLE_TOKEN, SYNTHETIC_HTTPS_URL } from './fixtures/synthetic';

class FakeWebSocket implements WebSocketLike {
  readyState = 0;
  sent: string[] = [];
  closed = false;
  private listeners = new Map<string, Array<(ev: any) => void>>();

  constructor(public readonly url: string) {}

  addEventListener(type: string, listener: (ev: any) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
    this.readyState = 3;
    this.emit('close', { code: 1000 });
  }

  emit(type: string, ev?: unknown): void {
    if (type === 'open') this.readyState = 1;
    if (type === 'close') this.readyState = 3;
    (this.listeners.get(type) ?? []).forEach((fn) => fn(ev));
  }
}

describe('/ws/app socket client', () => {
  it('fails closed with no_token when console token is missing', () => {
    const auth = new InMemoryAuthStore();
    const statuses: AppSocketStatus[] = [];
    const handle = openAppSocket({
      config: { baseUrl: SYNTHETIC_HTTPS_URL },
      auth,
      onMessage: () => {},
      onStatus: (s) => statuses.push(s),
    });
    expect(handle).toBeNull();
    expect(statuses).toEqual(['no_token']);
  });

  it('authenticates via first app.auth frame, never in URL, and sends keepalive pings', () => {
    vi.useFakeTimers();
    try {
      const auth = new InMemoryAuthStore();
      auth.setToken('console', SYNTHETIC_CONSOLE_TOKEN);
      let created: FakeWebSocket | null = null;
      const received: Array<{ type: string }> = [];
      const statuses: AppSocketStatus[] = [];

      const handle = openAppSocket({
        config: { baseUrl: SYNTHETIC_HTTPS_URL },
        auth,
        keepaliveMs: 1000,
        onMessage: (m) => received.push(m),
        onStatus: (s) => statuses.push(s),
        webSocketFactory: (url) => {
          created = new FakeWebSocket(url);
          return created;
        },
      });

      expect(handle).not.toBeNull();
      expect(created!.url).toBe('wss://coco.example.invalid/ws/app');
      expect(created!.url).not.toContain(SYNTHETIC_CONSOLE_TOKEN);

      created!.emit('open');
      expect(JSON.parse(created!.sent[0])).toEqual({
        type: 'app.auth',
        token: SYNTHETIC_CONSOLE_TOKEN,
      });
      expect(statuses).toContain('connected');

      vi.advanceTimersByTime(1000);
      expect(JSON.parse(created!.sent[1])).toEqual({ type: 'ping' });

      created!.emit('message', {
        data: JSON.stringify({ type: 'app.device_update', device_id: 'synth-coco-01' }),
      });
      expect(received).toHaveLength(1);
      expect(received[0].type).toBe('app.device_update');

      handle!.close();
      expect(created!.closed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
