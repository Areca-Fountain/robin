import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getRequestMeta } from "@/robin-api/auth";

const UUID_IN_PATH = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** /api/v1/letters/6f1c... -> /api/v1/letters/{id}  (ids are never stored in the log) */
export function normalizePath(pathname: string): string {
  return pathname.replace(UUID_IN_PATH, "{id}");
}

type Handler = (req: Request) => Promise<Response>;

/**
 * Wraps a /api/v1 handler. After the handler answers it
 *  - adds X-RateLimit-Limit and X-RateLimit-Remaining headers
 *  - writes one row to api_request_logs (only when the call had a real API key)
 * A logging failure never breaks the API call.
 */
export function withApiLog(handler: Handler): Handler {
  return async (req) => {
    const started = Date.now();
    const res = await handler(req);

    const meta = getRequestMeta(req);
    if (!meta) return res; // no valid key (401): nothing to log or count

    const headers = new Headers(res.headers);
    const remaining = res.status === 429 ? 0 : Math.max(0, meta.limit - meta.used - 1);
    headers.set("X-RateLimit-Limit", String(meta.limit));
    headers.set("X-RateLimit-Remaining", String(remaining));

    try {
      const { error } = await getSupabaseAdmin()
        .from("api_request_logs")
        .insert({
          company_id: meta.companyId,
          key_id: meta.keyId,
          method: req.method,
          path: normalizePath(new URL(req.url).pathname),
          status: res.status,
          duration_ms: Date.now() - started,
        });
      if (error) console.warn("API log skipped:", error.message);
    } catch (err) {
      console.warn("API log skipped:", err);
    }

    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };
}
