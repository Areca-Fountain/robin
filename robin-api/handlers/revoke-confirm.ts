import { requireApiKey, apiErrorResponse, ApiError } from "@/robin-api/auth";
import { LETTER_COLUMNS, toApiLetter, UUID_REGEX } from "@/robin-api/letters";
import { TX_HASH_REGEX } from "@/robin-api/issue";
import { getLetterScriptState } from "@/lib/letter-chain";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { loadOwnLetter, markLetterRevoked } from "@/robin-api/revoke";

/**
 * POST /api/v1/letters/{id}/revoke/confirm      Body: { "txHash": "..." }
 * Step 3 of revoking. Looks at Cardano: once the letter's registry record is spent,
 * the letter is marked revoked. Answers 202 until Cardano shows it: call again in ~10 seconds.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireApiKey(req, "letters:write");
    const url = new URL(req.url);

    const parts = url.pathname.split("/").filter(Boolean); // api, v1, letters, {id}, revoke, confirm
    const letterId = decodeURIComponent(parts[parts.length - 3] ?? "");
    if (!UUID_REGEX.test(letterId)) {
      throw new ApiError("invalid_request", "The letter id must be a UUID.", 400);
    }

    const body = await req.json().catch(() => ({}));
    const txHash = typeof body?.txHash === "string" ? body.txHash.trim().toLowerCase() : "";
    if (!TX_HASH_REGEX.test(txHash)) {
      throw new ApiError("invalid_request", "txHash must be a 64-character transaction hash.", 400);
    }

    const row = await loadOwnLetter(ctx, letterId);

    const respond = async (revokeTxHash: string | null) => {
      const { data, error } = await getSupabaseAdmin()
        .from("letters")
        .select(LETTER_COLUMNS)
        .eq("id", letterId)
        .single();
      if (error) throw error;
      return Response.json({
        status: "revoked",
        revokeTxHash,
        letter: toApiLetter(data as unknown as Record<string, unknown>, url.origin),
      });
    };

    // Already marked: answer the same way again (safe to retry)
    if (row.revoked_at) return respond(txHash);

    let state;
    try {
      state = await getLetterScriptState(row.tx_hash as string);
    } catch (err) {
      console.error("Blockfrost error:", err);
      throw new ApiError("chain_unavailable", "Could not reach the blockchain data service. Try again in a moment.", 502);
    }
    if (!state) {
      throw new ApiError("not_registered", "This letter has no registry record on Cardano.", 400);
    }
    if (!state.spentBy) {
      return Response.json(
        { status: "pending", message: "Waiting for Cardano to show the revoke. Call again in about 10 seconds." },
        { status: 202 }
      );
    }

    // Only the issuer's key can spend the record (the contract enforces it), so a spent record means revoked
    await markLetterRevoked(ctx.companyId, letterId);
    return respond(state.spentBy);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
