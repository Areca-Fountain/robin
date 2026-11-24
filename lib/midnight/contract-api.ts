'use client';

import {
  deployContract,
  findDeployedContract,
} from '@midnight-ntwrk/midnight-js-contracts';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { MIDNIGHT_CONTRACT_ADDRESS } from './config';
import { buildBrowserMidnightProviders } from './providers';
import type { ConnectedMidnightWallet } from './lace-connector';
import {
  witnesses,
  adminPrivateState,
  companyPrivateState,
  emptyPrivateState,
  type RobinPrivateState,
} from '../../midnight/witnesses';
import {
  fromHex,
  toHex,
  toChainAttributes,
  type ChainAttributes,
  type CredentialPackage,
} from './credential';

// One private-state slot per role, so one role never overwrites another.
const ADMIN_STATE_ID = 'robin-admin-state';
const COMPANY_STATE_ID = 'robin-company-state';
const EMPLOYEE_STATE_ID = 'robin-employee-state';

async function loadCompiledContract() {
  const contractModule = await import(
    '../../midnight/managed/robin_private/contract/index.js'
  );
  return CompiledContract.make('robin_private', contractModule.Contract).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets('/midnight/managed/robin_private')
  );
}

/** Admin-only, one time: deploys the contract. adminSecret becomes the admin key. */
export async function deployRobinPrivate(
  wallet: ConnectedMidnightWallet,
  adminSecret: Uint8Array
): Promise<{ contractAddress: string; txId: string }> {
  const providers = buildBrowserMidnightProviders(wallet);
  const compiledContract = await loadCompiledContract();
  const state = adminPrivateState(adminSecret);

  const deployed = await deployContract(providers, {
    compiledContract,
    privateStateId: ADMIN_STATE_ID,
    initialPrivateState: state,
    args: [adminSecret], // constructor(sk: Bytes<32>)
  } as never);

  return {
    contractAddress: deployed.deployTxData.public.contractAddress,
    txId: deployed.deployTxData.public.txId,
  };
}
// SDK 5.x may not expose `.set`; try the known names and log what exists.
async function writePrivateState(
  provider: any,
  stateId: string,
  state: RobinPrivateState
) {
  const names = new Set<string>();
  for (let o = provider; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
    Object.getOwnPropertyNames(o).forEach((n) => names.add(n));
  }
  console.log('[privateStateProvider] methods:', [...names]);

  for (const m of ['set', 'setPrivateState', 'put', 'save']) {
    if (typeof provider[m] === 'function') {
      await provider[m](stateId, state);
      return;
    }
  }
  console.warn(
    '[privateStateProvider] no write method found; relying on initialPrivateState.'
  );
}

async function join(
  wallet: ConnectedMidnightWallet,
  stateId: string,
  state: RobinPrivateState
) {
  if (!MIDNIGHT_CONTRACT_ADDRESS) {
    throw new Error(
      'NEXT_PUBLIC_MIDNIGHT_CONTRACT_ADDRESS is not set. Deploy the contract first.'
    );
  }
  const providers = buildBrowserMidnightProviders(wallet);
  // Write the state BEFORE joining so a stale stored state never wins.
    await writePrivateState(providers.privateStateProvider, stateId, state);

  const compiledContract = await loadCompiledContract();
  const deployed = await findDeployedContract(providers, {
    compiledContract,
    contractAddress: MIDNIGHT_CONTRACT_ADDRESS,
    privateStateId: stateId,
    initialPrivateState: state,
  } as never);
  return deployed as any;
}

/** Admin: registers a verified company's issuerId. */
export async function callRegisterIssuer(
  wallet: ConnectedMidnightWallet,
  adminSecretHex: string,
  issuerIdHex: string
): Promise<string> {
  const deployed = await join(
    wallet,
    ADMIN_STATE_ID,
    adminPrivateState(fromHex(adminSecretHex))
  );
  const tx = await deployed.callTx.registerIssuer(fromHex(issuerIdHex));
  return tx.public.txId;
}

/** Company: registers a letter. Only the commitment goes on-chain. */
export async function callIssueLetter(
  wallet: ConnectedMidnightWallet,
  issuerSecretHex: string,
  attributes: ChainAttributes,
  saltHex: string
): Promise<{ txId: string; commitmentHex: string }> {
  const deployed = await join(
    wallet,
    COMPANY_STATE_ID,
    companyPrivateState(fromHex(issuerSecretHex))
  );
  const tx = await deployed.callTx.issueLetter(attributes, fromHex(saltHex));
  return {
    txId: tx.public.txId,
    commitmentHex: toHex(tx.private.result as Uint8Array),
  };
}

/** Company: revokes one of its own letters. */
export async function callRevokeLetter(
  wallet: ConnectedMidnightWallet,
  issuerSecretHex: string,
  commitmentHex: string
): Promise<string> {
  const deployed = await join(
    wallet,
    COMPANY_STATE_ID,
    companyPrivateState(fromHex(issuerSecretHex))
  );
  const tx = await deployed.callTx.revokeLetter(fromHex(commitmentHex));
  return tx.public.txId;
}

/** Employee: proves a claim from their credential file. */
export async function callProveClaim(
  wallet: ConnectedMidnightWallet,
  credential: CredentialPackage,
  nonceHex: string,
  claim:
    | { type: 'employment' }
    | { type: 'tenure'; minDays: number }
    | { type: 'position'; positionHashHex: string }
): Promise<string> {
  const deployed = await join(wallet, EMPLOYEE_STATE_ID, emptyPrivateState());
  const attrs = toChainAttributes(credential);
  const salt = fromHex(credential.salt);
  const nonce = fromHex(nonceHex);

  if (claim.type === 'employment') {
    const tx = await deployed.callTx.proveVerifiedEmployment(attrs, salt, nonce);
    return tx.public.txId;
  }
  if (claim.type === 'tenure') {
    const tx = await deployed.callTx.proveMinTenure(
      attrs,
      salt,
      nonce,
      BigInt(claim.minDays)
    );
    return tx.public.txId;
  }
  const tx = await deployed.callTx.provePosition(
    attrs,
    salt,
    nonce,
    fromHex(claim.positionHashHex)
  );
  return tx.public.txId;
}