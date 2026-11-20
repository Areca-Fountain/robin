import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getLetterScriptState } from "@/lib/letter-chain";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/letters/utxo?letterId=<uuid>
 * Returns the letter's registry UTxO so the browser can build the revoke transaction.
 * (This is public chain data. The contract itself stops anyone but the issuer from spending it.)
 */
export async function GET(req: Request) {
  const letterId = new URL(req.url).searchParams.get("letterId")?.trim();
  if (!letterId || !UUID_REGEX.test(letterId)) {
    return NextResponse.json({ error: "A valid letterId is required." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: row, error } = await supabase
    .from("letters")
    .select("tx_hash")
    .eq("id", letterId)
    .maybeSingle();

  if (error) {
    console.error("Supabase error:", error);
    return NextResponse.json({ error: "Could not look up the letter." }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Letter not found." }, { status: 404 });
  }

  const state = await getLetterScriptState(row.tx_hash as string);
  if (!state) {
    return NextResponse.json(
      { error: "This letter has no registry UTxO on chain yet." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    txHash: row.tx_hash,
    outputIndex: state.outputIndex,
    amount: state.amount,
    spent: state.spentBy !== null,
    spentBy: state.spentBy,
  });
}