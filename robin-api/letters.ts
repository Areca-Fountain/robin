import "server-only";

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Columns the API reads from the letters table */
export const LETTER_COLUMNS =
  "id, employee_name, position, work_status, issued_at, revoked_at, tx_hash, letter_hash, issued_by";

/** The public shape of a letter in the API */
export interface ApiLetter {
  id: string;
  employeeName: string;
  position: string | null;
  workStatus: string | null;
  issuedAt: string;
  /** "active" or "revoked" (as marked in Robin's records) */
  status: "active" | "revoked";
  revokedAt: string | null;
  txHash: string;
  letterHash: string;
  issuedBy: string | null;
  /** Public page anyone can open to verify the letter */
  verifyUrl: string;
}

export function toApiLetter(row: Record<string, unknown>, origin: string): ApiLetter {
  const revokedAt = (row.revoked_at as string | null) ?? null;
  return {
    id: row.id as string,
    employeeName: row.employee_name as string,
    position: (row.position as string | null) ?? null,
    workStatus: (row.work_status as string | null) ?? null,
    issuedAt: row.issued_at as string,
    status: revokedAt ? "revoked" : "active",
    revokedAt,
    txHash: row.tx_hash as string,
    letterHash: row.letter_hash as string,
    issuedBy: (row.issued_by as string | null) ?? null,
    verifyUrl: `${origin}/verify/${row.id as string}`,
  };
}
