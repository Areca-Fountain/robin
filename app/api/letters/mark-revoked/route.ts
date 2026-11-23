import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCompany, errorResponse } from "@/lib/auth-server";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  try {
    const ctx = await requireCompany(req);
    const body = await req.json().catch(() => ({}));
    const letterId = typeof body.letterId === "string" ? body.letterId.trim() : "";

    if (!UUID_REGEX.test(letterId)) {
      return Response.json({ error: "Invalid letter ID." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("letters")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", letterId)
      .eq("company_id", ctx.companyId);

    if (error) throw error;

    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Could not update revoked status.");
  }
}