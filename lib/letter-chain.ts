// SERVER-SIDE ONLY (uses your Blockfrost key). Reads the state of a letter's
// registry UTxO: does it exist at the script address, and has it been spent?

import { getLetterScriptAddress } from "@/lib/contract";

const BLOCKFROST_URL =
  process.env.BLOCKFROST_URL ?? "https://cardano-preprod.blockfrost.io/api/v0";

export interface LetterScriptState {
  outputIndex: number;
  amount: { unit: string; quantity: string }[];
  /** Hash of the transaction that spent (revoked) it, or null if still active */
  spentBy: string | null;
}

interface TxUtxosResponse {
  outputs: {
    address: string;
    output_index: number;
    amount: { unit: string; quantity: string }[];
    consumed_by_tx?: string | null;
  }[];
}

/**
 * Looks at the issue transaction and finds the output locked at the Robin script.
 * Returns null if the transaction has no output at the script address
 * (the letter was not registered through the contract).
 */
export async function getLetterScriptState(
  txHash: string
): Promise<LetterScriptState | null> {
  const key = process.env.BLOCKFROST_KEY;
  if (!key) throw new Error("Missing BLOCKFROST_KEY environment variable");

  const res = await fetch(`${BLOCKFROST_URL}/txs/${txHash}/utxos`, {
    headers: { project_id: key },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Blockfrost error ${res.status} on /txs/${txHash}/utxos`);

  const data = (await res.json()) as TxUtxosResponse;
  const scriptAddress = getLetterScriptAddress();
  const out = data.outputs.find((o) => o.address === scriptAddress);
  if (!out) return null;

  return {
    outputIndex: out.output_index,
    amount: out.amount,
    spentBy: out.consumed_by_tx ?? null,
  };
}