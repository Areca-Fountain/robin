import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin, errorResponse } from "@/lib/auth-server";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_STATUSES = ["Under Review", "Verified", "Rejected"] as const;
type AllowedStatus = (typeof ALLOWED_STATUSES)[number];

/**
 * POST /api/admin/applications   (admins only: email must be in ADMIN_EMAILS)
 * Body: {
 *   id: string,
 *   status?: "Under Review" | "Verified" | "Rejected",
 *   subscriptionPlan?: "Free" | "Premium",
 *   onlyIfPending?: boolean
 * }
 */
export async function POST(req: Request) {
  try {
    await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    const bad = (error: string, status = 400) => Response.json({ error }, { status });

    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!UUID_REGEX.test(id)) return bad("Invalid application id.");

    const supabase = getSupabaseAdmin();

    // 1. Admin Subscription Plan Override (works regardless of verification status)
    if (body.subscriptionPlan !== undefined) {
      if (body.subscriptionPlan !== "Free" && body.subscriptionPlan !== "Premium") {
        return bad("Invalid subscription plan.");
      }

      const { data, error } = await supabase
        .from("company_applications")
        .update({
          subscription_plan: body.subscriptionPlan,
          subscription_status: "Active",
          subscription_updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("id");

      if (error) throw error;
      if (!data || data.length === 0) return bad("Application not found.", 404);

      return Response.json({ ok: true, updated: true, subscriptionPlan: body.subscriptionPlan });
    }

    // 2. Application Verification Status Update
    const status = body.status as AllowedStatus;
    if (!ALLOWED_STATUSES.includes(status)) return bad("Invalid status.");

    let query = supabase.from("company_applications").update({ status }).eq("id", id);

    if (status === "Under Review") {
      query = query.eq("status", "Pending");
    } else if (status === "Verified") {
      query = query.neq("status", "Rejected");
    }

    const { data, error } = await query.select("id");
    if (error) throw error;

    if (!data || data.length === 0) {
      const { data: current, error: lookupError } = await supabase
        .from("company_applications")
        .select("status")
        .eq("id", id)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (!current) return bad("Application not found.", 404);

      if (status === "Under Review") {
        return Response.json({ ok: true, updated: false, status: current.status });
      }
      return bad("Rejected applications cannot be approved again.", 409);
    }

    return Response.json({ ok: true, updated: true, status });
  } catch (err) {
    return errorResponse(err, "Could not update the company application.");
  }
}