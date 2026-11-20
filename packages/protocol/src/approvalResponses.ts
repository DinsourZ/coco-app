// Ported from CoCo OS platform/web/src/api/approvalResponses.ts (MIT).

import { readExactJson } from './exactJson';
import { validApprovalId } from './ownedApprovals';
import type { Approval } from './types';

const invalid = (): never => {
  throw new Error('Invalid approval response');
};

const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : invalid();

function safeJson(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value >= -BigInt(Number.MAX_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(value)
      : invalid();
  }
  if (Array.isArray(value)) return value.map(safeJson);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, safeJson(item)]),
    );
  }
  return value;
}

function decodeApproval(raw: unknown): Approval {
  const row = object(raw);
  const created = typeof row.created_at === 'bigint' ? Number(row.created_at) : row.created_at;
  if (
    !validApprovalId(row.approval_id) ||
    typeof row.tool !== 'string' ||
    /^[A-Za-z0-9_.-]{1,128}$/.exec(row.tool)?.[0] !== row.tool ||
    typeof row.reason !== 'string' ||
    [...row.reason].length > 4000 ||
    typeof row.status !== 'string' ||
    !['pending', 'approved', 'rejected', 'expired', 'withdrawn', 'executed', 'failed'].includes(
      row.status,
    ) ||
    typeof created !== 'number' ||
    !Number.isFinite(created) ||
    created < 0 ||
    created > 253_402_300_799 ||
    (row.result_summary !== undefined &&
      row.result_summary !== null &&
      (typeof row.result_summary !== 'string' || [...row.result_summary].length > 300))
  ) {
    return invalid();
  }
  return {
    approval_id: row.approval_id,
    tool: row.tool,
    reason: row.reason,
    status: row.status as Approval['status'],
    created_at: created,
    args_redacted: safeJson(object(row.args_redacted)) as Record<string, unknown>,
    ...(row.result_summary === undefined
      ? {}
      : { result_summary: row.result_summary as string | null }),
  };
}

export async function readApprovals(response: Response): Promise<Approval[]> {
  const raw = await readExactJson(response, 4 * 1024 * 1024);
  if (!Array.isArray(raw) || raw.length > 8192) return invalid();
  const rows = raw.map(decodeApproval);
  if (new Set(rows.map((row) => row.approval_id)).size !== rows.length) return invalid();
  return rows;
}

export async function readApprovalDecision(
  response: Response,
  id: string,
  decision: 'approve' | 'reject',
): Promise<Approval> {
  const row = decodeApproval(await readExactJson(response, 64 * 1024));
  const allowed = decision === 'approve' ? ['approved', 'executed', 'failed'] : ['rejected'];
  if (row.approval_id !== id || !allowed.includes(row.status)) return invalid();
  return row;
}
