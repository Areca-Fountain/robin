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

/**
 * The v5 private-state provider has no `set()` any more, so the private state for
 * a call is held here and handed to the witnesses directly. Whatever is stored in
 * the browser database is ignored, so an old stored state can never leak into a call.
 */
let activeState: RobinPrivateState | null = null;

const liveWitnesses = Object.fromEntries(
  Object.entries(witnesses).map(([name, fn]) => [
    name,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ctx: any, ...args: any[]) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (fn as any)({ ...ctx, privateState: activeState ?? ctx.privateState }, ...args),
  ])
);

async function loadCompiledContract() {
  const contractModule = await import(
    '../../midnight/managed/robin_private/contract/index.js'
  );
  return CompiledContract.make(
    'robin_private',
    contractModule.Contract
  ).pipe(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    CompiledContract.withWitnesses(liveWitnesses as any),
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

  const providers = await buildBrowserMidnightProviders(wallet);
  const compiledContract = await loadCompiledContract();

  // The generated contract types are not wired into the SDK generics here,
  // so the call is cast once instead of at every use.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deployed: any = await (findDeployedContract as any)(providers, {
    compiledContract,
    contractAddress: MIDNIGHT_CONTRACT_ADDRESS,
    privateStateId: PRIVATE_STATE_ID,
    initialPrivateState: initialPrivateState ?? createEmptyPrivateState(),
  });

  return { deployed, providers };
}

/** Joins the contract with the given private state, calls one circuit, returns the tx id. */
async function runCircuit(
  wallet: ConnectedMidnightWallet,
  state: RobinPrivateState,
  circuit: string,
  ...args: unknown[]
): Promise<string> {
  activeState = state;
  try {
    const { deployed } = await joinRobinPrivateContract(wallet, state);
    const tx = await deployed.callTx[circuit](...args);
    return tx.public.txId as string;
  } finally {
    activeState = null;
  }
}

export async function callRegisterIssuer(
  wallet: ConnectedMidnightWallet,
  issuerIdHex: string
): Promise<string> {
  return runCircuit(
    wallet,
    createEmptyPrivateState(),
    'registerIssuer',
    hexToBytes32(issuerIdHex)
  );
}

export async function callIssueLetter(
  wallet: ConnectedMidnightWallet,
  issuerSecretHex: string,
  commitmentHex: string
): Promise<string> {
  const state = createEmptyPrivateState();
  state.issuerSecret = hexToBytes32(issuerSecretHex);
  return runCircuit(wallet, state, 'issueLetter', hexToBytes32(commitmentHex));
}

export async function callRevokeLetter(
  wallet: ConnectedMidnightWallet,
  issuerSecretHex: string,
  commitmentHex: string
): Promise<string> {
  const state = createEmptyPrivateState();
  state.issuerSecret = hexToBytes32(issuerSecretHex);
  return runCircuit(wallet, state, 'revokeLetter', hexToBytes32(commitmentHex));
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

  const nonceBytes = hexToBytes32(nonceHex);

  if (claim.type === 'employment') {
    return runCircuit(wallet, state, 'proveVerifiedEmployment', nonceBytes);
  }

  if (claim.type === 'tenure') {
    return runCircuit(wallet, state, 'proveMinTenure', nonceBytes, BigInt(claim.minDays));
  }

  return runCircuit(
    wallet,
    state,
    'provePosition',
    nonceBytes,
    hexToBytes32(claim.positionHashHex)
  );
}