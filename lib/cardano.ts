// SERVER-SIDE ONLY: uses your Blockfrost key. Only import this from API routes
// or server components, never from a "use client" file.

const BLOCKFROST_URL =
  process.env.BLOCKFROST_URL ?? "https://cardano-preprod.blockfrost.io/api/v0";

/**
 * The transaction metadata label Robin uses.
 * Issuing a letter must write metadata like:
 *   { "7283": { "hash": "<64-char sha256 hex>", "v": 1 } }
 * Keep this number identical in your issue flow.
 */
export const METADATA_LABEL = "7283";

export interface LetterOnChain {
  /** The letter hash stored in the transaction metadata */
  hash: string;
  /** Address of the wallet that paid for / signed the transaction (first input) */
  issuerAddress: string | null;
  /** Block time as a unix timestamp (seconds), null if not yet in a block */
  blockTime: number | null;
}

async function blockfrost<T>(path: string): Promise<T | null> {
  const key = process.env.BLOCKFROST_KEY;
  if (!key) throw new Error("Missing BLOCKFROST_KEY environment variable");

  const res = await fetch(`${BLOCKFROST_URL}${path}`, {
    headers: { project_id: key },
    cache: "no-store",
  });

  if (res.status === 404) return null; // transaction not found
  if (!res.ok) {
    throw new Error(`Blockfrost error ${res.status} on ${path}`);
  }
  return (await res.json()) as T;
}

interface TxMetadataEntry {
  label: string;
  json_metadata: { hash?: string; v?: number } | null;
}

interface TxInfo {
  block_time: number | null;
}

interface TxUtxos {
  inputs: { address: string }[];
}

/**
 * Reads a Robin letter record from a Cardano transaction.
 * Returns null if the transaction does not exist or has no Head Lock metadata.
 */
export async function getLetterOnChain(
  txHash: string
): Promise<LetterOnChain | null> {
  const [tx, metadata, utxos] = await Promise.all([
    blockfrost<TxInfo>(`/txs/${txHash}`),
    blockfrost<TxMetadataEntry[]>(`/txs/${txHash}/metadata`),
    blockfrost<TxUtxos>(`/txs/${txHash}/utxos`),
  ]);

  if (!tx || !metadata) return null;

  const entry = metadata.find((m) => m.label === METADATA_LABEL);
  const hash = entry?.json_metadata?.hash;
  if (!hash) return null;

  return {
    hash: hash.toLowerCase(),
    issuerAddress: utxos?.inputs?.[0]?.address ?? null,
    blockTime: tx.block_time ?? null,
  };
}