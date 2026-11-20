import {
  controlContextHeaders,
  isValidDeviceId,
  readApprovalDecision,
  readApprovals,
  readChatCancellation,
  readDisplayObservation,
  readOwnedApprovals,
  readWithdrawnApproval,
  validApprovalId,
  validChatRequestId,
  type AccessRole,
  type Approval,
  type CanceledDevicePairingTicket,
  type ChatCancellation,
  type ChatResponse,
  type ControlContext,
  type ConversationList,
  type CreatedDevicePairingTicket,
  type DeviceCredentialList,
  type DeviceInfo,
  type DevicePairingTicketList,
  type HealthInfo,
  type IssuedDeviceCredential,
  type LanguageSettings,
  type MotionAction,
  type MotionCommandResponse,
  type OwnedApproval,
  type OwnedApprovals,
  type RevokedDeviceCredential,
  type SavedConversation,
  type SavedTranscript,
  type VoiceRuntimeStatus,
} from '@coco/protocol';
import type { InMemoryAuthStore } from './authStore';
import { validateBackendUrl, type BackendConfig } from './config';
import { ApiError } from './errors';
import type { ChatRequestOptions, CoCoClient } from './interfaces';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const nonNegativeNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

const validConversationId = (id: unknown): id is string =>
  typeof id === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(id);

const pathPart = (value: string): string => encodeURIComponent(value);

function readConversations(value: unknown): ConversationList {
  if (
    !isRecord(value) ||
    typeof value.enabled !== 'boolean' ||
    !Array.isArray(value.conversations) ||
    value.conversations.length > 256 ||
    (!value.enabled && value.conversations.length > 0)
  ) {
    throw new ApiError(502, 'Invalid conversation history response');
  }
  const conversations = value.conversations.map((row: unknown) => {
    if (
      !isRecord(row) ||
      !validConversationId(row.conversation_id) ||
      typeof row.title !== 'string' ||
      Array.from(row.title).length > 80 ||
      nonNegativeNumber(row.created_at) === null ||
      nonNegativeNumber(row.updated_at) === null ||
      !Number.isSafeInteger(row.pairs) ||
      Number(row.pairs) < 0 ||
      Number(row.pairs) > 32
    ) {
      throw new ApiError(502, 'Invalid conversation history response');
    }
    return row as unknown as SavedConversation;
  });
  if (new Set(conversations.map((row) => row.conversation_id)).size !== conversations.length) {
    throw new ApiError(502, 'Invalid conversation history response');
  }
  return { enabled: value.enabled, conversations };
}

function readTranscript(value: unknown, id: string): SavedTranscript {
  if (
    !isRecord(value) ||
    value.conversation_id !== id ||
    !Array.isArray(value.messages) ||
    value.messages.length > 64 ||
    value.messages.length % 2 !== 0 ||
    value.messages.some(
      (row: unknown, index: number) =>
        !isRecord(row) ||
        row.role !== (index % 2 ? 'assistant' : 'user') ||
        typeof row.content !== 'string' ||
        Array.from(row.content).length > 2000,
    )
  ) {
    throw new ApiError(502, 'Invalid conversation transcript response');
  }
  return value as unknown as SavedTranscript;
}

async function parseJsonOrThrow<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    let body: unknown = null;
    let text = '';
    try {
      text = await resp.text();
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    const envelope = isRecord(body) ? body : undefined;
    const detail = isRecord(envelope?.detail) ? envelope.detail : undefined;
    const errorCode =
      (typeof envelope?.code === 'string' && envelope.code) ||
      (typeof detail?.error_code === 'string' && detail.error_code) ||
      (typeof detail?.error === 'string' && detail.error) ||
      undefined;
    if (resp.status === 409 && !errorCode) {
      throw new ApiError(
        409,
        'busy 409: device has an in-flight command — wait or press STOP',
        'busy',
        body,
      );
    }
    const message =
      (detail && typeof detail.message === 'string' && detail.message) ||
      `${resp.status}${text ? ` ${text.slice(0, 500)}` : ''}`;
    throw new ApiError(resp.status, message, errorCode, body);
  }
  return (await resp.json()) as T;
}

export interface HttpCoCoClientOptions {
  config: BackendConfig;
  auth: InMemoryAuthStore;
  fetchImpl?: typeof fetch;
}

/**
 * Production HTTP client aligned with CoCo OS backend REST endpoints.
 *
 * Security & safety guarantees:
 * - Never sends credentials via URL query strings or cookies (`credentials: 'omit'`).
 * - Enforces role-scoped in-memory Bearer tokens (`console` / `approver`).
 * - Never bypasses backend policy or fabricates command success.
 * - `emergencyStop` calls `POST /api/devices/{id}/motion/stop` without
 *   `X-CoCo-Control-*` preconditions, matching backend STOP semantics.
 */
export class HttpCoCoClient implements CoCoClient {
  readonly mode = 'live' as const;
  private readonly httpBaseUrl: string;
  private readonly auth: InMemoryAuthStore;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpCoCoClientOptions) {
    const validated = validateBackendUrl(options.config.baseUrl, {
      allowInsecureLocalHttp: options.config.allowInsecureLocalHttp,
    });
    this.httpBaseUrl = validated.httpBaseUrl;
    this.auth = options.auth;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  private url(path: string): string {
    return `${this.httpBaseUrl}${path}`;
  }

  private async publicFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetchImpl(this.url(path), {
      ...init,
      credentials: 'omit',
      cache: 'no-store',
    });
    return parseJsonOrThrow<T>(response);
  }

  private async authFetch<T>(
    role: AccessRole,
    path: string,
    init: RequestInit = {},
    readResponse?: (response: Response) => Promise<T>,
  ): Promise<T> {
    const token = this.auth.getToken(role);
    if (!token) {
      throw new Error(`${role} access token is not set`);
    }
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    const response = await this.fetchImpl(this.url(path), {
      ...init,
      headers,
      credentials: 'omit',
      cache: 'no-store',
    });
    return readResponse ? readResponse(response) : parseJsonOrThrow<T>(response);
  }

  health(signal?: AbortSignal): Promise<HealthInfo> {
    return this.publicFetch<HealthInfo>('/health', { signal });
  }

  chat(
    text: string,
    deviceId?: string,
    conversationId?: string,
    options: ChatRequestOptions = {},
  ): Promise<ChatResponse> {
    if (options.requestId !== undefined && !validChatRequestId(options.requestId)) {
      return Promise.reject(new Error('Invalid chat request identity'));
    }
    return this.authFetch<ChatResponse>('console', '/api/chat', {
      method: 'POST',
      signal: options.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        device_id: deviceId ?? null,
        ...(options.requestId ? { request_id: options.requestId } : {}),
        ...(conversationId ? { conversation_id: conversationId, remember: true } : {}),
      }),
    });
  }

  cancelChatRequest(requestId: string, signal?: AbortSignal): Promise<ChatCancellation> {
    if (!validChatRequestId(requestId)) {
      return Promise.reject(new Error('Invalid chat request identity'));
    }
    return this.authFetch<ChatCancellation>(
      'console',
      `/api/chat/requests/${pathPart(requestId)}/cancel`,
      { method: 'POST', signal },
      async (response) => {
        if (response.status !== 202) {
          void response.body?.cancel?.().catch(() => {});
          throw new ApiError(response.status, 'Chat cancellation could not be confirmed');
        }
        return readChatCancellation(response, requestId);
      },
    );
  }

  chatConversations(signal?: AbortSignal): Promise<ConversationList> {
    return this.authFetch<unknown>('console', '/api/chat/conversations', { signal }).then(
      readConversations,
    );
  }

  chatConversation(id: string, signal?: AbortSignal): Promise<SavedTranscript> {
    if (!validConversationId(id)) {
      return Promise.reject(new Error('Invalid conversation identity'));
    }
    return this.authFetch<unknown>(
      'console',
      `/api/chat/conversations/${pathPart(id)}`,
      { signal },
    ).then((value) => readTranscript(value, id));
  }

  deleteChatConversation(id: string, signal?: AbortSignal): Promise<{ deleted: true }> {
    if (!validConversationId(id)) {
      return Promise.reject(new Error('Invalid conversation identity'));
    }
    return this.authFetch<unknown>(
      'console',
      `/api/chat/conversations/${pathPart(id)}`,
      { method: 'DELETE', signal },
    ).then((value) => {
      if (!isRecord(value) || value.deleted !== true) {
        throw new ApiError(502, 'Invalid conversation deletion response');
      }
      return { deleted: true as const };
    });
  }

  devices(signal?: AbortSignal): Promise<DeviceInfo[]> {
    return this.authFetch<DeviceInfo[]>('console', '/api/devices', { signal }).then((devices) => {
      if (!Array.isArray(devices) || devices.length > 4096 || devices.some((d) => !isRecord(d))) {
        throw new ApiError(502, 'Invalid devices response');
      }
      return devices.map((device) => ({
        ...device,
        display:
          device.online && device.lease_status === 'active'
            ? readDisplayObservation(device.display)
            : null,
      }));
    });
  }

  emergencyStop(deviceId: string, signal?: AbortSignal): Promise<MotionCommandResponse> {
    if (!isValidDeviceId(deviceId)) {
      return Promise.reject(new Error('Invalid device identity'));
    }
    return this.authFetch<MotionCommandResponse>(
      'console',
      `/api/devices/${pathPart(deviceId)}/motion/stop`,
      { method: 'POST', signal },
    );
  }

  motion(
    deviceId: string,
    action: MotionAction,
    context?: ControlContext,
    signal?: AbortSignal,
  ): Promise<MotionCommandResponse> {
    if (!isValidDeviceId(deviceId)) {
      return Promise.reject(new Error('Invalid device identity'));
    }
    return this.authFetch<MotionCommandResponse>(
      'console',
      `/api/devices/${pathPart(deviceId)}/motion/${pathPart(action)}`,
      {
        method: 'POST',
        signal,
        headers: action === 'stop' ? undefined : controlContextHeaders(context),
      },
    );
  }

  face(
    deviceId: string,
    expression: 'normal' | 'happy' | 'sleep' | 'error',
    context?: ControlContext,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    if (!isValidDeviceId(deviceId)) {
      return Promise.reject(new Error('Invalid device identity'));
    }
    return this.authFetch<Record<string, unknown>>(
      'console',
      `/api/devices/${pathPart(deviceId)}/face/${pathPart(expression)}`,
      {
        method: 'POST',
        signal,
        headers: controlContextHeaders(context),
      },
    );
  }

  beep(
    deviceId: string,
    context?: ControlContext,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    if (!isValidDeviceId(deviceId)) {
      return Promise.reject(new Error('Invalid device identity'));
    }
    return this.authFetch<Record<string, unknown>>(
      'console',
      `/api/devices/${pathPart(deviceId)}/beep`,
      {
        method: 'POST',
        signal,
        headers: controlContextHeaders(context),
      },
    );
  }

  pairingTickets(signal?: AbortSignal): Promise<DevicePairingTicketList> {
    return this.authFetch<DevicePairingTicketList>('console', '/api/device-pairing/tickets', {
      signal,
    });
  }

  createPairingTicket(deviceId: string, signal?: AbortSignal): Promise<CreatedDevicePairingTicket> {
    if (!isValidDeviceId(deviceId)) {
      return Promise.reject(new Error('Invalid device identity'));
    }
    return this.authFetch<CreatedDevicePairingTicket>(
      'console',
      `/api/device-pairing/tickets/${pathPart(deviceId)}`,
      { method: 'POST', signal },
    );
  }

  cancelPairingTicket(ticketId: string, signal?: AbortSignal): Promise<CanceledDevicePairingTicket> {
    return this.authFetch<CanceledDevicePairingTicket>(
      'console',
      `/api/device-pairing/tickets/${pathPart(ticketId)}`,
      { method: 'DELETE', signal },
    );
  }

  deviceCredentials(signal?: AbortSignal): Promise<DeviceCredentialList> {
    return this.authFetch<DeviceCredentialList>('console', '/api/devices/credentials', { signal });
  }

  rotateDeviceCredential(deviceId: string, signal?: AbortSignal): Promise<IssuedDeviceCredential> {
    if (!isValidDeviceId(deviceId)) {
      return Promise.reject(new Error('Invalid device identity'));
    }
    return this.authFetch<IssuedDeviceCredential>(
      'console',
      `/api/devices/${pathPart(deviceId)}/credential/rotate`,
      { method: 'POST', signal },
    );
  }

  revokeDeviceCredential(deviceId: string, signal?: AbortSignal): Promise<RevokedDeviceCredential> {
    if (!isValidDeviceId(deviceId)) {
      return Promise.reject(new Error('Invalid device identity'));
    }
    return this.authFetch<RevokedDeviceCredential>(
      'console',
      `/api/devices/${pathPart(deviceId)}/credential`,
      { method: 'DELETE', signal },
    );
  }

  ownedApprovals(signal?: AbortSignal): Promise<OwnedApprovals> {
    return this.authFetch<OwnedApprovals>(
      'console',
      '/api/approvals/mine',
      { signal },
      async (response) => {
        if (!response.ok) {
          void response.body?.cancel?.().catch(() => {});
          throw new ApiError(response.status, 'Owned approval state unavailable');
        }
        return readOwnedApprovals(response);
      },
    );
  }

  withdrawApproval(id: string, signal?: AbortSignal): Promise<OwnedApproval> {
    if (!validApprovalId(id)) {
      return Promise.reject(new Error('Invalid approval identity'));
    }
    return this.authFetch<OwnedApproval>(
      'console',
      `/api/approvals/${pathPart(id)}/withdraw`,
      { method: 'POST', signal },
      async (response) => {
        if (response.status !== 200) {
          void response.body?.cancel?.().catch(() => {});
          throw new ApiError(response.status, 'Withdrawal result not confirmed');
        }
        return readWithdrawnApproval(response, id);
      },
    );
  }

  approvals(signal?: AbortSignal): Promise<Approval[]> {
    return this.authFetch<Approval[]>('approver', '/api/approvals', { signal }, async (response) => {
      if (!response.ok) {
        void response.body?.cancel?.().catch(() => {});
        throw new ApiError(response.status, 'Approvals unavailable');
      }
      return readApprovals(response);
    });
  }

  approve(id: string, signal?: AbortSignal): Promise<Approval> {
    if (!validApprovalId(id)) {
      return Promise.reject(new Error('Invalid approval identity'));
    }
    return this.authFetch<Approval>(
      'approver',
      `/api/approvals/${pathPart(id)}/approve`,
      { method: 'POST', signal },
      async (response) => {
        if (!response.ok) {
          void response.body?.cancel?.().catch(() => {});
          throw new ApiError(response.status, 'Approval result not confirmed');
        }
        return readApprovalDecision(response, id, 'approve');
      },
    );
  }

  reject(id: string, signal?: AbortSignal): Promise<Approval> {
    if (!validApprovalId(id)) {
      return Promise.reject(new Error('Invalid approval identity'));
    }
    return this.authFetch<Approval>(
      'approver',
      `/api/approvals/${pathPart(id)}/reject`,
      { method: 'POST', signal },
      async (response) => {
        if (!response.ok) {
          void response.body?.cancel?.().catch(() => {});
          throw new ApiError(response.status, 'Rejection result not confirmed');
        }
        return readApprovalDecision(response, id, 'reject');
      },
    );
  }

  getLanguage(signal?: AbortSignal): Promise<LanguageSettings> {
    return this.publicFetch<LanguageSettings>('/api/settings/language', { signal });
  }

  setLanguage(language: string, signal?: AbortSignal): Promise<LanguageSettings> {
    return this.authFetch<LanguageSettings>('console', '/api/settings/language', {
      method: 'PUT',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language }),
    });
  }

  getVoiceRuntime(signal?: AbortSignal): Promise<VoiceRuntimeStatus> {
    return this.publicFetch<VoiceRuntimeStatus>('/api/voice/runtime', { signal });
  }
}
