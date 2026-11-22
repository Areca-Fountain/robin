import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin, errorResponse } from "@/lib/auth-server";
import { signDocuments } from "@/lib/documents-server";

/**
 * POST /api/admin/overview   (admins only: email must be in ADMIN_EMAILS)
 * Everything the admin dashboard lists: company submissions and registrar profiles.
 *
 * Document fields (rep_letter_url, br_document_url, kyc_document_url,
 * verification_doc_url) come back as signed links that work for 1 hour,
 * because the storage bucket is private. Reload the page to get fresh links.
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

    const applications = apps.data ?? [];
    const registrarRows = registrars.data ?? [];

    const signed = await signDocuments([
      ...applications.flatMap((a) => [a.rep_letter_url, a.br_document_url, a.kyc_document_url]),
      ...registrarRows.map((r) => r.verification_doc_url),
    ]);
    // Keep the field name; swap the stored path for a signed link. Unsignable values become "".
    const swap = (v: unknown) => (typeof v === "string" && v ? (signed.get(v) ?? "") : v);

    return Response.json({
      adminEmail: admin.email,
      applications: applications.map((a) => ({
        ...a,
        rep_letter_url: swap(a.rep_letter_url),
        br_document_url: swap(a.br_document_url),
        kyc_document_url: swap(a.kyc_document_url),
      })),
      registrars: registrarRows.map((r) => ({
        ...r,
        verification_doc_url: swap(r.verification_doc_url),
      })),
    });
  } catch (err) {
    return errorResponse(err, "Could not load admin data.");
  }
}