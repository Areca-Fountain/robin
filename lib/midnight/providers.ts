'use client';
import { MIDNIGHT_NETWORK_ID } from './config';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import {
  createLedger9WalletProvider,
  createLedger9MidnightProvider,
} from '@midnight-ntwrk/midnight-js-types';
import type { ConnectedMidnightWallet } from './lace-connector';

const PW_KEY = 'robin-midnight-private-pw';

function bytesToHex(b: Uint8Array): string {
  let out = '';
  for (let i = 0; i < b.length; i++) out += b[i].toString(16).padStart(2, '0');
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// Random 32-char password, created once per browser and kept in localStorage.
// OK for Preprod testing. For production, derive it from the user's wallet instead.
function getStoragePassword(): string {
  try {
    let pw = localStorage.getItem(PW_KEY);
    if (!pw || pw.length < 16) {
      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      pw = btoa(String.fromCharCode(...bytes));
      localStorage.setItem(PW_KEY, pw);
    }
    return pw;
  } catch {
    throw new Error('Browser storage is blocked; cannot create the private-state password.');
  }
}

/**
 * Fallback: send a finalized transaction to the node ourselves, over the same
 * WebSocket the browser can open, instead of through the wallet's relay.
 *
 * Uses one plain `author_submitExtrinsic` request (no subscription), so the node's
 * real verdict comes back: either a transaction hash, or the exact rejection reason
 * (for example "1010: Invalid Transaction: Custom error: N").
 */
async function submitDirectToNode(
  wallet: ConnectedMidnightWallet,
  bytes: Uint8Array
): Promise<string> {
  const { ApiPromise, WsProvider } = await import('@polkadot/api');

  const nodeURL = new URL(
    process.env.NEXT_PUBLIC_MIDNIGHT_NODE_URI || wallet.uris.substrateNodeUri
  );
  nodeURL.protocol = nodeURL.protocol === 'http:' ? 'ws:' : 'wss:';

  const api = await ApiPromise.create({
    provider: new WsProvider(nodeURL.toString()),
    noInitWarn: true,
  });
  try {
    // Midnight's pallet call; the chain's own metadata supplies the encoding.
    const midnight = (api.tx as any).midnight;
    if (!midnight?.sendMnTransaction) {
      throw new Error('This node has no midnight.sendMnTransaction call (wrong network?).');
    }
    const hash = await midnight.sendMnTransaction('0x' + bytesToHex(bytes)).send();
    console.log('[submitTx] node accepted the transaction into its pool:', hash.toString());
    return hash.toString();
  } catch (e) {
    console.error('[submitTx] node rejected the transaction (unredacted):', e);
    throw e;
  } finally {
    await api.disconnect().catch(() => {});
  }
}

/**
 * Builds the Midnight.js providers wired to Lace + local proof server + Blockfrost indexer.
 * ZK artifacts (keys + zkir) are served statically from /midnight/managed/robin_private.
 */
export function buildBrowserMidnightProviders(wallet: ConnectedMidnightWallet) {
  const zkBaseUrl = `${window.location.origin}/midnight/managed/robin_private`;

  const privateStateProvider = levelPrivateStateProvider({
    privateStateStoreName: 'robin-midnight-private-state',
    accountId: wallet.coinPublicKey,
    privateStoragePasswordProvider: () => getStoragePassword(),
  } as never);

  const publicDataProvider = indexerPublicDataProvider(
    wallet.uris.indexerUri,
    wallet.uris.indexerWsUri
  );

  // Wrapper that always calls window.fetch with the right `this`.
  // Also exposed as `.fetch` in case this SDK version expects { fetch } instead.
  const safeFetch: any = (...args: Parameters<typeof fetch>) =>
    window.fetch(...args);
  safeFetch.fetch = safeFetch;
  safeFetch.fetchFunc = safeFetch;

  const zkConfigProvider = new FetchZkConfigProvider(zkBaseUrl, safeFetch);

    const proofProvider = httpClientProofProvider(
    wallet.uris.proverServerUri,
    zkConfigProvider
  );

  // Lace runs its own copy of the ledger, so transactions cross the connector as hex.
  // The SDK factories turn the bytes we return back into era-checked handles.
  const walletProvider = createLedger9WalletProvider({
    getCoinPublicKey: () => wallet.coinPublicKey as never,
    getEncryptionPublicKey: () => wallet.encryptionPublicKey as never,
    async balanceTx(tx) {
      try {
        const { tx: balancedHex } = await wallet.api.balanceUnsealedTransaction(
          bytesToHex(tx.serialize())
        );
        // Return the bytes as-is. Do NOT call Transaction.deserialize here: the SDK
        // decodes and checks the answer itself.
        return hexToBytes(balancedHex);
      } catch (e) {
        // The SDK redacts this error before it reaches your UI, so log the raw one here.
        console.error('[balanceTx] wallet refused / failed:', e);
        throw e;
      }
    },
  });

  const midnightProvider = createLedger9MidnightProvider(async (tx) => {
    const bytes = tx.serialize();
    // Lace/1AM's submitTransaction resolves with nothing, so read the id off the tx itself.
    const { Transaction } = await import('@midnight-ntwrk/ledger-v9');
    const txId = tx.deserialize({ v9: Transaction }).identifiers()[0];

    try {
      await wallet.api.submitTransaction(bytesToHex(bytes));
      return txId;
    } catch (e) {
      console.error('[submitTx] wallet refused / failed:', e);
      // The wallet's own node socket failed before anything was sent, so it is safe to
      // send the same finalized transaction to the node directly from the browser.
      if (!/websocket/i.test(e instanceof Error ? e.message : String(e))) throw e;
      console.warn('[submitTx] wallet could not reach the node; submitting directly.');
      await submitDirectToNode(wallet, bytes);
      return txId;
    }
  });

    return {
    privateStateProvider,
    publicDataProvider,
    zkConfigProvider,
    proofProvider,
    walletProvider,
    midnightProvider,
    config: {
      networkId: MIDNIGHT_NETWORK_ID,
      ttlSeconds: 600,
    },
  };
}