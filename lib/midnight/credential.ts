// Helpers for the private credential an employee receives.
// Works in the browser and in Node 20+. Nothing here talks to a blockchain.
//
// Flow: company enters letter details -> buildCredential() -> the contract's
// commitmentOf() turns it into a commitment -> issueLetter() puts only that
// commitment on Midnight -> the employee gets the credential package (a JSON
// file) and Robin never stores it.

export const CREDENTIAL_VERSION = 1;

/** What the company types in the issue form */
export interface LetterInput {
  employeeName: string;
  nic: string;
  position: string;
  startDate: string; // YYYY-MM-DD
  /** YYYY-MM-DD. Leave empty for a current employee: the issue date is used. */
  endDate?: string;
}

/** Same shape as the contract's `Attributes` struct (Uint<32> -> bigint) */
export interface ChainAttributes {
  nicHash: Uint8Array;
  nameHash: Uint8Array;
  positionHash: Uint8Array;
  startDay: bigint;
  endDay: bigint;
}

/** The file handed to the employee. Keep it private: it holds the salt. */
export interface CredentialPackage {
  v: number;
  letterId: string;
  commitment: string; // 64 hex
  contractAddress: string;
  network: string; // e.g. "preprod"
  companyName: string;
  issuedAt: string; // ISO
  salt: string; // 64 hex
  attributes: {
    nicHash: string;
    nameHash: string;
    positionHash: string;
    startDay: number;
    endDay: number;
  };
  /** Plain text for the employee's own screen only (never sent to Robin) */
  display: { employeeName: string; position: string; startDate: string; endDate: string };
}

// ---------------------------------------------------------------- bytes

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (!/^[a-f0-9]*$/.test(clean) || clean.length % 2 !== 0) {
    throw new Error("Invalid hex string.");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function isHex32(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

export function randomSalt(): Uint8Array {
  const out = new Uint8Array(32);
  crypto.getRandomValues(out);
  return out;
}

// -------------------------------------------------------------- hashing

/** Trim, collapse spaces, lowercase, Unicode-normalize: so "  Senior  Engineer" == "senior engineer" */
export function normalizeText(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

/** NIC: remove spaces, uppercase (old format ends with V/X) */
export function normalizeNic(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

async function sha256(text: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(text);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}

/**
 * Hash of a position, used both when issuing and when a verifier asks
 * "is this person a <position>?". Both sides must use this same function.
 */
export function hashPosition(position: string): Promise<Uint8Array> {
  return sha256(`robin:v1:position:${normalizeText(position)}`);
}

export function hashName(name: string): Promise<Uint8Array> {
  return sha256(`robin:v1:name:${normalizeText(name)}`);
}

export function hashNic(nic: string): Promise<Uint8Array> {
  return sha256(`robin:v1:nic:${normalizeNic(nic)}`);
}

// ---------------------------------------------------------------- dates

const MS_PER_DAY = 86_400_000;

/** "2024-03-15" -> days since 1970-01-01 (UTC) */
export function toDay(date: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!m) throw new Error("Dates must look like YYYY-MM-DD.");
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(ms)) throw new Error("Invalid date.");
  return Math.floor(ms / MS_PER_DAY);
}

export function todayString(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

// ------------------------------------------------------------- building

export interface BuiltAttributes {
  chain: ChainAttributes;
  /** JSON-safe copy for the credential file */
  json: CredentialPackage["attributes"];
  /** The end date actually used (issue date for current employees) */
  endDate: string;
}

export async function buildAttributes(input: LetterInput): Promise<BuiltAttributes> {
  const name = input.employeeName.trim();
  const position = input.position.trim();
  if (!name || name.length > 120) throw new Error("Employee name is required (max 120 characters).");
  if (!input.nic.trim()) throw new Error("NIC is required.");
  if (!position || position.length > 120) throw new Error("Position is required (max 120 characters).");

  const endDate = input.endDate?.trim() ? input.endDate.trim() : todayString();
  const startDay = toDay(input.startDate);
  const endDay = toDay(endDate);
  if (endDay < startDay) throw new Error("End date cannot be before the start date.");

  const [nicHash, nameHash, positionHash] = await Promise.all([
    hashNic(input.nic),
    hashName(name),
    hashPosition(position),
  ]);

  return {
    chain: { nicHash, nameHash, positionHash, startDay: BigInt(startDay), endDay: BigInt(endDay) },
    json: {
      nicHash: toHex(nicHash),
      nameHash: toHex(nameHash),
      positionHash: toHex(positionHash),
      startDay,
      endDay,
    },
    endDate,
  };
}

/** Rebuild the contract's Attributes struct from a credential file */
export function toChainAttributes(pkg: CredentialPackage): ChainAttributes {
  const a = pkg.attributes;
  return {
    nicHash: fromHex(a.nicHash),
    nameHash: fromHex(a.nameHash),
    positionHash: fromHex(a.positionHash),
    startDay: BigInt(a.startDay),
    endDay: BigInt(a.endDay),
  };
}

// ------------------------------------------------------ file (de)serialize

export function serializeCredential(pkg: CredentialPackage): string {
  return JSON.stringify(pkg, null, 2);
}

export function parseCredential(text: string): CredentialPackage {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("This is not a valid Robin credential file.");
  }
  const p = raw as Partial<CredentialPackage>;
  const ok =
    p &&
    p.v === CREDENTIAL_VERSION &&
    typeof p.letterId === "string" &&
    typeof p.commitment === "string" &&
    isHex32(p.commitment) &&
    typeof p.salt === "string" &&
    isHex32(p.salt) &&
    typeof p.contractAddress === "string" &&
    p.attributes &&
    isHex32(p.attributes.nicHash) &&
    isHex32(p.attributes.nameHash) &&
    isHex32(p.attributes.positionHash) &&
    Number.isInteger(p.attributes.startDay) &&
    Number.isInteger(p.attributes.endDay);
  if (!ok) throw new Error("This credential file is incomplete or from a different version.");
  return p as CredentialPackage;
}