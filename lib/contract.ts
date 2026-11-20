// Helpers for talking to the Aiken letter_registry validator from Next.js / MeshJS.
// Requires contracts/plutus.json (created by `aiken build`, see the guide).

import { deserializeAddress, mConStr0, serializePlutusScript } from "@meshsdk/core";
import blueprint from "@/contracts/plutus.json";

const validator = blueprint.validators.find(
  (v) => v.title === "letter_registry.letter_registry.spend"
);

if (!validator) {
  throw new Error(
    "letter_registry.spend not found in contracts/plutus.json. Run `aiken build` in /contracts."
  );
}

/** The compiled script, ready to attach to a Mesh transaction. */
export const letterScript = {
  code: validator.compiledCode,
  version: "V3" as const,
};

/** Script hash (hex). */
export const letterScriptHash: string = validator.hash;

/** Address of the registry on Preprod (network id 0). Issued letters live here. */
export function getLetterScriptAddress(): string {
  return serializePlutusScript(letterScript, undefined, 0).address;
}

/** Payment key hash (hex) of a wallet address, used as the `issuer` in the datum. */
export function issuerKeyHash(walletAddress: string): string {
  return deserializeAddress(walletAddress).pubKeyHash;
}

/** Datum for a new letter: { letter_hash, issuer } */
export function buildLetterDatum(letterHash: string, issuerAddress: string) {
  return mConStr0([letterHash, issuerKeyHash(issuerAddress)]);
}

/** Redeemer for revoking a letter (the `Revoke` constructor). */
export const REVOKE_REDEEMER = mConStr0([]);