// SERVER-SIDE ONLY: uses your Blockfrost key. Only import this from API routes
// or server components, never from a "use client" file.

const BLOCKFROST_URL =
  process.env.BLOCKFROST_URL ?? "https://cardano-preprod.blockfrost.io/api/v0";

/**
 * The transaction metadata label Robin uses.
 * Single letter:
 *   { "7283": { "hash": "<64-char sha256 hex>", "v": 1 } }
 * Bulk batch letters:
 *   { "7283": { "hashes": ["<64-char sha256 hex>", ...], "v": 2 } }
 */
export const METADATA_LABEL = "7283";

export interface LetterOnChain {
  /** Primary letter hash (first hash in batch if bulk) */
  hash: string;
  /** All letter hashes recorded in this transaction */
  hashes: string[];
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
  json_metadata: { hash?: string; hashes?: unknown; v?: number } | null;
}

interface TxInfo {
  block_time: number | null;
}

interface TxUtxos {
  inputs: { address: string }[];
}

/**
 * Reads a Robin letter record (single or batch) from a Cardano transaction.
 * Returns null if the transaction does not exist or has no Robin metadata.
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
  const meta = entry?.json_metadata;
  if (!meta) return null;

  const hashes: string[] = [];
  if (typeof meta.hash === "string" && meta.hash.trim()) {
    hashes.push(meta.hash.trim().toLowerCase());
  }
  if (Array.isArray(meta.hashes)) {
    for (const h of meta.hashes) {
      if (typeof h === "string" && h.trim()) {
        hashes.push(h.trim().toLowerCase());
      }
    }
  }

  if (hashes.length === 0) return null;

  return {
    hash: hashes[0],
    hashes,
    issuerAddress: utxos?.inputs?.[0]?.address ?? null,
    blockTime: tx.block_time ?? null,
  };
}