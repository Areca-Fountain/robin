'use client';

import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import type { ConnectedMidnightWallet } from './lace-connector';

// The v5 SDK no longer exports these transaction types from midnight-js-types,
// so they are kept loose here. The ledger objects are only serialized / deserialized.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTx = any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BrowserMidnightProviders = any;

export async function buildBrowserMidnightProviders(
  wallet: ConnectedMidnightWallet
): Promise<BrowserMidnightProviders> {
  // Loaded here, not at the top of the file, so Next's server pre-render never touches
  // the level provider (it pulls in classic-level, a native Node module).
  const { levelPrivateStateProvider } = await import(
    '@midnight-ntwrk/midnight-js-level-private-state-provider'
  );

  const zkBaseUrl = `${window.location.origin}/midnight/managed/robin_private`;

  // v5 needs an accountId and a password provider for the browser's private-state store.
  // The only private state here is the issuer key, which Robin already keeps in this
  // browser's localStorage, so a wallet-derived password is acceptable for the hackathon.
  const privateStateProvider = levelPrivateStateProvider({
    privateStateStoreName: 'robin-midnight-private-state',
    accountId: wallet.coinPublicKey,
    privateStoragePasswordProvider: () => `robin-private-state-${wallet.coinPublicKey}`,
  });

  const publicDataProvider = indexerPublicDataProvider(
    wallet.uris.indexerUri,
    wallet.uris.indexerWsUri
  );

  // Uses the browser's global fetch by default.
  const zkConfigProvider = new FetchZkConfigProvider(zkBaseUrl);

  // v5 takes one options object instead of (url, zkConfigProvider).
  const proofProvider = httpClientProofProvider({
    url: wallet.uris.proverServerUri,
    zkConfigProvider,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  const walletProvider = {
    getCoinPublicKey: () => wallet.coinPublicKey,
    getEncryptionPublicKey: () => wallet.encryptionPublicKey,
    async balanceTx(tx: AnyTx, _newCoins?: unknown): Promise<AnyTx> {
      const serialized = Buffer.from(tx.serialize()).toString('hex');
      const balanced = await wallet.api.balanceUnsealedTransaction(serialized);
      const { Transaction } = await import('@midnight-ntwrk/ledger-v9');
      // ledger-v9 needs the three type markers: a balanced tx is signed, proven and bound.
      return Transaction.deserialize(
        'signature',
        'proof',
        'binding',
        Buffer.from(balanced.tx, 'hex')
      );
    },
  };

  const midnightProvider = {
    async submitTx(tx: AnyTx): Promise<string> {
      const serialized = Buffer.from(tx.serialize()).toString('hex');
      // The connector's submitTransaction returns nothing now, so take the id from the tx.
      await wallet.api.submitTransaction(serialized);
      const ids: string[] = typeof tx.identifiers === 'function' ? tx.identifiers() : [];
      return ids[0] ?? '';
    },
  };

  return {
    privateStateProvider,
    publicDataProvider,
    zkConfigProvider,
    proofProvider,
    walletProvider,
    midnightProvider,
  };
}