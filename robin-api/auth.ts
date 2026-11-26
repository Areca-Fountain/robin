import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { hashApiKey, looksLikeApiKey, type ApiScope } from "@/robin-api/keys";

/** An error that is safe to show an API caller */
export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/** Every /api/v1 error uses this one shape: { error: { code, message } } */
export function apiErrorResponse(err: unknown) {
  if (err instanceof ApiError) {
    return Response.json(
      { error: { code: err.code, message: err.message } },
      {
        status: err.status,
        headers: err.status === 401 ? { "WWW-Authenticate": "Bearer" } : undefined,
      }
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
}

function readKey(req: Request): string {
  const auth = req.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return (req.headers.get("x-api-key") ?? "").trim();
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