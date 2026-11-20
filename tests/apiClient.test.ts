import { describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  HttpCoCoClient,
  InMemoryAuthStore,
  operatorErrorMessage,
} from '@coco/api-client';
import {
  SYNTHETIC_APPROVER_TOKEN,
  SYNTHETIC_CONSOLE_TOKEN,
  SYNTHETIC_CONTROL_SESSION,
  SYNTHETIC_DEVICE_ONLINE,
  SYNTHETIC_HEALTH,
  SYNTHETIC_HTTPS_URL,
} from './fixtures/synthetic';

describe('HttpCoCoClient backend contract', () => {
  it('calls GET /health without auth header and omits credentials', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(SYNTHETIC_HEALTH), { status: 200 }),
    );
    const auth = new InMemoryAuthStore();
    const client = new HttpCoCoClient({
      config: { baseUrl: SYNTHETIC_HTTPS_URL },
      auth,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const health = await client.health();
    expect(health.version).toBe('0.1.0-test');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${SYNTHETIC_HTTPS_URL}/health`);
    expect(init.credentials).toBe('omit');
  });

  it('sends real /api/chat payload with console Bearer token and request_id', async () => {
    const reqId = 'abcdef0123456789abcdef0123456789';
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            conversation_id: 'conv-01',
            text: 'Synthetic reply',
            tool_calls: [],
            ai_backend: 'openai_compatible',
          }),
          { status: 200 },
        ),
    );
    const auth = new InMemoryAuthStore();
    auth.setToken('console', SYNTHETIC_CONSOLE_TOKEN);
    const client = new HttpCoCoClient({
      config: { baseUrl: SYNTHETIC_HTTPS_URL },
      auth,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const resp = await client.chat('hello', 'synth-coco-01', 'conv-01', { requestId: reqId });
    expect(resp.text).toBe('Synthetic reply');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${SYNTHETIC_HTTPS_URL}/api/chat`);
    expect((init.headers as Headers).get('Authorization')).toBe(
      `Bearer ${SYNTHETIC_CONSOLE_TOKEN}`,
    );
    expect(JSON.parse(init.body as string)).toEqual({
      text: 'hello',
      device_id: 'synth-coco-01',
      request_id: reqId,
      conversation_id: 'conv-01',
      remember: true,
    });
  });

  it('issues emergencyStop WITHOUT control context preconditions and never fakes failure as success', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({ sent: { id: 'cmd-stop-1', action: 'motion.stop' } }),
          { status: 200 },
        ),
    );
    const auth = new InMemoryAuthStore();
    auth.setToken('console', SYNTHETIC_CONSOLE_TOKEN);
    const client = new HttpCoCoClient({
      config: { baseUrl: SYNTHETIC_HTTPS_URL },
      auth,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const res = await client.emergencyStop('synth-coco-01');
    expect(res.sent.action).toBe('motion.stop');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${SYNTHETIC_HTTPS_URL}/api/devices/synth-coco-01/motion/stop`);
    const headers = init.headers as Headers;
    expect(headers.get('X-CoCo-Control-Session')).toBeNull();
    expect(headers.get('X-CoCo-Control-Generation')).toBeNull();
  });

  it('attaches X-CoCo-Control-* headers on ordinary device commands', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ sent: {} }), { status: 200 }),
    );
    const auth = new InMemoryAuthStore();
    auth.setToken('console', SYNTHETIC_CONSOLE_TOKEN);
    const client = new HttpCoCoClient({
      config: { baseUrl: SYNTHETIC_HTTPS_URL },
      auth,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await client.beep('synth-coco-01', {
      control_session_id: SYNTHETIC_CONTROL_SESSION,
      connection_generation: 7,
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get('X-CoCo-Control-Session')).toBe(SYNTHETIC_CONTROL_SESSION);
    expect(headers.get('X-CoCo-Control-Generation')).toBe('7');
  });

  it('enforces role separation for approver endpoints and normalizes device display', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/api/devices')) {
        return new Response(
          JSON.stringify([
            SYNTHETIC_DEVICE_ONLINE,
            { ...SYNTHETIC_DEVICE_ONLINE, device_id: 'synth-coco-02', online: false },
          ]),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const auth = new InMemoryAuthStore();
    auth.setToken('console', SYNTHETIC_CONSOLE_TOKEN);
    const client = new HttpCoCoClient({
      config: { baseUrl: SYNTHETIC_HTTPS_URL },
      auth,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const list = await client.devices();
    expect(list[0].display?.visible).toBe('normal');
    // Offline device display must be cleared to null
    expect(list[1].display).toBeNull();

    // Approver endpoint must fail closed without approver token
    await expect(client.approvals()).rejects.toThrow('approver access token is not set');
    auth.setToken('approver', SYNTHETIC_APPROVER_TOKEN);
    expect(await client.approvals()).toEqual([]);
  });

  it('maps structured backend errors into operator-safe messages', () => {
    expect(operatorErrorMessage(new ApiError(401, 'raw'))).toMatch(/Access denied/);
    expect(operatorErrorMessage(new ApiError(409, 'raw', 'CONTROL_CONTEXT_STALE'))).toMatch(
      /Device connection changed/,
    );
    expect(operatorErrorMessage(new ApiError(404, 'raw', 'CHAT_DEVICE_OFFLINE'))).toMatch(
      /target device is offline/,
    );
  });
});
