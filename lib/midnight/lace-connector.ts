'use client';

import type {
  ConnectedAPI,
  InitialAPI,
} from '@midnight-ntwrk/dapp-connector-api';
import {
  getDefaultMidnightUris,
  MIDNIGHT_NETWORK_ID,
  type MidnightServiceUris,
} from './config';

declare global {
  interface Window {
    midnight?: Record<string, InitialAPI>;
  }
}

export interface ConnectedMidnightWallet {
  walletKey: string;
  walletName: string;
  api: ConnectedAPI;
  shieldedAddress: string;
  unshieldedAddress: string;
  dustAddress: string;
  coinPublicKey: string;
  encryptionPublicKey: string;
  uris: MidnightServiceUris;
}

function isConnector(entry: unknown): entry is InitialAPI {
  return Boolean(entry) && typeof (entry as InitialAPI).connect === 'function';
}

/**
 * Finds a Midnight wallet connector on window.midnight.
 *
 * Order:
 *   1. `mnLace` (Lace's fixed key)
 *   2. an entry whose name/rdns looks like Lace or 1AM
 *   3. the first entry that has a connect() function (any other wallet)
 */
export function findLaceMidnightConnector(): {
  key: string;
  connector: InitialAPI;
} | null {
  if (typeof window === 'undefined' || !window.midnight) return null;

  const entries = Object.entries(window.midnight).filter(([, entry]) =>
    isConnector(entry)
  );

  if (isConnector(window.midnight.mnLace)) {
    return { key: 'mnLace', connector: window.midnight.mnLace };
  }

  for (const [key, entry] of entries) {
    const name = (entry.name || '').toLowerCase();
    const rdns = ((entry as unknown as { rdns?: string }).rdns || '').toLowerCase();
    if (name.includes('lace') || rdns === 'io.lace.wallet' || name.includes('1am')) {
      return { key, connector: entry };
    }
  }

  // Any other wallet that follows the DApp Connector API.
  if (entries.length > 0) {
    const [key, connector] = entries[0];
    return { key, connector };
  }

  return null;
}

/**
 * Connects to the Midnight wallet on Preprod and returns wallet addresses + service URIs.
 *
 * Proof server: the private inputs of every proof (admin secret, issuer secret,
 * employee credential) are sent to the proof server. So NEXT_PUBLIC_MIDNIGHT_PROVER_URI
 * (your own local server) is used first. The wallet's own prover is only a fallback.
 */
export async function connectLaceMidnight(
  networkId: string = MIDNIGHT_NETWORK_ID
): Promise<ConnectedMidnightWallet> {
  const found = findLaceMidnightConnector();
  if (!found) {
    throw new Error(
      'No Midnight wallet detected. Install or update Lace 2.x (or 1AM) in Chrome/Edge and enable Midnight.'
    );
  }

  const api = await found.connector.connect(networkId);
  const config = await api.getConfiguration();
  const defaults = getDefaultMidnightUris();

  // Read addresses from DApp Connector API v4 methods
  const shielded = await api.getShieldedAddresses();
  const unshielded = await api.getUnshieldedAddress();
  const dust = await api.getDustAddress();

  const envProver = process.env.NEXT_PUBLIC_MIDNIGHT_PROVER_URI || '';
  const proverServerUri =
    envProver || config.proverServerUri || defaults.proverServerUri;

  if (!envProver && config.proverServerUri) {
    console.warn(
      '[midnight] NEXT_PUBLIC_MIDNIGHT_PROVER_URI is not set, so proofs go to the wallet\'s prover:',
      config.proverServerUri.split('?')[0],
      '. Set it to http://localhost:6300 to keep private inputs on your own machine.'
    );
  }

  return {
    walletKey: found.key,
    walletName: found.connector.name || 'Midnight wallet',
    api,
    shieldedAddress: shielded.shieldedAddress,
    unshieldedAddress: unshielded.unshieldedAddress,
    dustAddress: dust.dustAddress,
    coinPublicKey: shielded.shieldedCoinPublicKey,
    encryptionPublicKey: shielded.shieldedEncryptionPublicKey,
    uris: {
      indexerUri: config.indexerUri || defaults.indexerUri,
      indexerWsUri: config.indexerWsUri || defaults.indexerWsUri,
      proverServerUri,
      substrateNodeUri: config.substrateNodeUri || defaults.substrateNodeUri,
    },
  };
}