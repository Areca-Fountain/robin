/**
 * Hash a file entirely in the browser (the PDF never leaves the user's device).
 * Returns a 64-character lowercase hex string.
 * Note: crypto.subtle only works on https:// or http://localhost.
 */
export async function sha256Hex(file: File | Blob): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function isValidHash(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}