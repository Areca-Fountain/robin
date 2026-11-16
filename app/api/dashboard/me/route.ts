import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCompany, errorResponse } from "@/lib/auth-server";

/**
 * POST /api/dashboard/me   (needs the Google login token)
 * Who is signed in, which company they belong to, and the Analytics numbers.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireCompany(req);
    const supabase = getSupabaseAdmin();

    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);

    const [letters, thisMonth, formats, generated, members, recent] = await Promise.all([
      supabase.from("letters").select("id", { count: "exact", head: true }).eq("company_id", ctx.companyId),
      supabase.from("letters").select("id", { count: "exact", head: true }).eq("company_id", ctx.companyId).gte("issued_at", startOfMonth.toISOString()),
      supabase.from("letter_formats").select("id", { count: "exact", head: true }).eq("company_id", ctx.companyId),
      supabase.from("letter_formats").select("id", { count: "exact", head: true }).eq("company_id", ctx.companyId).eq("status", "Generated"),
      supabase.from("company_members").select("id", { count: "exact", head: true }).eq("company_id", ctx.companyId).eq("role", "team"),
      supabase.from("letters").select("id, employee_name, position, issued_at, tx_hash").eq("company_id", ctx.companyId).order("issued_at", { ascending: false }).limit(8),
    ]);

    for (const r of [letters, thisMonth, formats, generated, members, recent]) {
      if (r.error) throw r.error;
    }

    return Response.json({
      email: ctx.email,
      role: ctx.role,
      company: {
        id: ctx.companyId,
        name: ctx.companyName,
        status: ctx.status,
        verified: ctx.verified,
        walletAddress: ctx.walletAddress,
        primaryEmail: ctx.primaryEmail,
      },
      stats: {
        letters: letters.count ?? 0,
        lettersThisMonth: thisMonth.count ?? 0,
        formats: formats.count ?? 0,
        generatedFormats: generated.count ?? 0,
        teamMembers: members.count ?? 0,
      },
      recent: (recent.data ?? []).map((l) => ({
        id: l.id as string,
        employeeName: l.employee_name as string,
        position: l.position as string | null,
        issuedAt: l.issued_at as string,
        txHash: l.tx_hash as string,
      })),
    });
  } catch (err) {
    return errorResponse(err, "Could not load the dashboard.");
  }
}