/**
 * Works out WHICH WALLET an address belongs to.
 *
 * Why this exists: a Lace wallet can have many addresses. The address stored
 * when a company registered (hex, from CIP-30) is often not the same string as
 * the address that paid for an issue transaction (bech32, from Blockfrost).
 * But every address of the same wallet shares the same stake key, so we compare
 * that instead.
 *
 * Pure functions, no dependencies. Safe to import on the server or the client.
 */

const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32_GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function bech32Polymod(values: number[]): number {
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((top >>> i) & 1) chk ^= BECH32_GENERATOR[i];
    }
  }
  return chk;
}

function bech32HrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >>> 5);
  out.push(0);
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31);
  return out;
}

/** Decodes a bech32 string (like addr_test1...) into raw bytes. Returns null if invalid. */
export function bech32ToBytes(input: string): Uint8Array | null {
  const str = input.trim();
  if (str !== str.toLowerCase() && str !== str.toUpperCase()) return null; // no mixed case
  const lower = str.toLowerCase();

  const sep = lower.lastIndexOf("1");
  if (sep < 1 || sep + 7 > lower.length) return null;

  const hrp = lower.slice(0, sep);
  const data: number[] = [];
  for (const ch of lower.slice(sep + 1)) {
    const v = BECH32_CHARSET.indexOf(ch);
    if (v === -1) return null;
    data.push(v);
  }

  if (bech32Polymod([...bech32HrpExpand(hrp), ...data]) !== 1) return null; // bad checksum

  // Drop the 6 checksum characters, then convert 5-bit groups to bytes
  const words = data.slice(0, -6);
  let acc = 0;
  let bits = 0;
  const bytes: number[] = [];
  for (const w of words) {
    acc = (acc << 5) | w;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      bytes.push((acc >>> bits) & 0xff);
    }
  }
  if (bits >= 5 || ((acc << (8 - bits)) & 0xff) !== 0) return null; // bad padding
  return Uint8Array.from(bytes);
}

function hexToBytes(input: string): Uint8Array | null {
  const clean = input.trim().replace(/^0x/i, "");
  if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(clean)) {
    return null;
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Turns a bech32 or hex Cardano address into raw address bytes. */
export function addressToBytes(address: string): Uint8Array | null {
  let bytes = hexToBytes(address) ?? bech32ToBytes(address);
  if (!bytes || bytes.length === 0) return null;

  // Some wallets wrap the address in a CBOR byte-string header (0x58 <length>)
  if (bytes[0] === 0x58 && bytes.length === bytes[1] + 2) {
    bytes = bytes.slice(2);
  }
  return bytes;
}

/**
 * A short id for the WALLET behind an address.
 * - Base addresses (the normal Lace address): the stake key part, so all
 *   addresses of one wallet give the same result.
 * - Anything else: the full address.
 * Returns null if the address cannot be read.
 */
export function walletKey(address: string): string | null {
  const bytes = addressToBytes(address);
  if (!bytes) return null;

  const type = bytes[0] >> 4;
  if (type <= 3 && bytes.length >= 57) {
    return "stake:" + bytesToHex(bytes.slice(29, 57));
  }
  return "addr:" + bytesToHex(bytes);
}