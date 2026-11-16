import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  requireCompany,
  requireOwner,
  findApplicationByPrimaryEmail,
  errorResponse,
} from "@/lib/auth-server";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/team   (needs the Google login token)
 * Body: { action: "list" | "add" | "remove", ... }
 *  - list:   members of this company
 *  - add:    { email, role: "team" | "secondary" }
 *  - remove: { id }
 * Team accounts cannot use this. Only the primary account can add or remove
 * the secondary account.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireCompany(req);
    requireOwner(ctx);

    const body = await req.json().catch(() => ({}));
    const supabase = getSupabaseAdmin();
    const bad = (error: string, status = 400) => Response.json({ error }, { status });

    switch (body.action) {
      case "list": {
        const { data, error } = await supabase
          .from("company_members")
          .select("id, email, role, created_at")
          .eq("company_id", ctx.companyId)
          .order("created_at", { ascending: true });
        if (error) throw error;
        return Response.json({
          primaryEmail: ctx.primaryEmail,
          members: (data ?? []).map((m) => ({
            id: m.id as string,
            email: m.email as string,
            role: m.role as "secondary" | "team",
            createdAt: m.created_at as string,
          })),
        });
      }

      case "add": {
        const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        const role = body.role === "secondary" ? "secondary" : "team";

        if (!EMAIL_REGEX.test(email) || email.length > 200) {
          return bad("Enter a valid email address.");
        }
        if (role === "secondary" && ctx.role !== "primary") {
          return bad("Only the primary account can set the secondary account.", 403);
        }
        if (email === ctx.primaryEmail) {
          return bad("That is already the primary account.");
        }
        if (await findApplicationByPrimaryEmail(email)) {
          return bad("That email is already the primary account of a company.");
        }

        if (role === "secondary") {
          const { count, error } = await supabase
            .from("company_members")
            .select("id", { count: "exact", head: true })
            .eq("company_id", ctx.companyId)
            .eq("role", "secondary");
          if (error) throw error;
          if ((count ?? 0) >= 1) {
            return bad("There is already a secondary account. Remove it first.");
          }
        }

        const { error: insertError } = await supabase.from("company_members").insert({
          company_id: ctx.companyId,
          email,
          role,
          added_by: ctx.email,
        });
        if (insertError) {
          if (insertError.code === "23505") {
            return bad("That email is already linked to a company.", 409);
          }
          throw insertError;
        }
        return Response.json({ ok: true });
      }

      case "remove": {
        const id = typeof body.id === "string" ? body.id.trim() : "";
        if (!UUID_REGEX.test(id)) return bad("Invalid member id.");

        const { data: member, error } = await supabase
          .from("company_members")
          .select("id, role")
          .eq("id", id)
          .eq("company_id", ctx.companyId)
          .maybeSingle();
        if (error) throw error;
        if (!member) return bad("Member not found.", 404);
        if (member.role === "secondary" && ctx.role !== "primary") {
          return bad("Only the primary account can remove the secondary account.", 403);
        }

        const { error: deleteError } = await supabase
          .from("company_members")
          .delete()
          .eq("id", id)
          .eq("company_id", ctx.companyId);
        if (deleteError) throw deleteError;
        return Response.json({ ok: true });
      }

      default:
        return bad("Unknown action.");
    }
  } catch (err) {
    return errorResponse(err, "Could not complete the team request.");
  }
}