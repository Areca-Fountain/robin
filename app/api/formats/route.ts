import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCompany, errorResponse } from "@/lib/auth-server";
import { validateFormat } from "@/lib/letter-format";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface FormatRow {
  id: string;
  name: string;
  body: string;
  signer_name: string;
  signer_title: string;
  status: string;
  updated_at: string;
}

const COLUMNS = "id, name, body, signer_name, signer_title, status, updated_at";

function toFormat(r: FormatRow) {
  return {
    id: r.id,
    name: r.name,
    body: r.body,
    signerName: r.signer_name,
    signerTitle: r.signer_title,
    status: r.status as "Draft" | "Generated",
    updatedAt: r.updated_at,
  };
}

function str(value: unknown) {
  return typeof value === "string" ? value : "";
}

/**
 * POST /api/formats   (needs the Google login token)
 * Body: { action: "list" | "save" | "generate" | "delete", ... }
 * Every member of the company (primary, secondary, team) can manage formats.
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireCompany(req);
    const body = await req.json().catch(() => ({}));
    const supabase = getSupabaseAdmin();
    const bad = (error: string, status = 400) => Response.json({ error }, { status });

    const id = str(body.id).trim();
    if (id && !UUID_REGEX.test(id)) return bad("Invalid format id.");

    switch (body.action) {
      case "list": {
        const { data, error } = await supabase
          .from("letter_formats")
          .select(COLUMNS)
          .eq("company_id", ctx.companyId)
          .order("updated_at", { ascending: false });
        if (error) throw error;
        return Response.json({ formats: (data as FormatRow[]).map(toFormat) });
      }

      case "save": {
        const input = {
          name: str(body.name),
          body: str(body.body),
          signerName: str(body.signerName),
          signerTitle: str(body.signerTitle),
        };
        const problem = validateFormat(input);
        if (problem) return bad(problem);

        const values = {
          name: input.name.trim(),
          body: input.body.trim(),
          signer_name: input.signerName.trim(),
          signer_title: input.signerTitle.trim(),
          status: "Draft", // any edit needs a new Generate
          updated_at: new Date().toISOString(),
        };

        if (id) {
          const { data, error } = await supabase
            .from("letter_formats")
            .update(values)
            .eq("id", id)
            .eq("company_id", ctx.companyId)
            .select(COLUMNS)
            .maybeSingle();
          if (error) throw error;
          if (!data) return bad("Format not found.", 404);
          return Response.json({ format: toFormat(data as FormatRow) });
        }

        const { data, error } = await supabase
          .from("letter_formats")
          .insert({ ...values, company_id: ctx.companyId, created_by: ctx.email })
          .select(COLUMNS)
          .single();
        if (error) throw error;
        return Response.json({ format: toFormat(data as FormatRow) });
      }

      case "generate": {
        if (!id) return bad("Choose a format.");
        const { data: row, error } = await supabase
          .from("letter_formats")
          .select(COLUMNS)
          .eq("id", id)
          .eq("company_id", ctx.companyId)
          .maybeSingle();
        if (error) throw error;
        if (!row) return bad("Format not found.", 404);

        const f = row as FormatRow;
        const problem = validateFormat({
          name: f.name,
          body: f.body,
          signerName: f.signer_name,
          signerTitle: f.signer_title,
        });
        if (problem) return bad(problem);

        const { data: updated, error: updateError } = await supabase
          .from("letter_formats")
          .update({ status: "Generated", updated_at: new Date().toISOString() })
          .eq("id", id)
          .eq("company_id", ctx.companyId)
          .select(COLUMNS)
          .single();
        if (updateError) throw updateError;
        return Response.json({ format: toFormat(updated as FormatRow) });
      }

      case "delete": {
        if (!id) return bad("Choose a format.");
        const { error } = await supabase
          .from("letter_formats")
          .delete()
          .eq("id", id)
          .eq("company_id", ctx.companyId);
        if (error) throw error;
        return Response.json({ ok: true });
      }

      default:
        return bad("Unknown action.");
    }
  } catch (err) {
    return errorResponse(err, "Could not complete the formats request.");
  }
}