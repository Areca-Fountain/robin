const POLL_INTERVAL_MS = 5000;
const POLL_MAX_TRIES = 36;

export interface ConfirmPayload {
  letterId: string;
  letterHash: string;
  txHash: string;
  employeeName: string;
  position: string;
  formatId: string;
  workStatus?: "active" | "resigned";
}

export type AuthFetch = (path: string, body?: unknown) => Promise<Response>;

/** Polls /api/issue until Cardano confirms the transaction or time runs out. */
export async function confirmLetterOnServer(
  authFetch: AuthFetch,
  record: ConfirmPayload
): Promise<void> {
  let failures = 0;

  for (let attempt = 0; attempt < POLL_MAX_TRIES; attempt++) {
    try {
      const res = await authFetch("/api/issue", record);
      const data = await res.json().catch(() => ({}));

      if (res.status === 200 && data.status === "issued") return;

      if (res.status === 202) {
        failures = 0;
      } else if (res.status === 502) {
        failures++;
        if (failures >= 4) {
          throw new Error(data.error ?? "The blockchain data service is not responding.");
        }
      } else {
        throw new Error(data.error ?? "The server could not record this letter.");
      }
    } catch (err) {
      if (err instanceof TypeError) {
        failures++;
        if (failures >= 4) {
          throw new Error("Lost connection to the server. Check your internet and press Check again.");
        }
      } else {
        throw err;
      }
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(
    "Cardano has not confirmed the transaction yet. Your letter is safe. Press Check again in a minute."
  );
}

/** Turns Lace / Mesh / Blockfrost errors into something a person can act on. */
export function friendlyChainError(message: string): string {
  if (/declin|reject|cancel|denied/i.test(message)) {
    return "You cancelled the request in Lace. Nothing was sent.";
  }
  if (/confirmation prompt/i.test(message)) {
    return "Lace could not open its popup window. Click the Lace extension icon in your browser toolbar to make sure it is unlocked and no old popup is open, then try again.";
  }
  if (/shutdown|no longer be used/i.test(message)) {
    return "Lace wallet session disconnected. Please click 'Connect Lace wallet' again.";
  }
  if (/insufficient|utxo|balance/i.test(message)) {
    return "Not enough test ADA in this wallet. Get free Preprod ADA from the Cardano testnet faucet and try again.";
  }
  return `Could not issue the letter: ${message}`;
}

export function triggerDownload(url: string, fileName: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}