'use client';

import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { MIDNIGHT_CONTRACT_ADDRESS } from './config';
import { buildBrowserMidnightProviders } from './providers';
import type { ConnectedMidnightWallet } from './lace-connector';
import {
  witnesses,
  createEmptyPrivateState,
  type RobinPrivateState,
} from '../../midnight/witnesses';
import {
  hexToBytes32,
  type PrivateLetterCredential,
} from './credential';

const PRIVATE_STATE_ID = 'robin-private-contract-v1';

async function loadCompiledContract() {
  const contractModule = await import(
    '../../midnight/managed/robin_private/contract/index.js'
  );
  return CompiledContract.make(
    'robin_private',
    contractModule.Contract
  ).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets('/midnight/managed/robin_private')
  );
}

export async function joinRobinPrivateContract(
  wallet: ConnectedMidnightWallet,
  initialPrivateState?: RobinPrivateState
) {
  if (!MIDNIGHT_CONTRACT_ADDRESS) {
    throw new Error(
      'NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS is not set. Deploy the contract first.'
    );
  }

  const providers = buildBrowserMidnightProviders(wallet);
  const compiledContract = await loadCompiledContract();

  const deployed = await findDeployedContract(providers, {
    compiledContract,
    contractAddress: MIDNIGHT_CONTRACT_ADDRESS,
    privateStateId: PRIVATE_STATE_ID,
    initialPrivateState: initialPrivateState ?? createEmptyPrivateState(),
  });

  return { deployed, providers };
}

export async function callRegisterIssuer(
  wallet: ConnectedMidnightWallet,
  issuerIdHex: string
): Promise<string> {
  const { deployed } = await joinRobinPrivateContract(wallet);
  const tx = await deployed.callTx.registerIssuer(hexToBytes32(issuerIdHex));
  return tx.public.txId;
}

export async function callIssueLetter(
  wallet: ConnectedMidnightWallet,
  issuerSecretHex: string,
  commitmentHex: string
): Promise<string> {
  const state = createEmptyPrivateState();
  state.issuerSecret = hexToBytes32(issuerSecretHex);

  const { deployed, providers } = await joinRobinPrivateContract(wallet, state);
  await providers.privateStateProvider.set(PRIVATE_STATE_ID, state);

  const tx = await deployed.callTx.issueLetter(hexToBytes32(commitmentHex));
  return tx.public.txId;
}

export async function callRevokeLetter(
  wallet: ConnectedMidnightWallet,
  issuerSecretHex: string,
  commitmentHex: string
): Promise<string> {
  const state = createEmptyPrivateState();
  state.issuerSecret = hexToBytes32(issuerSecretHex);

  const { deployed, providers } = await joinRobinPrivateContract(wallet, state);
  await providers.privateStateProvider.set(PRIVATE_STATE_ID, state);

  const tx = await deployed.callTx.revokeLetter(hexToBytes32(commitmentHex));
  return tx.public.txId;
}

export async function callProveClaim(
  wallet: ConnectedMidnightWallet,
  credential: PrivateLetterCredential,
  nonceHex: string,
  claim:
    | { type: 'employment' }
    | { type: 'tenure'; minDays: number }
    | { type: 'position'; positionHashHex: string }
): Promise<string> {
  const state: RobinPrivateState = {
    issuerSecret: new Uint8Array(32),
    employeeNameHash: hexToBytes32(credential.employeeNameHash),
    nicHash: hexToBytes32(credential.nicHash),
    positionHash: hexToBytes32(credential.positionHash),
    startDay: BigInt(credential.startDay),
    endDay: BigInt(credential.endDay),
    salt: hexToBytes32(credential.salt),
  };

  const { deployed, providers } = await joinRobinPrivateContract(wallet, state);
  await providers.privateStateProvider.set(PRIVATE_STATE_ID, state);

  const nonceBytes = hexToBytes32(nonceHex);

  if (claim.type === 'employment') {
    const tx = await deployed.callTx.proveVerifiedEmployment(nonceBytes);
    return tx.public.txId;
  }

  if (claim.type === 'tenure') {
    const tx = await deployed.callTx.proveMinTenure(
      nonceBytes,
      BigInt(claim.minDays)
    );
    return tx.public.txId;
  }

  const tx = await deployed.callTx.provePosition(
    nonceBytes,
    hexToBytes32(claim.positionHashHex)
  );
  return tx.public.txId;
}
