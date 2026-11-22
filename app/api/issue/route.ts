import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getLetterOnChain } from "@/lib/cardano";
import { requireCompany, errorResponse } from "@/lib/auth-server";
import { walletKey } from "@/lib/wallet-key";
import { isValidHash } from "@/lib/hash";
import { getLetterScriptState } from "@/lib/letter-chain";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TX_HASH_REGEX = /^[a-f0-9]{64}$/i;
const FREE_LETTER_LIMIT = 5;

export async function POST(req: Request) {
  try {
    const ctx = await requireCompany(req);
    const body = await req.json().catch(() => ({}));
    const bad = (error: string, status = 400) => Response.json({ error }, { status });

    const letterId = typeof body.letterId === "string" ? body.letterId.trim() : "";
    const letterHash =
      typeof body.letterHash === "string" ? body.letterHash.trim().toLowerCase() : "";
    const txHash = typeof body.txHash === "string" ? body.txHash.trim().toLowerCase() : "";
    const employeeName =
      typeof body.employeeName === "string" ? body.employeeName.trim() : "";
    const position = typeof body.position === "string" ? body.position.trim() : "";
    const formatId = typeof body.formatId === "string" ? body.formatId.trim() : "";

    if (!UUID_REGEX.test(letterId)) return bad("letterId must be a UUID.");
    if (!isValidHash(letterHash)) return bad("letterHash must be a 64-character SHA-256 hex string.");
    if (!TX_HASH_REGEX.test(txHash)) return bad("txHash must be a 64-character transaction hash.");
    if (!employeeName || employeeName.length > 120) return bad("Employee name is required (max 120 characters).");
    if (position.length > 120) return bad("Position is too long (max 120 characters).");
    if (formatId && !UUID_REGEX.test(formatId)) return bad("Invalid format id.");

    const supabase = getSupabaseAdmin();

    // 1. Already saved? (the page may ask again after a timeout)
    const { data: existing, error: existingError } = await supabase
      .from("letters")
      .select("id, company_id, company_name, issued_at, tx_hash, letter_hash")
      .eq("id", letterId)
      .maybeSingle();
    if (existingError) throw existingError;

    if (existing) {
      if (
        existing.company_id === ctx.companyId &&
        existing.tx_hash === txHash &&
        existing.letter_hash === letterHash
      ) {
        return Response.json({
          status: "issued",
          letterId,
          issuedAt: existing.issued_at,
          companyName: existing.company_name,
        });
      }
      return bad("A different letter is already saved with this id.", 409);
    }

    // 1b. Subscription Plan Limit Check (Free = max 5 letters, Premium = unlimited)
    const [{ data: compSub }, { count: issuedCount }] = await Promise.all([
      supabase
        .from("company_applications")
        .select("subscription_plan")
        .eq("id", ctx.companyId)
        .maybeSingle(),
      supabase
        .from("letters")
        .select("id", { count: "exact", head: true })
        .eq("company_id", ctx.companyId),
    ]);

    const currentPlan = compSub?.subscription_plan === "Premium" ? "Premium" : "Free";
    if (currentPlan === "Free" && (issuedCount ?? 0) >= FREE_LETTER_LIMIT) {
      return bad(
        "Free plan limit reached (5 service letters). Upgrade to Premium ($10/month) for unlimited letters.",
        403
      );
    }

    // 2. The format (if any) must belong to this company
    if (formatId) {
      const { data: format, error: formatError } = await supabase
        .from("letter_formats")
        .select("id")
        .eq("id", formatId)
        .eq("company_id", ctx.companyId)
        .maybeSingle();
      if (formatError) throw formatError;
      if (!format) return bad("That format does not belong to your company.", 403);
    }

    if (!ctx.walletAddress) {
      return bad("Your company has no wallet on file. Contact Robin support.", 400);
    }

    // 3. Read the transaction from Cardano
    let onChain;
    try {
      onChain = await getLetterOnChain(txHash);
    } catch (err) {
      console.error("Blockfrost error:", err);
      return bad("Could not reach the blockchain data service. Please try again in a moment.", 502);
    }

    if (!onChain) {
      return Response.json(
        { status: "pending", message: "Waiting for Cardano to confirm the transaction." },
        { status: 202 }
      );
    }

    // 4. The hash written on-chain (single or batch) must include the hash of this letter
    if (!onChain.hashes.includes(letterHash)) {
      return bad("The hash on the blockchain does not match this letter.", 400);
    }

    // 5. The wallet that paid must be THIS company's registered wallet
    if (!onChain.issuerAddress) {
      return bad("Could not read the wallet that issued this transaction.", 502);
    }
    const payer = walletKey(onChain.issuerAddress);
    const registered = walletKey(ctx.walletAddress);
    if (!payer || !registered || payer !== registered) {
      return bad(
        "This transaction was not paid by your company's registered wallet. Connect the wallet you registered with.",
        403
      );
    }

    // 5b. The letter must be registered in the Robin contract
    const scriptState = await getLetterScriptState(txHash);
    if (!scriptState) {
      return bad(
        "This transaction did not register the letter in the Robin contract.",
        400
      );
    }

    // 6. Save the letter record
    const issuedAt = onChain.blockTime
      ? new Date(onChain.blockTime * 1000).toISOString()
      : new Date().toISOString();

    const { error: insertError } = await supabase.from("letters").insert({
      id: letterId,
      company_id: ctx.companyId,
      company_name: ctx.companyName,
      employee_name: employeeName,
      position: position || null,
      issued_at: issuedAt,
      letter_hash: letterHash,
      tx_hash: txHash,
      issuer_address: onChain.issuerAddress,
      format_id: formatId || null,
      issued_by: ctx.email,
    });

    if (insertError) {
      if (insertError.code === "23505") {
        return bad("This letter has already been recorded.", 409);
      }
      throw insertError;
    }

    return Response.json({
      status: "issued",
      letterId,
      issuedAt,
      companyName: ctx.companyName,
    });
  } catch (err) {
    return errorResponse(err, "Issuing failed. Please try again.");
  }
}