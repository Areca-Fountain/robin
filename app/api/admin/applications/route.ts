import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin, errorResponse } from "@/lib/auth-server";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_STATUSES = ["Under Review", "Verified", "Rejected"] as const;
type AllowedStatus = (typeof ALLOWED_STATUSES)[number];

/**
 * POST /api/admin/applications   (admins only: email must be in ADMIN_EMAILS)
 * Body: { id, status: "Under Review" | "Verified" | "Rejected", onlyIfPending?: boolean }
 *
 * Rules (enforced here, not just in the admin UI):
 *  - "Under Review" is only ever set on a Pending application. If the application
 *    is no longer Pending this is a harmless no-op ({ ok: true, updated: false }).
 *  - "Verified" can never be applied to a Rejected application.
 *  - "Rejected" can be applied to Pending, Under Review or Verified applications.
 *
 * Every change is a single conditional UPDATE, so two admins clicking at the same
 * time cannot undo each other's decision.
 */
export async function POST(req: Request) {
  try {
    await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    const bad = (error: string, status = 400) => Response.json({ error }, { status });

    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!UUID_REGEX.test(id)) return bad("Invalid application id.");

    const status = body.status as AllowedStatus;
    if (!ALLOWED_STATUSES.includes(status)) return bad("Invalid status.");

    const supabase = getSupabaseAdmin();

    let query = supabase.from("company_applications").update({ status }).eq("id", id);

    if (status === "Under Review") {
      query = query.eq("status", "Pending");
    } else if (status === "Verified") {
      query = query.neq("status", "Rejected");
    }

    const { data, error } = await query.select("id");
    if (error) throw error;

    if (!data || data.length === 0) {
      // Nothing changed. Work out why so the admin gets a clear message.
      const { data: current, error: lookupError } = await supabase
        .from("company_applications")
        .select("status")
        .eq("id", id)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (!current) return bad("Application not found.", 404);

      if (status === "Under Review") {
        // The page calls this on every preview; already past Pending is fine.
        return Response.json({ ok: true, updated: false, status: current.status });
      }
      return bad("Rejected applications cannot be approved again.", 409);
    }

    return Response.json({ ok: true, updated: true, status });
  } catch (err) {
    return errorResponse(err, "Could not update the company application.");
  }
}