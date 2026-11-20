// Ported from CoCo OS platform/web/src/api/ownedApprovals.ts (MIT).

import { readExactJson } from './exactJson';

export type ApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'withdrawn'
  | 'executed'
  | 'failed';

export interface OwnedApproval {
  approval_id: string;
  tool: string;
  status: ApprovalStatus;
  created_at: number;
  expires_at: number;
  decided_at: number | null;
  reason_summary: string;
  arguments_summary: string;
  summary_truncated: boolean;
  payload_digest: string;
  task_id: string | null;
  withdrawable: boolean;
}

export interface OwnedApprovals {
  schema_version: 1;
  scope: 'requester_owned';
  storage: 'PERSISTENT' | 'PROCESS_LOCAL';
  generated_at: number;
  limit: number;
  has_more: boolean;
  approvals: OwnedApproval[];
}

export const validApprovalId = (id: unknown): id is string =>
  typeof id === 'string' && /^[A-Za-z0-9._-]{1,128}$/.exec(id)?.[0] === id;

const invalid = (): never => {
  throw new Error('Invalid owned approval response');
};

const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : invalid();

const bool = (value: unknown): boolean => (typeof value === 'boolean' ? value : invalid());

const text = (value: unknown, pattern: RegExp): string =>
  typeof value === 'string' && pattern.exec(value)?.[0] === value ? value : invalid();

const identifier = (value: unknown): string => (validApprovalId(value) ? value : invalid());

const summary = (value: unknown, limit: number): string =>
  typeof value === 'string' && [...value].length <= limit ? value : invalid();

const time = (value: unknown): number => {
  const numeric = typeof value === 'bigint' ? Number(value) : value;
  return typeof numeric === 'number' &&
    Number.isFinite(numeric) &&
    numeric >= 0 &&
    numeric <= 253_402_300_799
    ? numeric
    : invalid();
};

const nullable = <T>(value: unknown, reader: (item: unknown) => T): T | null =>
  value === null ? null : reader(value);

function decodeApproval(raw: unknown): OwnedApproval {
  const row = object(raw);
  const status = text(
    row.status,
    /^(pending|approved|rejected|expired|withdrawn|executed|failed)$/,
  ) as ApprovalStatus;
  const result: OwnedApproval = {
    approval_id: identifier(row.approval_id),
    tool: text(row.tool, /^[A-Za-z0-9_.-]{1,128}$/),
    status,
    created_at: time(row.created_at),
    expires_at: time(row.expires_at),
    decided_at: nullable(row.decided_at, time),
    reason_summary: summary(row.reason_summary, 300),
    arguments_summary: summary(row.arguments_summary, 512),
    summary_truncated: bool(row.summary_truncated),
    payload_digest: text(row.payload_digest, /^[a-f0-9]{64}$/),
    task_id: nullable(row.task_id, identifier),
    withdrawable: bool(row.withdrawable),
  };
  if (
    result.expires_at < result.created_at ||
    (result.withdrawable && status !== 'pending') ||
    (status === 'withdrawn' && result.decided_at === null)
  ) {
    invalid();
  }
  return result;
}

export function decodeOwnedApprovals(raw: unknown): OwnedApprovals {
  const row = object(raw);
  if (
    row.schema_version !== 1n ||
    row.scope !== 'requester_owned' ||
    typeof row.storage !== 'string' ||
    !['PERSISTENT', 'PROCESS_LOCAL'].includes(row.storage) ||
    typeof row.limit !== 'bigint' ||
    row.limit < 1n ||
    row.limit > 100n ||
    !Array.isArray(row.approvals) ||
    row.approvals.length > Number(row.limit)
  ) {
    return invalid();
  }
  const approvals = row.approvals.map(decodeApproval);
  if (new Set(approvals.map((item) => item.approval_id)).size !== approvals.length) invalid();
  return {
    schema_version: 1,
    scope: 'requester_owned',
    storage: row.storage as OwnedApprovals['storage'],
    generated_at: time(row.generated_at),
    limit: Number(row.limit),
    has_more: bool(row.has_more),
    approvals,
  };
}

export async function readOwnedApprovals(response: Response): Promise<OwnedApprovals> {
  return decodeOwnedApprovals(await readExactJson(response, 128 * 1024));
}

export async function readWithdrawnApproval(
  response: Response,
  expectedId: string,
): Promise<OwnedApproval> {
  const row = object(await readExactJson(response, 8192));
  if (row.schema_version !== 1n || row.scope !== 'requester_owned') invalid();
  const result = decodeApproval(row.approval);
  if (result.approval_id !== expectedId || result.status !== 'withdrawn' || result.withdrawable) {
    invalid();
  }
  return result;
}
