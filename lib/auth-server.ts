import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase-admin";

export type CompanyRole = "primary" | "secondary" | "team";

export interface CompanyContext {
  /** The signed-in Google account */
  email: string;
  role: CompanyRole;
  companyId: string;
  companyName: string;
  /** Pending | Verified | Rejected */
  status: string;
  verified: boolean;
  /** Wallet address saved when the company registered */
  walletAddress: string;
  /** The primary account's email */
  primaryEmail: string;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Escapes % _ \ so an email can be used safely in an ILIKE filter */
function likeEscape(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

interface ApplicationRow {
  id: string;
  company_name: string;
  status: string;
  wallet_address: string;
  rep_email: string;
}

const APPLICATION_COLUMNS = "id, company_name, status, wallet_address, rep_email";

/** Finds the application whose primary email is this address (exact, case-insensitive) */
export async function findApplicationByPrimaryEmail(
  email: string
): Promise<ApplicationRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("company_applications")
    .select(APPLICATION_COLUMNS)
    .ilike("rep_email", likeEscape(email));
  if (error) throw error;

  const rows = (data ?? []) as ApplicationRow[];
  return rows.find((r) => String(r.rep_email).trim().toLowerCase() === email) ?? null;
}

function toContext(
  app: ApplicationRow,
  role: CompanyRole,
  email: string
): CompanyContext {
  return {
    email,
    role,
    companyId: app.id,
    companyName: app.company_name,
    status: app.status,
    verified: app.status === "Verified",
    walletAddress: app.wallet_address,
    primaryEmail: String(app.rep_email).trim().toLowerCase(),
  };
}

/**
 * Reads the Google login from the request and finds the company it belongs to.
 *  - the company's primary email  -> role "primary"
 *  - an email added in Settings   -> role "secondary"
 *  - an email added in Assign Team -> role "team"
 * Throws AuthError (with an HTTP status) if the person may not continue.
 */
export async function requireCompany(req: Request): Promise<CompanyContext> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new AuthError("Please sign in.", 401);

  const supabase = getSupabaseAdmin();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user?.email) {
    throw new AuthError("Your session has expired. Please sign in again.", 401);
  }
  if (!user.email_confirmed_at) {
    throw new AuthError("This email address is not confirmed.", 403);
  }
  const email = user.email.toLowerCase();

  // 1. Primary account
  const primary = await findApplicationByPrimaryEmail(email);
  if (primary) return toContext(primary, "primary", email);

  // 2. Secondary or team account
  const { data: member, error: memberError } = await supabase
    .from("company_members")
    .select("role, company_id")
    .eq("email", email)
    .limit(1)
    .maybeSingle();
  if (memberError) throw memberError;

  if (member) {
    const { data: app, error: appError } = await supabase
      .from("company_applications")
      .select(APPLICATION_COLUMNS)
      .eq("id", member.company_id)
      .maybeSingle();
    if (appError) throw appError;
    if (app) {
      return toContext(app as ApplicationRow, member.role as CompanyRole, email);
    }
  }

  throw new AuthError(
    "This Google account is not linked to any company. Use the email the company registered with, or ask your company to add you in Assign Team.",
    403
  );
}

/** Only the primary and secondary accounts may manage the team and settings */
export function requireOwner(ctx: CompanyContext) {
  if (ctx.role === "team") {
    throw new AuthError("Only the company's primary or secondary account can do this.", 403);
  }
}

export function errorResponse(err: unknown, fallback: string) {
  if (err instanceof AuthError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  console.error(fallback, err);
  return Response.json({ error: fallback }, { status: 500 });
}