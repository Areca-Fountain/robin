import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { witnesses, createEmptyPrivateState } from './witnesses';

async function main() {
  const seedHex = process.env.MIDNIGHT_DEPLOYER_SEED;
  const blockfrostKey = process.env.NEXT_PUBLIC_MIDNIGHT_BLOCKFROST_KEY;

  if (!seedHex || !blockfrostKey) {
    throw new Error(
      'Set MIDNIGHT_DEPLOYER_SEED (64-hex) and NEXT_PUBLIC_MIDNIGHT_BLOCKFROST_KEY in .env.local'
    );
  }

  const query = `?project_id=${encodeURIComponent(blockfrostKey)}`;
  const indexerUri = `https://midnight-preprod.blockfrost.io/api/v0${query}`;
  const indexerWsUri = `wss://midnight-preprod.blockfrost.io/api/v0/ws${query}`;
  const nodeUri = `https://rpc.midnight-preprod.blockfrost.io${query}`;
  const proverUri = process.env.NEXT_PUBLIC_MIDNIGHT_PROVER_URI || 'http://localhost:6300';

  console.log('Initializing deployer wallet on Midnight Preprod...');
  const wallet = await WalletFacade.init({
    seed: Buffer.from(seedHex, 'hex'),
    networkId: 'preprod',
    indexerClientConnection: { indexerHttpUrl: indexerUri, indexerWsUrl: indexerWsUri },
    provingServerUrl: new URL(proverUri),
    relayURL: new URL(nodeUri),
  });

  await wallet.start();
  const state = await wallet.waitForSyncedState();
  console.log('Deployer address:', state.shielded.address);
  console.log('DUST balance:', state.dust.walletBalance(new Date()));

  const managedDir = path.resolve(__dirname, 'managed/robin_private');
  const contractModule = await import(
    path.join(managedDir, 'contract/index.js')
  );

  const compiledContract = CompiledContract.make(
    'robin_private',
    contractModule.Contract
  ).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets(managedDir)
  );

  const providers = {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: 'robin-deployer-state',
    }),
    publicDataProvider: indexerPublicDataProvider(indexerUri, indexerWsUri),
    zkConfigProvider: new NodeZkConfigProvider(managedDir),
    proofProvider: httpClientProofProvider(proverUri),
    walletProvider: {
      getCoinPublicKey: () => state.shielded.coinPublicKey.toHexString(),
      getEncryptionPublicKey: () => state.shielded.encryptionPublicKey.toHexString(),
      balanceTx: (tx: unknown) => wallet.balanceUnboundTransaction(tx as never),
    },
    midnightProvider: {
      submitTx: (tx: unknown) => wallet.submitTransaction(tx as never),
    },
  };

  console.log('Deploying robin_private contract (your Lace wallet becomes the contract admin)...');
  const deployed = await deployContract(providers, {
    compiledContract,
    privateStateId: 'robin-admin-deploy',
    initialPrivateState: createEmptyPrivateState(),
  });

  const contractAddress = deployed.deployTxData.public.contractAddress;
  console.log('\n✅ Contract deployed!');
  console.log(`NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS=${contractAddress}\n`);

  fs.writeFileSync(
    path.join(__dirname, 'deployment.json'),
    JSON.stringify(
      {
        network: 'preprod',
        contractAddress,
        txId: deployed.deployTxData.public.txId,
        deployedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );

  await wallet.stop();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});