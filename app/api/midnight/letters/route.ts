import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { errorResponse, requireCompany } from "@/lib/auth-server";

const HEX64 = /^[0-9a-f]{64}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FREE_LETTER_LIMIT = 5;

const COLUMNS = "id, commitment, midnight_tx, issued_at, revoked, revoked_at, note";

/**
 * POST /api/midnight/letters   (company account, team accounts included)
 *  - list         : this company's private letters (public data only)
 *  - check_quota  : Free plan = 5 letters in total (Cardano + Midnight), Premium = unlimited
 *  - record       : saves the public record after issueLetter succeeded on Midnight
 *  - revoked      : marks a letter revoked after revokeLetter succeeded on Midnight
 * No employee personal data is ever sent to or stored by this route.
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireCompany(req);
    const body = await req.json().catch(() => ({}));
    const { action, letterId, commitment, midnightTx, note } = body as {
      action?: "list" | "check_quota" | "record" | "revoked";
      letterId?: string;
      commitment?: string;
      midnightTx?: string;
      note?: string;
    };
    const supabase = getSupabaseAdmin();

    if (action === "list") {
      const { data, error } = await supabase
        .from("mn_letters")
        .select(COLUMNS)
        .eq("company_id", ctx.companyId)
        .order("issued_at", { ascending: false });
      if (error) throw error;
      return Response.json({ letters: data ?? [] });
    }

    if (action === "check_quota") {
      const [{ data: comp }, cardano, midnight] = await Promise.all([
        supabase
          .from("company_applications")
          .select("subscription_plan")
          .eq("id", ctx.companyId)
          .maybeSingle(),
        supabase
          .from("letters")
          .select("id", { count: "exact", head: true })
          .eq("company_id", ctx.companyId),
        supabase
          .from("mn_letters")
          .select("id", { count: "exact", head: true })
          .eq("company_id", ctx.companyId),
      ]);
      const plan = comp?.subscription_plan === "Premium" ? "Premium" : "Free";
      const used = (cardano.count ?? 0) + (midnight.count ?? 0);
      return Response.json({
        plan,
        used,
        limit: plan === "Premium" ? null : FREE_LETTER_LIMIT,
        allowed: plan === "Premium" || used < FREE_LETTER_LIMIT,
      });
    }

    if (action === "record") {
      if (!letterId || !UUID.test(letterId)) {
        return Response.json({ error: "Invalid letterId" }, { status: 400 });
      }
      if (!commitment || !HEX64.test(commitment)) {
        return Response.json({ error: "Invalid 64-hex commitment" }, { status: 400 });
      }
      if (!midnightTx || typeof midnightTx !== "string") {
        return Response.json({ error: "midnightTx is required" }, { status: 400 });
      }

      // Only a company whose issuer key is registered on-chain may record letters.
      const { data: issuer, error: issuerError } = await supabase
        .from("mn_issuers")
        .select("status")
        .eq("company_id", ctx.companyId)
        .maybeSingle();
      if (issuerError) throw issuerError;
      if (issuer?.status !== "registered") {
        return Response.json(
          { error: "This company's issuer key is not registered on Midnight yet." },
          { status: 403 }
        );
      }

      const cleanNote = typeof note === "string" && note.trim() ? note.trim().slice(0, 100) : null;

      const { data, error } = await supabase
        .from("mn_letters")
        .insert({
          id: letterId,
          company_id: ctx.companyId,
          commitment: commitment.toLowerCase(),
          midnight_tx: midnightTx,
          issued_by: ctx.email,
          note: cleanNote,
        })
        .select(COLUMNS)
        .single();
      if (error) throw error;
      return Response.json({ letter: data });
    }

    if (action === "revoked") {
      if (!letterId || !UUID.test(letterId)) {
        return Response.json({ error: "Invalid letterId" }, { status: 400 });
      }
      const { data, error } = await supabase
        .from("mn_letters")
        .update({ revoked: true, revoked_at: new Date().toISOString() })
        .eq("id", letterId)
        .eq("company_id", ctx.companyId)
        .select(COLUMNS)
        .maybeSingle();
      if (error) throw error;
      if (!data) return Response.json({ error: "Letter not found." }, { status: 404 });
      return Response.json({ letter: data });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    return errorResponse(err, "Could not process the private letters request.");
  }
}