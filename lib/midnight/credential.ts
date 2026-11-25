export interface PrivateLetterCredential {
  version: 1;
  letterId: string;
  companyId: string;
  companyName?: string;
  issuerId: string;
  commitment: string;
  employeeName: string;
  nic: string;
  position: string;
  startDate: string;
  endDate: string;
  employeeNameHash: string;
  nicHash: string;
  positionHash: string;
  startDay: number;
  endDay: number;
  salt: string;
  issuedAt: string;
}

export function hexToBytes32(hex: string): Uint8Array {
  const clean = hex.trim().replace(/^0x/i, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(clean)) {
    throw new Error(`Expected 64-character hex string, received length ${clean.length}`);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function randomHex32(): string {
  const buf = new Uint8Array(32);
  globalThis.crypto.getRandomValues(buf);
  return bytesToHex(buf);
}

export async function sha256Bytes(data: Uint8Array): Promise<Uint8Array> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data as BufferSource);
  return new Uint8Array(digest);
}

export async function sha256NormalizedText(value: string): Promise<string> {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ');
  const encoded = new TextEncoder().encode(normalized);
  return bytesToHex(await sha256Bytes(encoded));
}

export function isoDateToEpochDays(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) {
    throw new Error(`Invalid ISO date: ${isoDate}`);
  }
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

export async function computeIssuerId(issuerSecretHex: string): Promise<string> {
  const hash = await sha256Bytes(hexToBytes32(issuerSecretHex));
  return bytesToHex(hash);
}

export async function computeLetterCommitment(params: {
  issuerId: string;
  employeeNameHash: string;
  nicHash: string;
  positionHash: string;
  startDay: number;
  endDay: number;
  salt: string;
}): Promise<string> {
  const buf = new Uint8Array(32 * 5 + 16);
  buf.set(hexToBytes32(params.issuerId), 0);
  buf.set(hexToBytes32(params.employeeNameHash), 32);
  buf.set(hexToBytes32(params.nicHash), 64);
  buf.set(hexToBytes32(params.positionHash), 96);

  const view = new DataView(buf.buffer);
  view.setBigUint64(128, BigInt(params.startDay), false);
  view.setBigUint64(136, BigInt(params.endDay), false);

  buf.set(hexToBytes32(params.salt), 144);
  return bytesToHex(await sha256Bytes(buf));
}
