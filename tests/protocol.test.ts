import { describe, expect, it } from 'vitest';
import {
  controlContextHeaders,
  decodeOwnedApprovals,
  generateChatRequestId,
  isObservationEnvironmentAvailable,
  isValidDeviceId,
  parseExactJson,
  readChatCancellation,
  readControlContext,
  readDisplayObservation,
  readExactJson,
  validChatRequestId,
  withinObservationBudget,
} from '@coco/protocol';
import { SYNTHETIC_CONTROL_SESSION } from './fixtures/synthetic';

describe('protocol validators', () => {
  it('parses exact JSON with bigint integers and rejects duplicate keys', () => {
    const parsed = parseExactJson('{"schema_version":1,"count":42}') as Record<string, unknown>;
    expect(parsed.schema_version).toBe(1n);
    expect(parsed.count).toBe(42n);
    expect(() => parseExactJson('{"a":1,"a":2}')).toThrow('Invalid runtime response');
  });

  it('reads exact JSON even when Response.body stream is unavailable (RN fallback)', async () => {
    const fakeResponse = {
      body: null,
      text: async () => '{"schema_version":1,"ok":true}',
    } as unknown as Response;
    const parsed = (await readExactJson(fakeResponse)) as Record<string, unknown>;
    expect(parsed.schema_version).toBe(1n);
    expect(parsed.ok).toBe(true);
  });

  it('validates ControlContext and formats precondition headers', () => {
    const ctx = readControlContext({
      control_session_id: SYNTHETIC_CONTROL_SESSION,
      connection_generation: 3,
    });
    expect(ctx).not.toBeNull();
    expect(controlContextHeaders(ctx!)).toEqual({
      'X-CoCo-Control-Session': SYNTHETIC_CONTROL_SESSION,
      'X-CoCo-Control-Generation': '3',
    });
    expect(readControlContext({ control_session_id: 'bad', connection_generation: 1 })).toBeNull();
  });

  it('rejects inconsistent DisplayObservation snapshots', () => {
    const valid = readDisplayObservation({
      selected: 'happy',
      visible: 'happy',
      selected_revision: 5,
      visible_revision: 5,
      visible_valid: true,
      available: true,
      hil_active: false,
      inputs_stale: false,
      coalesced_requests: 0,
      draw_budget_exhaustions: 0,
      draw_failures: 0,
    });
    expect(valid?.visible).toBe('happy');

    // Mismatched revision must become null (UNKNOWN), never fake visible
    const invalid = readDisplayObservation({
      selected: 'happy',
      visible: 'happy',
      selected_revision: 6,
      visible_revision: 5,
      visible_valid: true,
      available: true,
      hil_active: false,
      inputs_stale: false,
      coalesced_requests: 0,
      draw_budget_exhaustions: 0,
      draw_failures: 0,
    });
    expect(invalid).toBeNull();
  });

  it('generates and validates 32-hex chat request IDs and cancellation envelopes', async () => {
    const reqId = generateChatRequestId();
    expect(validChatRequestId(reqId)).toBe(true);
    const resp = new Response(
      JSON.stringify({
        schema_version: 1,
        scope: 'process',
        request_id: reqId,
        task_id: null,
        state: 'CANCEL_REQUESTED',
      }),
      { status: 202 },
    );
    const parsed = await readChatCancellation(resp, reqId);
    expect(parsed.state).toBe('CANCEL_REQUESTED');
  });

  it('decodes requester-owned approvals strictly', () => {
    const decoded = decodeOwnedApprovals(
      parseExactJson(
        JSON.stringify({
          schema_version: 1,
          scope: 'requester_owned',
          storage: 'PERSISTENT',
          generated_at: 1700000000,
          limit: 50,
          has_more: false,
          approvals: [
            {
              approval_id: 'appr-001',
              tool: 'device.motion.forward',
              status: 'pending',
              created_at: 1700000000,
              expires_at: 1700000300,
              decided_at: null,
              reason_summary: 'Synthetic test',
              arguments_summary: '{}',
              summary_truncated: false,
              payload_digest: 'a'.repeat(64),
              task_id: null,
              withdrawable: true,
            },
          ],
        }),
      ),
    );
    expect(decoded.approvals).toHaveLength(1);
    expect(decoded.approvals[0].withdrawable).toBe(true);
  });

  it('checks observation budget and device ID patterns cleanly', () => {
    expect(isValidDeviceId('synth-coco_01.a')).toBe(true);
    expect(isValidDeviceId('../bad')).toBe(false);
    expect(
      withinObservationBudget({ monotonicMs: 100, wallMs: 1000 }, 5000, {
        monotonicMs: 1100,
        wallMs: 2000,
      }),
    ).toBe(true);
    expect(
      withinObservationBudget({ monotonicMs: 100, wallMs: 1000 }, 5000, {
        monotonicMs: 100,
        wallMs: 900, // wall clock jumped backwards
      }),
    ).toBe(false);
    expect(isObservationEnvironmentAvailable({ isForeground: true, isOnline: true })).toBe(true);
    expect(isObservationEnvironmentAvailable({ isForeground: false, isOnline: true })).toBe(false);
  });
});
