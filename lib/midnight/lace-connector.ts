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

export function findLaceMidnightConnector(): {
  key: string;
  connector: InitialAPI;
} | null {
  if (typeof window === 'undefined' || !window.midnight) return null;

  if (window.midnight.mnLace) {
    return { key: 'mnLace', connector: window.midnight.mnLace };
  }

  for (const [key, entry] of Object.entries(window.midnight)) {
    if (!entry || typeof entry.connect !== 'function') continue;
    const name = (entry.name || '').toLowerCase();
    const rdns = ((entry as unknown as { rdns?: string }).rdns || '').toLowerCase();
    if (name.includes('lace') || rdns === 'io.lace.wallet') {
      return { key, connector: entry };
    }
  }

  return null;
}

export async function connectLaceMidnight(
  networkId: string = MIDNIGHT_NETWORK_ID
): Promise<ConnectedMidnightWallet> {
  const found = findLaceMidnightConnector();
  if (!found) {
    throw new Error(
      'Lace Midnight wallet not detected. Install or update Lace 2.x in Chrome/Edge and enable Midnight.'
    );
  }

  const api = await found.connector.connect(networkId);
  const config = await api.getConfiguration();
  const defaults = getDefaultMidnightUris();

  const shielded = await api.getShieldedAddresses();
  const unshielded = await api.getUnshieldedAddress();
  const dust = await api.getDustAddress();

  return {
    walletKey: found.key,
    walletName: found.connector.name || 'Lace',
    api,
    shieldedAddress: shielded.shieldedAddress,
    unshieldedAddress: unshielded.unshieldedAddress,
    dustAddress: dust.dustAddress,
    coinPublicKey: shielded.shieldedCoinPublicKey,
    encryptionPublicKey: shielded.shieldedEncryptionPublicKey,
    uris: {
      indexerUri: config.indexerUri || defaults.indexerUri,
      indexerWsUri: config.indexerWsUri || defaults.indexerWsUri,
      proverServerUri: config.proverServerUri || defaults.proverServerUri,
      substrateNodeUri: config.substrateNodeUri || defaults.substrateNodeUri,
    },
  };
}
