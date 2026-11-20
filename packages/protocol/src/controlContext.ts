// Ported from CoCo OS platform/web/src/api/controlContext.ts (MIT).
// Public connection observation used as a server-checked command precondition.
// Note: Emergency STOP deliberately omits these headers so it is never blocked
// by stale UI observation state.

export interface ControlContext {
  control_session_id: string;
  connection_generation: number;
}

export function readControlContext(value: unknown): ControlContext | null {
  if (!value || typeof value !== 'object') return null;
  const context = value as Record<string, unknown>;
  if (
    typeof context.control_session_id !== 'string' ||
    context.control_session_id.length !== 32 ||
    !/^[0-9a-f]{32}$/.test(context.control_session_id) ||
    typeof context.connection_generation !== 'number' ||
    !Number.isSafeInteger(context.connection_generation) ||
    context.connection_generation < 1
  ) {
    return null;
  }
  return {
    control_session_id: context.control_session_id,
    connection_generation: context.connection_generation,
  };
}

export function controlContextKey(
  deviceId: string,
  revision: number,
  context: ControlContext | null,
): string {
  return JSON.stringify([
    deviceId,
    revision,
    context?.control_session_id ?? null,
    context?.connection_generation ?? null,
  ]);
}

export function controlContextHeaders(value?: ControlContext): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  const context = readControlContext(value);
  if (!context) throw new Error('Invalid control connection context');
  return {
    'X-CoCo-Control-Session': context.control_session_id,
    'X-CoCo-Control-Generation': String(context.connection_generation),
  };
}
