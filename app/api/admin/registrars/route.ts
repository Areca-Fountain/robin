import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin, errorResponse } from "@/lib/auth-server";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/admin/registrars   (admins only)
 * Body: { userId, verificationStatus?: "Verified" | "Rejected", subscriptionPlan?: "Free" | "Premium" }
 * A rejected registrar can never be approved again.
 */
export async function POST(req: Request) {
  try {
    await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    const bad = (error: string, status = 400) => Response.json({ error }, { status });

    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    if (!UUID_REGEX.test(userId)) return bad("Invalid registrar id.");

    const patch: Record<string, string> = { updated_at: new Date().toISOString() };
    const supabase = getSupabaseAdmin();

    if (body.verificationStatus !== undefined) {
      if (body.verificationStatus !== "Verified" && body.verificationStatus !== "Rejected") {
        return bad("Invalid verification status.");
      }
      patch.verification_status = body.verificationStatus;
    }
    if (body.subscriptionPlan !== undefined) {
      if (body.subscriptionPlan !== "Free" && body.subscriptionPlan !== "Premium") {
        return bad("Invalid plan.");
      }
      patch.subscription_plan = body.subscriptionPlan;
    }
    if (!patch.verification_status && !patch.subscription_plan) return bad("Nothing to update.");

    let query = supabase.from("registrar_profiles").update(patch).eq("user_id", userId);
    if (patch.verification_status === "Verified") {
      query = query.neq("verification_status", "Rejected");
    }
    const { data, error } = await query.select("user_id");
    if (error) throw error;
    if (!data || data.length === 0) {
      return bad("Rejected registrar verification cannot be approved again.", 409);
    }
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Could not update the registrar.");
  }
}