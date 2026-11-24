'use client';

// Read-only access to the Robin contract on Midnight (no wallet needed).
// Uses the public indexer, so anyone can check the result themselves.

import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { MIDNIGHT_CONTRACT_ADDRESS, getDefaultMidnightUris } from './config';
import { fromHex, toHex } from './credential';

const warned = new Set<string>();
function warnOnce(name: string, e: unknown) {
  if (warned.has(name)) return;
  warned.add(name);
  console.warn('[chain-read] ledger attempt failed:', name, e);
}

/**
 * Fallback: fetch the contract's raw state from the indexer (plain GraphQL over HTTP)
 * and decode it with the SAME runtime copy the compiled contract uses. This avoids the
 * "expected instance of ChargedState" error caused by two copies of the runtime.
 */
async function ledgerFromRawState(mod: any, indexerUri: string): Promise<any> {
  const res = await fetch(indexerUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: 'query($a: HexEncoded!) { contractAction(address: $a) { state } }',
      variables: { a: MIDNIGHT_CONTRACT_ADDRESS },
    }),
  });
  const json: any = await res.json();
  const hex: string | undefined = json?.data?.contractAction?.state;
  if (!hex) {
    throw new Error(`Indexer returned no state: ${JSON.stringify(json?.errors ?? json).slice(0, 300)}`);
  }
  const rt: any = await import('@midnight-ntwrk/compact-runtime');
  const contractState = rt.ContractState.deserialize(fromHex(hex));
  return mod.ledger(contractState.data);
}

async function readLedger(): Promise<any> {
  if (!MIDNIGHT_CONTRACT_ADDRESS) {
    throw new Error('NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS is not set.');
  }
  const uris = getDefaultMidnightUris();
  const provider: any = indexerPublicDataProvider(uris.indexerUri, uris.indexerWsUri);
  const state = await provider.queryContractState(MIDNIGHT_CONTRACT_ADDRESS);
  if (!state) throw new Error('The contract was not found on the Midnight indexer yet.');
  const mod: any = await import('../../midnight/managed/robin_private/contract/index.js');

  const attempts: Array<[string, () => Promise<any> | any]> = [
    ['state.data', () => mod.ledger(state.data ?? state)],
    ['raw indexer state', () => ledgerFromRawState(mod, uris.indexerUri)],
  ];

  let lastError: unknown;
  for (const [name, run] of attempts) {
    try {
      return await run();
    } catch (e) {
      warnOnce(name, e);
      lastError = e;
    }
  }
  console.warn(
    '[chain-read] state object type:',
    state?.constructor?.name,
    Object.getOwnPropertyNames(Object.getPrototypeOf(state) ?? {})
  );
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export interface ChainReceipt {
  issuerId: string; // 64 hex
  claim: number; // 1 = employment, 2 = tenure, 3 = position
  minDays: number;
  positionHash: string; // 64 hex
}

/** The proof an employee published for one verifier request, or null if none yet. */
export async function readReceipt(nonceHex: string): Promise<ChainReceipt | null> {
  const ledger = await readLedger();
  const key = fromHex(nonceHex);
  if (!ledger.receipts.member(key)) return null;
  const r = ledger.receipts.lookup(key);
  return {
    issuerId: toHex(r.issuer),
    claim: Number(r.claim),
    minDays: Number(r.minDays),
    positionHash: toHex(r.positionHash),
  };
}

/** True when Robin's admin has registered this issuer on-chain. */
export async function isIssuerOnChain(issuerIdHex: string): Promise<boolean> {
  const ledger = await readLedger();
  return Boolean(ledger.issuers.member(fromHex(issuerIdHex)));
}

/** Whether a letter commitment exists on-chain and whether it was revoked. */
export async function readLetterStatus(
  commitmentHex: string
): Promise<{ exists: boolean; revoked: boolean }> {
  const ledger = await readLedger();
  const key = fromHex(commitmentHex);
  return {
    exists: Boolean(ledger.letters.member(key)),
    revoked: Boolean(ledger.revoked.member(key)),
  };
}