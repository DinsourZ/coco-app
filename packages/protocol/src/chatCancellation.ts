// Ported from CoCo OS platform/web/src/api/chatCancellation.ts (MIT).

import { readExactJson } from './exactJson';

export interface ChatCancellation {
  schema_version: 1;
  scope: 'process';
  request_id: string;
  task_id: string | null;
  state: 'CANCEL_REQUESTED' | 'FINISHED';
}

export const validChatRequestId = (id: unknown): id is string =>
  typeof id === 'string' && /^[a-f0-9]{32}$/.exec(id)?.[0] === id;

export function generateChatRequestId(): string {
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function readChatCancellation(
  response: Response,
  expectedId: string,
): Promise<ChatCancellation> {
  const invalid = (): never => {
    throw new Error('Invalid chat cancellation response');
  };
  const raw = await readExactJson(response, 4096);
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return invalid();
  const row = raw as Record<string, unknown>;
  if (
    row.schema_version !== 1n ||
    row.scope !== 'process' ||
    !validChatRequestId(row.request_id) ||
    row.request_id !== expectedId ||
    typeof row.state !== 'string' ||
    !['CANCEL_REQUESTED', 'FINISHED'].includes(row.state) ||
    (row.task_id !== null &&
      (typeof row.task_id !== 'string' ||
        /^[A-Za-z0-9._-]{1,128}$/.exec(row.task_id)?.[0] !== row.task_id))
  ) {
    return invalid();
  }
  return {
    schema_version: 1,
    scope: 'process',
    request_id: row.request_id,
    task_id: row.task_id as string | null,
    state: row.state as ChatCancellation['state'],
  };
}
