'use client';
import { MIDNIGHT_NETWORK_ID } from './config';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import type {
  FinalizedTransaction,
  UnboundTransaction,
} from '@midnight-ntwrk/midnight-js-types';
import type { ConnectedMidnightWallet } from './lace-connector';

const PW_KEY = 'robin-midnight-private-pw';

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

  const walletProvider = {
    getCoinPublicKey: () => wallet.coinPublicKey,
    getEncryptionPublicKey: () => wallet.encryptionPublicKey,
    async balanceTx(
      tx: UnboundTransaction,
      _newCoins?: unknown
    ): Promise<FinalizedTransaction> {
      const serialized = Buffer.from(tx.serialize()).toString('hex');
      const balanced = await wallet.api.balanceUnsealedTransaction(serialized);
      const { Transaction } = await import('@midnight-ntwrk/ledger-v9');
      return Transaction.deserialize(
        Buffer.from(balanced.tx, 'hex')
      ) as unknown as FinalizedTransaction;
    },
  };

  const midnightProvider = {
    async submitTx(tx: FinalizedTransaction): Promise<string> {
      const serialized = Buffer.from(tx.serialize()).toString('hex');
      return await wallet.api.submitTransaction(serialized);
    },
  };

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