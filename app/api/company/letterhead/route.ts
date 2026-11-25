import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCompany, errorResponse } from "@/lib/auth-server";
import { DOCUMENT_BUCKET, parseDocRef } from "@/lib/documents-server";

export interface CompanyLetterhead {
  id: string;
  name: string;
  path: string;
  createdAt: string;
}

function normalizeLetterheads(raw: unknown): CompanyLetterhead[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is CompanyLetterhead =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as CompanyLetterhead).id === "string" &&
        typeof (item as CompanyLetterhead).name === "string" &&
        typeof (item as CompanyLetterhead).path === "string"
    )
    .map((item) => ({
      id: item.id,
      name: item.name,
      path: item.path,
      createdAt: item.createdAt ?? new Date().toISOString(),
    }));
}

export async function POST(req: Request) {
  try {
    const ctx = await requireCompany(req);
    const body = await req.json().catch(() => ({}));
    const supabase = getSupabaseAdmin();
    const bad = (error: string, status = 400) => Response.json({ error }, { status });

    const action = typeof body.action === "string" ? body.action : "";

    const { data: current, error: fetchErr } = await supabase
      .from("company_applications")
      .select("letterheads")
      .eq("id", ctx.companyId)
      .single();
    if (fetchErr) throw fetchErr;

    const existingList = normalizeLetterheads(current?.letterheads);

    if (action === "save") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) return bad("Please enter a name for this letterhead.");
      if (name.length > 60) return bad("Letterhead name must be 60 characters or fewer.");

      if (existingList.length >= 15) {
        return bad("Maximum 15 letterheads allowed per company. Delete an unused one first.");
      }

      const path = typeof body.path === "string" ? body.path.trim() : "";
      const ref = parseDocRef(path);
      if (
        !ref ||
        ref.bucket !== DOCUMENT_BUCKET ||
        !ref.path.startsWith(`company/${ctx.companyId}/letterheads/`) ||
        !ref.path.endsWith(".pdf")
      ) {
        return bad("Invalid letterhead PDF reference.");
      }

      const newItem: CompanyLetterhead = {
        id: crypto.randomUUID(),
        name,
        path: ref.path,
        createdAt: new Date().toISOString(),
      };

      const updatedList = [...existingList, newItem];

      const { error: updateErr } = await supabase
        .from("company_applications")
        .update({
          letterheads: updatedList,
          letterhead_url: updatedList[0]?.path ?? null,
        })
        .eq("id", ctx.companyId);
      if (updateErr) throw updateErr;

      return Response.json({ ok: true, letterheads: updatedList });
    }

    if (action === "delete") {
      const id = typeof body.id === "string" ? body.id.trim() : "";
      if (!id) return bad("Missing letterhead ID.");

      const target = existingList.find((item) => item.id === id);
      if (!target) return bad("Letterhead not found.", 404);

      const ref = parseDocRef(target.path);
      if (ref && ref.bucket === DOCUMENT_BUCKET) {
        await supabase.storage.from(DOCUMENT_BUCKET).remove([ref.path]);
      }

      const updatedList = existingList.filter((item) => item.id !== id);

      const { error: updateErr } = await supabase
        .from("company_applications")
        .update({
          letterheads: updatedList,
          letterhead_url: updatedList[0]?.path ?? null,
        })
        .eq("id", ctx.companyId);
      if (updateErr) throw updateErr;

      return Response.json({ ok: true, letterheads: updatedList });
    }

    return bad("Unknown action.");
  } catch (err) {
    return errorResponse(err, "Could not update company letterheads.");
  }
}