import { describe, expect, it } from 'vitest';
import { MockCoCoClient, PHASE1_UNIMPLEMENTED_CAPABILITIES } from '@coco/api-client';
import { buildPlainTextQrMatrix } from '../src/utils/qrMatrix';

describe('MockCoCoClient & QR matrix', () => {
  it('supports end-to-end synthetic workflows with zero hardware', async () => {
    const mock = new MockCoCoClient();
    const health = await mock.health();
    expect(health.version).toContain('mock');

    const devices = await mock.devices();
    expect(devices.length).toBeGreaterThanOrEqual(2);
    expect(devices[0].online).toBe(true);
    expect(devices[1].online).toBe(false);

    // Chat & pending approval simulation
    const chatResp = await mock.chat('forward', 'mock-coco-01');
    expect(chatResp.tool_calls[0].status).toBe('pending_approval');

    // Emergency STOP succeeds on online device and fails honestly on offline device
    const stopResp = await mock.emergencyStop('mock-coco-01');
    expect(stopResp.sent.action).toBe('motion.stop');
    await expect(mock.emergencyStop('mock-coco-02')).rejects.toThrow(/offline/);

    // Pairing ticket lifecycle & plain-text QR generation
    const created = await mock.createPairingTicket('mock-coco-09');
    expect(created.pairing_code).toMatch(/^MOCK-PAIR-CODE-/);
    const qr = buildPlainTextQrMatrix(created.pairing_code);
    expect(qr.size).toBeGreaterThanOrEqual(21);
    expect(qr.modules.length).toBe(qr.size * qr.size);

    const canceled = await mock.cancelPairingTicket(created.ticket.ticket_id);
    expect(canceled.canceled).toBe(true);

    // Credential rotation & revocation
    const rotated = await mock.rotateDeviceCredential('mock-coco-01');
    expect(rotated.credential.version).toBe(3);
    const revoked = await mock.revokeDeviceCredential('mock-coco-01');
    expect(revoked.credential.status).toBe('revoked');

    // Unimplemented capabilities are explicitly flagged
    expect(PHASE1_UNIMPLEMENTED_CAPABILITIES.every((c) => c.status === 'not_implemented')).toBe(
      true,
    );
  });
});
