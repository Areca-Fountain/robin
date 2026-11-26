import "server-only";

import { createHash, randomBytes } from "crypto";

/** Every Robin API key starts with this, so leaked keys are easy to spot in code scans */
export const API_KEY_PREFIX = "rbn_";

/** What a key is allowed to do. New endpoints check these. */
export const API_SCOPES = ["letters:read", "letters:write"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

/** SHA-256 of the key. Keys are long and random, so a plain fast hash is enough here. */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Makes a new key. Save only `hash` and `prefix`. Show `key` to the user once. */
export function generateApiKey() {
  const key = API_KEY_PREFIX + randomBytes(30).toString("base64url"); // 4 + 40 characters
  return { key, prefix: key.slice(0, 12), hash: hashApiKey(key) };
}

/** Cheap format check, so obviously wrong keys never reach the database */
export function looksLikeApiKey(value: string): boolean {
  return /^rbn_[A-Za-z0-9_-]{40}$/.test(value);
}