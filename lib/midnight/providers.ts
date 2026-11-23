'use client';

import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import type {
  BalancedProvingRecipe,
  FinalizedTransaction,
  UnboundTransaction,
} from '@midnight-ntwrk/midnight-js-types';
import type { ConnectedMidnightWallet } from './lace-connector';

/**
 * Builds the Midnight.js providers wired to Lace + local proof server + Blockfrost indexer.
 * ZK artifacts (keys + zkir) are served statically from /midnight/managed/robin_private.
 */
export function buildBrowserMidnightProviders(wallet: ConnectedMidnightWallet) {
  const zkBaseUrl = `${window.location.origin}/midnight/managed/robin_private`;

  const privateStateProvider = levelPrivateStateProvider({
    privateStateStoreName: 'robin-midnight-private-state',
  });

  const publicDataProvider = indexerPublicDataProvider(
    wallet.uris.indexerUri,
    wallet.uris.indexerWsUri
  );

  const zkConfigProvider = new FetchZkConfigProvider(zkBaseUrl, fetch.bind(window));

  const proofProvider = httpClientProofProvider(wallet.uris.proverServerUri);

  const walletProvider = {
    getCoinPublicKey: () => wallet.coinPublicKey,
    getEncryptionPublicKey: () => wallet.encryptionPublicKey,
    async balanceTx(
      tx: UnboundTransaction,
      _newCoins?: unknown
    ): Promise<FinalizedTransaction> {
      // Lace DApp Connector API v4 balances and proves Zswap inputs via balanceUnsealedTransaction
      const serialized = Buffer.from(tx.serialize()).toString('hex');
      const balanced = await wallet.api.balanceUnsealedTransaction(serialized);
      // Re-hydrate the finalized transaction bytes returned by Lace
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
  };
}