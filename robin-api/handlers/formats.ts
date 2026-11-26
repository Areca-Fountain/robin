import { requireApiKey, apiErrorResponse } from "@/robin-api/auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const TOKEN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

function placeholdersIn(body: string): string[] {
  const found = new Set<string>();
  for (const m of body.matchAll(TOKEN)) found.add(m[1]);
  return [...found];
}

interface FormatRow {
  id: string;
  name: string;
  body: string | null;
  signer_name: string;
  signer_title: string;
  status: string;
  updated_at: string;
}

/**
 * GET /api/v1/formats
 * The company's letter formats and letterheads. A format id is needed to issue a letter.
 */
export async function GET(req: Request) {
  try {
    const ctx = await requireApiKey(req, "letters:read");
    const supabase = getSupabaseAdmin();

    const [formatsRes, appRes] = await Promise.all([
      supabase
        .from("letter_formats")
        .select("id, name, body, signer_name, signer_title, status, updated_at")
        .eq("company_id", ctx.companyId)
        .order("updated_at", { ascending: false }),
      supabase.from("company_applications").select("letterheads").eq("id", ctx.companyId).maybeSingle(),
    ]);
    if (formatsRes.error) throw formatsRes.error;
    if (appRes.error) throw appRes.error;

    const heads = Array.isArray(appRes.data?.letterheads)
      ? (appRes.data!.letterheads as { id?: string; name?: string }[])
      : [];

    return Response.json({
      formats: ((formatsRes.data ?? []) as FormatRow[]).map((f) => ({
        id: f.id,
        name: f.name,
        status: f.status,
        signerName: f.signer_name,
        signerTitle: f.signer_title,
        placeholders: placeholdersIn(f.body ?? ""),
        updatedAt: f.updated_at,
      })),
      letterheads: heads
        .filter((h) => typeof h.id === "string" && typeof h.name === "string")
        .map((h) => ({ id: h.id as string, name: h.name as string })),
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
