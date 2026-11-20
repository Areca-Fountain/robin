// CLIENT-SIDE: builds, signs (Lace) and submits the issue / revoke transactions.
// Import this from "use client" components. It never needs your Blockfrost key.

import { BrowserWallet, MeshTxBuilder } from "@meshsdk/core";
import {
  REVOKE_REDEEMER,
  buildLetterDatum,
  getLetterScriptAddress,
  issuerKeyHash,
  letterScript,
} from "@/lib/contract";
import { isValidHash } from "@/lib/hash";

// Must stay identical to METADATA_LABEL in lib/cardano.ts
const METADATA_LABEL = "7283";

// ADA locked at the script while the letter is active (returned to the issuer on revoke)
const LETTER_LOCK_LOVELACE = "2000000";

export interface ScriptUtxoRef {
  txHash: string;
  outputIndex: number;
  amount: { unit: string; quantity: string }[];
}

/**
 * Issue a letter: locks 2 ADA at the registry script with datum { letter_hash, issuer }
 * and also writes the hash to transaction metadata (label 7283).
 * Returns the transaction hash. Save it as letters.tx_hash in Supabase.
 */
export async function issueLetterOnChain(
  wallet: BrowserWallet,
  letterHash: string
): Promise<{ txHash: string; issuerAddress: string }> {
  if (!isValidHash(letterHash)) {
    throw new Error("letterHash must be a 64-character SHA-256 hex string.");
  }

  const utxos = await wallet.getUtxos();
  if (!utxos.length) {
    throw new Error("This wallet has no funds. Get test ADA from the Preprod faucet.");
  }
  const issuerAddress = await wallet.getChangeAddress();

  const txBuilder = new MeshTxBuilder();
  txBuilder.setNetwork("preprod");

  const unsignedTx = await txBuilder
    .txOut(getLetterScriptAddress(), [
      { unit: "lovelace", quantity: LETTER_LOCK_LOVELACE },
    ])
    .txOutInlineDatumValue(buildLetterDatum(letterHash.toLowerCase(), issuerAddress))
    .metadataValue(METADATA_LABEL, { hash: letterHash.toLowerCase(), v: 1 })
    .changeAddress(issuerAddress)
    .selectUtxosFrom(utxos)
    .complete();

  const signedTx = await wallet.signTx(unsignedTx);
  const txHash = await wallet.submitTx(signedTx);
  return { txHash, issuerAddress };
}

/**
 * Revoke a letter: spends the letter's script UTxO. The contract only allows this
 * if the transaction is signed by the issuer key stored in the datum.
 * Get `ref` from GET /api/letters/utxo?letterId=...
 */
export async function revokeLetterOnChain(
  wallet: BrowserWallet,
  ref: ScriptUtxoRef
): Promise<string> {
  const utxos = await wallet.getUtxos();
  const changeAddress = await wallet.getChangeAddress();

  // Script transactions need collateral. Use the wallet's collateral, or any ADA-only UTxO >= 5 ADA.
  const walletCollateral = await wallet.getCollateral();
  const collateral =
    walletCollateral[0] ??
    utxos.find(
      (u) =>
        u.output.amount.length === 1 &&
        u.output.amount[0].unit === "lovelace" &&
        Number(u.output.amount[0].quantity) >= 5_000_000
    );
  if (!collateral) {
    throw new Error(
      "No collateral found. In Lace, set collateral (Settings), or keep a UTxO of 5+ ADA."
    );
  }

  const txBuilder = new MeshTxBuilder();
  txBuilder.setNetwork("preprod");

  const unsignedTx = await txBuilder
    .spendingPlutusScriptV3()
    .txIn(ref.txHash, ref.outputIndex, ref.amount, getLetterScriptAddress())
    .txInInlineDatumPresent()
    .txInRedeemerValue(REVOKE_REDEEMER)
    .txInScript(letterScript.code)
    .requiredSignerHash(issuerKeyHash(changeAddress))
    .txInCollateral(
      collateral.input.txHash,
      collateral.input.outputIndex,
      collateral.output.amount,
      collateral.output.address
    )
    .changeAddress(changeAddress)
    .selectUtxosFrom(utxos)
    .complete();

  const signedTx = await wallet.signTx(unsignedTx);
  return wallet.submitTx(signedTx);
}