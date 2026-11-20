export interface BackendConfig {
  /** Base HTTPS URL of the CoCo OS backend (e.g. https://coco.example.invalid). */
  baseUrl: string;
  /**
   * Explicitly allow cleartext HTTP/WS ONLY for local loopback development
   * (localhost, 127.0.0.1, [::1]). Never enabled for remote hosts.
   */
  allowInsecureLocalHttp?: boolean;
}

export interface ValidatedBackendEndpoints {
  httpBaseUrl: string;
  appWsUrl: string;
  isLoopbackHttp: boolean;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function validateBackendUrl(
  rawUrl: string,
  options: { allowInsecureLocalHttp?: boolean } = {},
): ValidatedBackendEndpoints {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error('Backend URL is required.');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Backend URL must be a valid absolute URL (e.g. https://coco.example.invalid).');
  }

  if (parsed.username || parsed.password) {
    throw new Error('Backend URL must not contain embedded credentials.');
  }
  if (parsed.search || parsed.hash) {
    throw new Error('Backend URL must not include query parameters or fragments.');
  }

  const protocol = parsed.protocol.toLowerCase();
  const hostname = parsed.hostname.toLowerCase();

  let isLoopbackHttp = false;
  if (protocol === 'https:') {
    isLoopbackHttp = false;
  } else if (protocol === 'http:') {
    if (!options.allowInsecureLocalHttp || !LOOPBACK_HOSTS.has(hostname)) {
      throw new Error(
        'HTTPS is required for remote CoCo backends. Cleartext HTTP is only allowed for local loopback development when explicitly enabled.',
      );
    }
    isLoopbackHttp = true;
  } else {
    throw new Error('Backend URL must use https:// (or loopback http:// for local dev).');
  }

  const cleanPath = parsed.pathname.replace(/\/+$/, '');
  const httpBaseUrl = `${parsed.origin}${cleanPath}`;
  const wsScheme = protocol === 'https:' ? 'wss:' : 'ws:';
  const appWsUrl = `${wsScheme}//${parsed.host}${cleanPath}/ws/app`;

  return {
    httpBaseUrl,
    appWsUrl,
    isLoopbackHttp,
  };
}
