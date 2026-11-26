import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCompany, requireOwner, errorResponse } from "@/lib/auth-server";
import { generateApiKey } from "@/robin-api/keys";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ACTIVE_KEYS = 5;

/**
 * POST /api/company/api-keys   (needs the Google login token)
 * Body: { action: "list" | "create" | "revoke", ... }
 *  - list:   all keys of this company (never the secret part)
 *  - create: { name }  -> returns the full key ONCE
 *  - revoke: { id }
 * Team accounts cannot use this. Only the primary or secondary account can.
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
          .from("api_keys")
          .select("id, name, key_prefix, scopes, created_by, created_at, last_used_at, revoked_at")
          .eq("company_id", ctx.companyId)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return Response.json({
          keys: (data ?? []).map((k) => ({
            id: k.id as string,
            name: k.name as string,
            prefix: k.key_prefix as string,
            scopes: (k.scopes ?? []) as string[],
            createdBy: (k.created_by as string | null) ?? "",
            createdAt: k.created_at as string,
            lastUsedAt: (k.last_used_at as string | null) ?? null,
            revokedAt: (k.revoked_at as string | null) ?? null,
          })),
        });
      }

      case "create": {
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (!name || name.length > 60) {
          return bad("Give the key a name (max 60 characters).");
        }

        const { count, error: countError } = await supabase
          .from("api_keys")
          .select("id", { count: "exact", head: true })
          .eq("company_id", ctx.companyId)
          .is("revoked_at", null);
        if (countError) throw countError;
        if ((count ?? 0) >= MAX_ACTIVE_KEYS) {
          return bad(`You can have at most ${MAX_ACTIVE_KEYS} active API keys. Revoke one first.`, 409);
        }

        const { key, prefix, hash } = generateApiKey();
        const { data: created, error: insertError } = await supabase
          .from("api_keys")
          .insert({
            company_id: ctx.companyId,
            name,
            key_prefix: prefix,
            key_hash: hash,
            created_by: ctx.email,
          })
          .select("id, name, key_prefix, scopes, created_at")
          .single();
        if (insertError) throw insertError;

        return Response.json({
          // The ONLY time the full key is ever returned. Robin keeps just the hash.
          key,
          id: created.id as string,
          name: created.name as string,
          prefix: created.key_prefix as string,
          scopes: (created.scopes ?? []) as string[],
          createdAt: created.created_at as string,
        });
      }

      case "revoke": {
        const id = typeof body.id === "string" ? body.id.trim() : "";
        if (!UUID_REGEX.test(id)) return bad("Invalid key id.");

        const { data, error } = await supabase
          .from("api_keys")
          .update({ revoked_at: new Date().toISOString() })
          .eq("id", id)
          .eq("company_id", ctx.companyId)
          .is("revoked_at", null)
          .select("id");
        if (error) throw error;
        if (!data || data.length === 0) return bad("That key was not found, or is already revoked.", 404);

        return Response.json({ ok: true });
      }

      default:
        return bad("Unknown action.");
    }
  } catch (err) {
    return errorResponse(err, "Could not manage API keys. Please try again.");
  }
}