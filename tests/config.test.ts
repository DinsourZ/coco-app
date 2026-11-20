import { describe, expect, it } from 'vitest';
import { InMemoryAuthStore, validateBackendUrl } from '@coco/api-client';
import { SYNTHETIC_CONSOLE_TOKEN, SYNTHETIC_HTTPS_URL } from './fixtures/synthetic';

describe('backend URL validation & auth store', () => {
  it('accepts HTTPS URLs and derives WSS /ws/app endpoint', () => {
    const result = validateBackendUrl(`${SYNTHETIC_HTTPS_URL}/`);
    expect(result.httpBaseUrl).toBe(SYNTHETIC_HTTPS_URL);
    expect(result.appWsUrl).toBe('wss://coco.example.invalid/ws/app');
    expect(result.isLoopbackHttp).toBe(false);
  });

  it('rejects cleartext HTTP for remote hosts even when local HTTP is allowed', () => {
    expect(() =>
      validateBackendUrl('http://coco.example.invalid', { allowInsecureLocalHttp: true }),
    ).toThrow(/HTTPS is required/);
  });

  it('allows loopback HTTP only when explicitly enabled for local dev', () => {
    expect(() => validateBackendUrl('http://127.0.0.1:8787')).toThrow(/HTTPS is required/);
    const local = validateBackendUrl('http://127.0.0.1:8787', {
      allowInsecureLocalHttp: true,
    });
    expect(local.appWsUrl).toBe('ws://127.0.0.1:8787/ws/app');
    expect(local.isLoopbackHttp).toBe(true);
  });

  it('rejects embedded credentials, query strings, and fragments', () => {
    expect(() => validateBackendUrl('https://user:pass@coco.example.invalid')).toThrow(
      /embedded credentials/,
    );
    expect(() => validateBackendUrl('https://coco.example.invalid?token=abc')).toThrow(
      /query parameters/,
    );
  });

  it('tracks isolated role tokens and increments revisions on update', () => {
    const store = new InMemoryAuthStore();
    expect(store.getRevision()).toBe(0);
    store.setToken('console', `  ${SYNTHETIC_CONSOLE_TOKEN}  `);
    expect(store.getToken('console')).toBe(SYNTHETIC_CONSOLE_TOKEN);
    expect(store.getToken('approver')).toBe('');
    expect(store.getRevision('console')).toBe(1);
    expect(store.getRevision('approver')).toBe(0);
    store.clearAll();
    expect(store.hasToken('console')).toBe(false);
  });
});
