// Witnesses = the TypeScript side of the Compact contract.
// They run on the user's own device and are the only place secrets are read.
//
// The generated folder `managed/robin_private/` appears after you run
// `npm run compile` inside /midnight (see the guide).

import type { WitnessContext } from "@midnight-ntwrk/compact-runtime";
import type { Ledger } from "./managed/robin_private/contract/index.js";

/**
 * Private state kept on the device (never sent anywhere).
 *  - issuerSecret: a company's signing secret (only the company needs a real one)
 *  - adminSecret : Robin admin secret (only Robin's admin needs a real one)
 * Employees use empty (all-zero) secrets; their proofs don't touch these.
 */
export type RobinPrivateState = {
  issuerSecret: Uint8Array; // 32 bytes
  adminSecret: Uint8Array; // 32 bytes
};

export const ZERO_32 = new Uint8Array(32);

export function randomBytes32(): Uint8Array {
  const out = new Uint8Array(32);
  crypto.getRandomValues(out);
  return out;
}

export function emptyPrivateState(): RobinPrivateState {
  return { issuerSecret: ZERO_32, adminSecret: ZERO_32 };
}

export function companyPrivateState(issuerSecret: Uint8Array): RobinPrivateState {
  return { issuerSecret, adminSecret: ZERO_32 };
}

export function adminPrivateState(adminSecret: Uint8Array): RobinPrivateState {
  return { issuerSecret: ZERO_32, adminSecret };
}

export const witnesses = {
  issuerSecret: ({
    privateState,
  }: WitnessContext<Ledger, RobinPrivateState>): [RobinPrivateState, Uint8Array] => [
    privateState,
    privateState.issuerSecret,
  ],

  adminSecret: ({
    privateState,
  }: WitnessContext<Ledger, RobinPrivateState>): [RobinPrivateState, Uint8Array] => [
    privateState,
    privateState.adminSecret,
  ],
};