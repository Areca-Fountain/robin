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

/** Wraps a hex string as a CBOR byte string (adds the length header). */
function cborWrapBytes(hex: string): string {
  const len = hex.length / 2;
  let header: string;
  if (len < 24) header = (0x40 + len).toString(16).padStart(2, "0");
  else if (len < 256) header = "58" + len.toString(16).padStart(2, "0");
  else if (len < 65536) header = "59" + len.toString(16).padStart(4, "0");
  else throw new Error("Script is too large to encode.");
  return header + hex;
}

/**
 * Aiken's `compiledCode` is CBOR-wrapped ONCE. MeshJS removes one wrapper layer
 * before hashing / attaching the script, so it needs the code wrapped TWICE.
 * Without this, Mesh hashes the wrong bytes: the letter gets locked at an address
 * that no valid script matches (so it can never be revoked), and spending fails
 * with "MalformedScriptWitnesses".
 */
export const letterScript = {
  code: cborWrapBytes(validator.compiledCode),
  version: "V3" as const,
};

/** Script hash (hex), as computed by Aiken. */
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