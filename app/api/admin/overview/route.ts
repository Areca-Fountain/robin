import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin, errorResponse } from "@/lib/auth-server";

/**
 * POST /api/admin/overview   (admins only: email must be in ADMIN_EMAILS)
 * Everything the admin dashboard lists: company submissions and registrar profiles.
 */
export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(req);
    const supabase = getSupabaseAdmin();

    const [apps, registrars] = await Promise.all([
      supabase.from("company_applications").select("*").order("created_at", { ascending: false }),
      supabase.from("registrar_profiles").select("*").order("updated_at", { ascending: false }),
    ]);
    if (apps.error) throw apps.error;
    if (registrars.error) throw registrars.error;

    return Response.json({
      adminEmail: admin.email,
      applications: apps.data ?? [],
      registrars: registrars.data ?? [],
    });
  } catch (err) {
    return errorResponse(err, "Could not load admin data.");
  }
}