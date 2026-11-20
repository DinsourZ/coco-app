import QRCode from 'qrcode';

export interface QrMatrix {
  size: number;
  modules: boolean[];
}

/**
 * Generates a pure boolean QR matrix for a plain-text pairing code.
 * Security invariant: encodes ONLY the plain-text pairing code (never a URL,
 * auto-claim link, or long-lived bearer credential).
 */
export function buildPlainTextQrMatrix(pairingCode: string): QrMatrix {
  const trimmed = pairingCode.trim();
  if (!trimmed) {
    throw new Error('Pairing code is empty');
  }
  const qr = QRCode.create(trimmed, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const modules: boolean[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      modules.push(Boolean(qr.modules.get(row, col)));
    }
  }
  return { size, modules };
}
