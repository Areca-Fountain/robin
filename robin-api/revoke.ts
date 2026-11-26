import "server-only";

import { BlockfrostProvider, MeshTxBuilder } from "@meshsdk/core";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ApiError, type ApiContext } from "@/robin-api/auth";
import {
  REVOKE_REDEEMER,
  getLetterScriptAddress,
  issuerKeyHash,
  letterScript,
} from "@/lib/contract";
import { getLetterScriptState } from "@/lib/letter-chain";
import { walletKey } from "@/lib/wallet-key";
import { LETTER_COLUMNS } from "@/robin-api/letters";

/** Sets revoked_at once. Safe to call again. */
export async function markLetterRevoked(companyId: string, letterId: string) {
  const { error } = await getSupabaseAdmin()
    .from("letters")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", letterId)
    .eq("company_id", companyId)
    .is("revoked_at", null);
  if (error) throw error;
}

/** Loads one letter of this company, or throws 404 */
export async function loadOwnLetter(ctx: ApiContext, letterId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("letters")
    .select(`${LETTER_COLUMNS}, issuer_address`)
    .eq("id", letterId)
    .eq("company_id", ctx.companyId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new ApiError("letter_not_found", "No letter with this id was found for your company.", 404);
  }
  return data as unknown as Record<string, unknown>;
}

/**
 * Builds the UNSIGNED revoke transaction. Same shape as revokeLetterOnChain in
 * lib/letter-tx.ts, but the server builds it and the company signs it elsewhere.
 */
export async function prepareRevoke(ctx: ApiContext, letterId: string, changeAddress: string) {
  if (!ctx.walletAddress) {
    throw new ApiError("wallet_missing", "Your company has no wallet on file. Contact Robin support.", 400);
  }
  const given = walletKey(changeAddress);
  const registered = walletKey(ctx.walletAddress);
  if (!given) throw new ApiError("invalid_request", "changeAddress is not a valid Cardano address.", 400);
  if (!registered || given !== registered) {
    throw new ApiError(
      "wallet_mismatch",
      "changeAddress is not your company's registered wallet. Use the wallet you registered with.",
      403
    );
  }

  const row = await loadOwnLetter(ctx, letterId);
  if (row.revoked_at) {
    throw new ApiError("already_revoked", "This letter is already revoked.", 409);
  }

  // The contract only accepts the key that issued the letter. Check early for a clear message.
  try {
    if (row.issuer_address && issuerKeyHash(changeAddress) !== issuerKeyHash(row.issuer_address as string)) {
      throw new ApiError(
        "wallet_mismatch",
        "changeAddress must be the same address that issued this letter. Other addresses of the wallet cannot revoke it.",
        403
      );
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    // The stored address could not be read. Skip this early check; the chain still enforces it.
  }

  let state;
  try {
    state = await getLetterScriptState(row.tx_hash as string);
  } catch (err) {
    console.error("Blockfrost error:", err);
    throw new ApiError("chain_unavailable", "Could not read the blockchain. Try again in a moment.", 502);
  }
  if (!state) {
    throw new ApiError("not_registered", "This letter has no registry record on Cardano, so it cannot be revoked.", 400);
  }
  if (state.spentBy) {
    await markLetterRevoked(ctx.companyId, letterId);
    throw new ApiError("already_revoked", "This letter was already revoked on Cardano.", 409);
  }

  const blockfrostKey = process.env.BLOCKFROST_KEY;
  if (!blockfrostKey) throw new Error("Missing BLOCKFROST_KEY environment variable");
  const provider = new BlockfrostProvider(blockfrostKey);

  let utxos;
  try {
    utxos = await provider.fetchAddressUTxOs(changeAddress);
  } catch (err) {
    console.error("Blockfrost UTxO error:", err);
    throw new ApiError("chain_unavailable", "Could not read your wallet from the blockchain. Try again in a moment.", 502);
  }
  if (!utxos.length) {
    throw new ApiError("wallet_empty", "Your company wallet has no funds. Get test ADA from the Preprod faucet.", 400);
  }

  // Script transactions need collateral: a UTxO of only ADA, 5 ADA or more
  const collateral = utxos.find(
    (u) =>
      u.output.amount.length === 1 &&
      u.output.amount[0].unit === "lovelace" &&
      Number(u.output.amount[0].quantity) >= 5_000_000
  );
  if (!collateral) {
    throw new ApiError(
      "no_collateral",
      "Your wallet needs one UTxO of 5 ADA or more that holds only ADA (used as collateral).",
      400
    );
  }

  const txBuilder = new MeshTxBuilder({ fetcher: provider });
  txBuilder.setNetwork("preprod");
  const unsignedTx = await txBuilder
    .spendingPlutusScriptV3()
    .txIn(row.tx_hash as string, state.outputIndex, state.amount, getLetterScriptAddress())
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

  return { unsignedTx };
}
