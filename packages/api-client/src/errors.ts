// Ported from CoCo OS platform/web/src/api/client.ts (MIT).
// Converts low-level HTTP/network errors into operator-safe UI text without
// leaking raw proxy bodies, stack traces, or echoed credentials.

export class ApiError extends Error {
  status: number;
  errorCode?: string;
  body?: unknown;

  constructor(status: number, message: string, errorCode?: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errorCode = errorCode;
    this.body = body;
  }
}

export function operatorErrorMessage(error: unknown, fallback = 'Request failed.'): string {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return 'Access denied — check the role-specific in-memory token.';
    }
    if (error.status === 404 && error.errorCode === 'CHAT_DEVICE_OFFLINE') {
      return 'The target device is offline. Connect it before sending a device command.';
    }
    if (error.status === 400 && error.errorCode === 'CONTROL_CONTEXT_INVALID') {
      return 'Control context is invalid. Refresh device state before confirming a command.';
    }
    if (error.status === 409) {
      if (error.errorCode === 'CONTROL_CONTEXT_STALE') {
        return 'Device connection changed. Refresh device state and confirm the command again.';
      }
      if (error.errorCode === 'CHAT_CANCELLED') {
        return 'This chat turn was cancelled. Previously executed actions are not rolled back, and pending approvals still require review.';
      }
      if (error.errorCode === 'CHAT_REQUEST_CONFLICT') {
        return 'Chat request ID was already used; not executed again.';
      }
      if (error.errorCode === 'CHAT_HISTORY_FULL') {
        return 'Saved conversation limit reached. Delete an older conversation before starting a new one.';
      }
      if (error.errorCode === 'CHAT_HISTORY_BUSY') {
        return 'This conversation is currently busy. Wait for the active request to finish.';
      }
      if (error.errorCode === 'CHAT_STOP_SUPERSEDED') {
        return 'This chat request was stopped. Send a new command only when ready.';
      }
      if (error.errorCode === 'CHAT_SESSION_CHANGED') {
        return 'The device connection changed. Check the device before sending a new command.';
      }
      return 'Device busy — wait for the current command or press STOP.';
    }
    if (error.status === 429) {
      return 'Too many requests — retry shortly.';
    }
    if (error.status >= 500) {
      if (error.errorCode === 'CHAT_CANCELLATION_CAPACITY') {
        return 'Chat cancellation registry is at capacity. Retry shortly; device STOP remains independently accessible.';
      }
      if (error.errorCode?.startsWith('CHAT_HISTORY_')) {
        return 'Conversation storage is temporarily unavailable; new request was not admitted.';
      }
      if (error.errorCode === 'TASK_CAPACITY') {
        return 'Task state capacity is full. Check operations status before retrying.';
      }
      if (error.errorCode === 'TASK_STATE_UNAVAILABLE') {
        return 'Task state is unavailable; the request was not admitted.';
      }
      return 'Backend temporarily unavailable.';
    }
    return `${fallback} (HTTP ${error.status})`;
  }
  if (error instanceof TypeError) {
    return 'Network request failed. Check backend URL and TLS reachability.';
  }
  if (error instanceof Error && error.message.endsWith('access token is not set')) {
    return error.message;
  }
  return fallback;
}
