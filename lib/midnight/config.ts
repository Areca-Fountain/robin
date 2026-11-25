export const MIDNIGHT_ENABLED =
  process.env.NEXT_PUBLIC_MIDNIGHT_ENABLED === 'true';

export const MIDNIGHT_NETWORK_ID =
  process.env.NEXT_PUBLIC_MIDNIGHT_NETWORK_ID || 'preprod';

export const MIDNIGHT_CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS || '';

export interface MidnightServiceUris {
  indexerUri: string;
  indexerWsUri: string;
  proverServerUri: string;
  substrateNodeUri: string;
}

export function getDefaultMidnightUris(): MidnightServiceUris {
  const projectId = process.env.NEXT_PUBLIC_MIDNIGHT_BLOCKFROST_KEY || '';
  const query = projectId ? `?project_id=${encodeURIComponent(projectId)}` : '';

  return {
    indexerUri:
      process.env.NEXT_PUBLIC_MIDNIGHT_INDEXER_URI ||
      `https://midnight-preprod.blockfrost.io/api/v0${query}`,
    indexerWsUri:
      process.env.NEXT_PUBLIC_MIDNIGHT_INDEXER_WS_URI ||
      `wss://midnight-preprod.blockfrost.io/api/v0/ws${query}`,
    proverServerUri:
      process.env.NEXT_PUBLIC_MIDNIGHT_PROVER_URI || 'http://localhost:6300',
    substrateNodeUri:
      process.env.NEXT_PUBLIC_MIDNIGHT_NODE_URI ||
      `https://rpc.midnight-preprod.blockfrost.io${query}`,
  };
}
