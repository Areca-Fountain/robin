/**
 * Shared helpers for the Robin AI pages: wait until Cardano confirms a letter
 * (same /api/issue polling as the Issue Service Letter page) and turn wallet
 * errors into friendly messages.
 */

export type AuthFetch = (path: string, body?: unknown) => Promise<Response>;

export interface ConfirmPayload {
  letterId: string;
  letterHash: string;
  txHash: string;
  employeeName: string;
  position: string;
  formatId: string;
}

/** Thrown when we simply ran out of time. The letter is safe, the user can press "Check again". */
export class ConfirmTimeoutError extends Error {}

const POLL_INTERVAL_MS = 5000;
const POLL_MAX_TRIES = 36;

export async function confirmLetterOnServer(
  authFetch: AuthFetch,
  payload: ConfirmPayload
): Promise<void> {
  let failures = 0;
  for (let attempt = 0; attempt < POLL_MAX_TRIES; attempt++) {
    try {
      const res = await authFetch("/api/issue", payload);
      const data = await res.json().catch(() => ({}));

      if (res.status === 200 && data.status === "issued") return;
      if (res.status === 202) {
        failures = 0;
      } else if (res.status === 502) {
        failures++;
        if (failures >= 4) throw new Error(data.error ?? "The blockchain data service is not responding.");
      } else {
        throw new Error(data.error ?? "The server could not record this letter.");
      }
    } catch (err) {
      if (err instanceof TypeError) {
        failures++;
        if (failures >= 4) throw new ConfirmTimeoutError("Lost connection to the server. Check your internet and press Check again.");
      } else {
        throw err;
      }
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new ConfirmTimeoutError(
    "Cardano has not confirmed the transaction yet. Your letters are safe. Press Check again in a minute."
  );
}

/** Starts a browser download of a blob URL */
export function triggerDownload(url: string, fileName: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/** Turns a wallet / chain error into a message a normal user understands */
export function friendlyChainError(message: string): string {
  if (/declin|reject|cancel|denied/i.test(message)) return "You cancelled the request in Lace. Nothing was sent.";
  if (/confirmation prompt/i.test(message)) {
    return "Lace could not open its popup window. Click the Lace extension icon in your browser toolbar to make sure it is unlocked and no old popup is open, then try again.";
  }
  if (/shutdown|no longer be used/i.test(message)) {
    return "Lace wallet session disconnected. Please click 'Connect Lace wallet' again.";
  }
  if (/insufficient|utxo|balance/i.test(message)) {
    return "Not enough test ADA in this wallet. Get free Preprod ADA from the Cardano testnet faucet and try again.";
  }
  return message;
}