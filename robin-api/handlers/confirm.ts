import { requireApiKey, requireVerifiedCompany, apiErrorResponse, ApiError } from "@/robin-api/auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getLetterOnChain } from "@/lib/cardano";
import { getLetterScriptState } from "@/lib/letter-chain";
import { walletKey } from "@/lib/wallet-key";
import { LETTER_COLUMNS, toApiLetter, UUID_REGEX } from "@/robin-api/letters";
import { assertWithinPlan, TX_HASH_REGEX } from "@/robin-api/issue";

/**
 * POST /api/v1/letters/{id}/confirm   Body: { "txHash": "..." }
 * Step 2 of issuing. Checks the transaction on Cardano and saves the letter.
 * Answers 202 "pending" until Cardano confirms: call again in ~10 seconds.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireApiKey(req, "letters:write");
    requireVerifiedCompany(ctx);

    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean); // api, v1, letters, {id}, confirm
    const letterId = decodeURIComponent(parts[parts.length - 2] ?? "");
    if (!UUID_REGEX.test(letterId)) {
      throw new ApiError("invalid_request", "The letter id must be a UUID.", 400);
    }

    const body = await req.json().catch(() => ({}));
    const txHash = typeof body?.txHash === "string" ? body.txHash.trim().toLowerCase() : "";
    if (!TX_HASH_REGEX.test(txHash)) {
      throw new ApiError("invalid_request", "txHash must be a 64-character transaction hash.", 400);
    }

    const supabase = getSupabaseAdmin();

    // Already confirmed? Answer the same way again (safe to retry).
    const { data: existing, error: existingError } = await supabase
      .from("letters")
      .select(LETTER_COLUMNS)
      .eq("id", letterId)
      .eq("company_id", ctx.companyId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      const row = existing as unknown as Record<string, unknown>;
      if (row.tx_hash !== txHash) {
        throw new ApiError("letter_conflict", "This letter was already issued with a different transaction.", 409);
      }
      return Response.json({ status: "issued", letter: toApiLetter(row, url.origin) });
    }

    const { data: draft, error: draftError } = await supabase
      .from("letter_drafts")
      .select("*")
      .eq("id", letterId)
      .eq("company_id", ctx.companyId)
      .maybeSingle();
    if (draftError) throw draftError;
    if (!draft) {
      throw new ApiError("letter_not_found", "No prepared letter with this id was found for your company.", 404);
    }
    if (new Date(draft.expires_at as string).getTime() < Date.now()) {
      throw new ApiError("draft_expired", "This prepared letter has expired. Start again with POST /api/v1/letters.", 410);
    }

    await assertWithinPlan(ctx.companyId);

    let onChain;
    try {
      onChain = await getLetterOnChain(txHash);
    } catch (err) {
      console.error("Blockfrost error:", err);
      throw new ApiError("chain_unavailable", "Could not reach the blockchain data service. Try again in a moment.", 502);
    }
    if (!onChain) {
      return Response.json(
        { status: "pending", message: "Waiting for Cardano to confirm the transaction. Call again in about 10 seconds." },
        { status: 202 }
      );
    }

    if (!onChain.hashes.includes(draft.letter_hash as string)) {
      throw new ApiError("hash_mismatch", "The hash on the blockchain does not match this letter.", 400);
    }
    if (!onChain.issuerAddress) {
      throw new ApiError("chain_unavailable", "Could not read the wallet that issued this transaction.", 502);
    }
    const payer = walletKey(onChain.issuerAddress);
    const registered = walletKey(ctx.walletAddress);
    if (!payer || !registered || payer !== registered) {
      throw new ApiError("wallet_mismatch", "This transaction was not paid by your company's registered wallet.", 403);
    }
    const scriptState = await getLetterScriptState(txHash);
    if (!scriptState) {
      throw new ApiError("not_registered", "This transaction did not register the letter in the Robin contract.", 400);
    }

    const issuedAt = onChain.blockTime
      ? new Date(onChain.blockTime * 1000).toISOString()
      : new Date().toISOString();

    const { error: insertError } = await supabase.from("letters").insert({
      id: letterId,
      company_id: ctx.companyId,
      company_name: ctx.companyName,
      employee_name: draft.employee_name,
      position: draft.position,
      work_status: draft.work_status,
      issued_at: issuedAt,
      letter_hash: draft.letter_hash,
      tx_hash: txHash,
      issuer_address: onChain.issuerAddress,
      format_id: draft.format_id,
      issued_by: `api:${ctx.keyName}`,
    });
    if (insertError) {
      if (insertError.code === "23505") {
        throw new ApiError("letter_conflict", "This letter has already been recorded.", 409);
      }
      throw insertError;
    }

    await supabase.from("letter_drafts").update({ confirmed_at: new Date().toISOString() }).eq("id", letterId);

    const { data: saved, error: savedError } = await supabase
      .from("letters")
      .select(LETTER_COLUMNS)
      .eq("id", letterId)
      .single();
    if (savedError) throw savedError;

    return Response.json({
      status: "issued",
      letter: toApiLetter(saved as unknown as Record<string, unknown>, url.origin),
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
