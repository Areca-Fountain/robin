import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { hashApiKey, looksLikeApiKey, type ApiScope } from "@/robin-api/keys";
import { DEFAULT_RATE_LIMIT_PER_MIN } from "@/robin-api/spec";

/** An error that is safe to show an API caller */
export class ApiError extends Error {
  code: string;
  status: number;
  /** Extra response headers, for example Retry-After */
  headers?: Record<string, string>;
  constructor(code: string, message: string, status: number, headers?: Record<string, string>) {
    super(message);
    this.code = code;
    this.status = status;
    this.headers = headers;
  }
}

/** Every /api/v1 error uses this one shape: { error: { code, message } } */
export function apiErrorResponse(err: unknown) {
  if (err instanceof ApiError) {
    const headers: Record<string, string> = { ...(err.headers ?? {}) };
    if (err.status === 401) headers["WWW-Authenticate"] = "Bearer";
    return Response.json(
      { error: { code: err.code, message: err.message } },
      { status: err.status, headers: Object.keys(headers).length ? headers : undefined }
    );
  }
  console.error("API error:", err);
  return Response.json(
    { error: { code: "internal_error", message: "Something went wrong on our side. Please try again." } },
    { status: 500 }
  );
}

/** The company behind a valid API key */
export interface ApiContext {
  keyId: string;
  keyName: string;
  scopes: string[];
  companyId: string;
  companyName: string;
  /** Pending | Verified | Rejected */
  status: string;
  verified: boolean;
  /** Wallet address saved when the company registered */
  walletAddress: string;
  /** Calls allowed per minute for this key */
  rateLimitPerMinute: number;
}

/** What the logging wrapper (robin-api/log.ts) needs to know about a request */
export interface RequestMeta {
  companyId: string;
  keyId: string;
  limit: number;
  /** Calls already made in the last minute, before this one */
  used: number;
}

const metaByRequest = new WeakMap<Request, RequestMeta>();

export function getRequestMeta(req: Request): RequestMeta | undefined {
  return metaByRequest.get(req);
}

/** Calls per minute per key. Change with ROBIN_API_RATE_LIMIT_PER_MIN in .env.local */
export function rateLimitPerMinute(): number {
  const n = Number(process.env.ROBIN_API_RATE_LIMIT_PER_MIN);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_RATE_LIMIT_PER_MIN;
}

function readKey(req: Request): string {
  const auth = req.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return (req.headers.get("x-api-key") ?? "").trim();
}

/**
 * Counts this key's calls in the last 60 seconds (429 answers are not counted).
 * If the log table is missing or the query fails, rate limiting is skipped instead of
 * breaking the whole API.
 */
async function countRecentCalls(keyId: string): Promise<number> {
  try {
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count, error } = await getSupabaseAdmin()
      .from("api_request_logs")
      .select("id", { count: "exact", head: true })
      .eq("key_id", keyId)
      .neq("status", 429)
      .gte("created_at", since);
    if (error) {
      console.warn("Rate limit check skipped:", error.message);
      return 0;
    }
    return count ?? 0;
  } catch (err) {
    console.warn("Rate limit check skipped:", err);
    return 0;
  }
}

/**
 * Checks the API key on a request and returns the company it belongs to.
 * Pass a scope when the endpoint needs one, for example requireApiKey(req, "letters:write").
 */
export async function requireApiKey(req: Request, scope?: ApiScope): Promise<ApiContext> {
  const key = readKey(req);
  if (!key) {
    throw new ApiError(
      "missing_api_key",
      "Send your API key as: Authorization: Bearer <your key>",
      401
    );
  }
  if (!looksLikeApiKey(key)) {
    throw new ApiError("invalid_api_key", "This API key is not valid.", 401);
  }

  const supabase = getSupabaseAdmin();
  const { data: row, error } = await supabase
    .from("api_keys")
    .select("id, name, company_id, scopes, last_used_at, expires_at, revoked_at")
    .eq("key_hash", hashApiKey(key))
    .maybeSingle();
  if (error) throw error;

  if (!row || row.revoked_at) {
    throw new ApiError("invalid_api_key", "This API key is not valid or has been revoked.", 401);
  }
  if (row.expires_at && new Date(row.expires_at as string).getTime() < Date.now()) {
    throw new ApiError("expired_api_key", "This API key has expired.", 401);
  }

  // Rate limit: the key is real, so from here on every call is logged and counted
  const limit = rateLimitPerMinute();
  const used = await countRecentCalls(row.id as string);
  metaByRequest.set(req, { companyId: row.company_id as string, keyId: row.id as string, limit, used });
  if (used >= limit) {
    throw new ApiError(
      "rate_limited",
      `Too many requests. This key may make ${limit} calls per minute. Try again in a few seconds.`,
      429,
      { "Retry-After": "10", "X-RateLimit-Limit": String(limit), "X-RateLimit-Remaining": "0" }
    );
  }

  const scopes = (row.scopes ?? []) as string[];
  if (scope && !scopes.includes(scope)) {
    throw new ApiError("insufficient_scope", `This API key does not have the "${scope}" permission.`, 403);
  }

  const { data: app, error: appError } = await supabase
    .from("company_applications")
    .select("id, company_name, status, wallet_address")
    .eq("id", row.company_id)
    .maybeSingle();
  if (appError) throw appError;
  if (!app) {
    throw new ApiError("invalid_api_key", "This API key is not valid.", 401);
  }

  // Record "last used" at most once a minute, so busy keys don't cause a write on every call
  const lastUsed = row.last_used_at ? new Date(row.last_used_at as string).getTime() : 0;
  if (Date.now() - lastUsed > 60_000) {
    await supabase
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", row.id);
  }

  return {
    keyId: row.id as string,
    keyName: row.name as string,
    scopes,
    companyId: app.id as string,
    companyName: app.company_name as string,
    status: app.status as string,
    verified: app.status === "Verified",
    walletAddress: (app.wallet_address as string) ?? "",
    rateLimitPerMinute: limit,
  };
}

/** Use this on endpoints that must only work for companies Robin has verified (like issuing) */
export function requireVerifiedCompany(ctx: ApiContext) {
  if (!ctx.verified) {
    throw new ApiError(
      "company_not_verified",
      "Your company has not been verified by Robin yet, so it cannot use this endpoint.",
      403
    );
  }
}
