import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase-admin";

export type CompanyRole = "primary" | "secondary" | "team";

/** What a signed-in Google account is allowed to be. One account, one role. */
export type AccountRole = "admin" | "company" | "registrar" | "none";

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
  /** The role the signed-in account really has (lets the UI send them to the right portal) */
  role?: AccountRole;
  constructor(message: string, status: number, role?: AccountRole) {
    super(message);
    this.status = status;
    this.role = role;
  }
}

/** Admin emails come from the ADMIN_EMAILS env var (comma separated). Nothing else can make an admin. */
export function getAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(/[,;\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAdminEmail(email: string) {
  return getAdminEmails().has(email.trim().toLowerCase());
}

export interface AuthedUser {
  id: string;
  email: string;
  fullName: string;
}

/** Reads the Google login token from the request and returns the verified user */
export async function authenticate(req: Request): Promise<AuthedUser> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new AuthError("Please sign in.", 401);

  const { data: userData, error: userError } = await getSupabaseAdmin().auth.getUser(token);
  const user = userData?.user;
  if (userError || !user?.email) {
    throw new AuthError("Your session has expired. Please sign in again.", 401);
  }
  if (!user.email_confirmed_at) {
    throw new AuthError("This email address is not confirmed.", 403);
  }
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const fullName = typeof meta.full_name === "string" ? meta.full_name : "";
  return { id: user.id, email: user.email.toLowerCase(), fullName };
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
  company_email: string | null;
  registrar_user_id: string | null;
}

const APPLICATION_COLUMNS =
  "id, company_name, status, wallet_address, rep_email, company_email, registrar_user_id";

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

/**
 * Finds the application whose company login email is this address.
 *  - company_email is the company's login (set by both the company form and registrars)
 *  - rep_email only counts for old rows that have no company_email and were not
 *    submitted by a registrar (rep_email on a registrar submission is the REGISTRAR)
 */
export async function findApplicationByPrimaryEmail(
  email: string
): Promise<ApplicationRow | null> {
  const supabase = getSupabaseAdmin();
  const [byCompany, byRep] = await Promise.all([
    supabase.from("company_applications").select(APPLICATION_COLUMNS).ilike("company_email", likeEscape(email)),
    supabase.from("company_applications").select(APPLICATION_COLUMNS).ilike("rep_email", likeEscape(email)),
  ]);
  if (byCompany.error) throw byCompany.error;
  if (byRep.error) throw byRep.error;

  const matches = new Map<string, ApplicationRow>();
  for (const r of (byCompany.data ?? []) as ApplicationRow[]) {
    if (norm(r.company_email) === email) matches.set(r.id, r);
  }
  for (const r of (byRep.data ?? []) as ApplicationRow[]) {
    if (!norm(r.company_email) && !r.registrar_user_id && norm(r.rep_email) === email) {
      matches.set(r.id, r);
    }
  }
  const rows = [...matches.values()];
  return rows.find((r) => r.status === "Verified") ?? rows[0] ?? null;
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
    primaryEmail: norm(app.company_email) || norm(app.rep_email),
  };
}

/** The company this email belongs to (primary, secondary or team), or null */
async function findCompanyContext(email: string): Promise<CompanyContext | null> {
  const primary = await findApplicationByPrimaryEmail(email);
  if (primary) return toContext(primary, "primary", email);

  const supabase = getSupabaseAdmin();
  const { data: member, error: memberError } = await supabase
    .from("company_members")
    .select("role, company_id")
    .eq("email", email)
    .limit(1)
    .maybeSingle();
  if (memberError) throw memberError;
  if (!member) return null;

  const { data: app, error: appError } = await supabase
    .from("company_applications")
    .select(APPLICATION_COLUMNS)
    .eq("id", member.company_id)
    .maybeSingle();
  if (appError) throw appError;
  return app ? toContext(app as ApplicationRow, member.role as CompanyRole, email) : null;
}

/** True when this login has registered as a registrar (profile row, or it submitted companies) */
async function isRegistrarUser(userId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data: profile, error } = await supabase
    .from("registrar_profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (profile) return true;

  const { data: submitted, error: subError } = await supabase
    .from("company_applications")
    .select("id")
    .eq("registrar_user_id", userId)
    .limit(1);
  if (subError) throw subError;
  return (submitted ?? []).length > 0;
}

export interface Account {
  user: AuthedUser;
  role: AccountRole;
  company: CompanyContext | null;
  /** Set when the account breaks the one-account-one-role rule */
  conflict: string | null;
}

/**
 * Decides what a signed-in account is. Exactly one role:
 *  1. email is in ADMIN_EMAILS                -> admin
 *  2. email belongs to a company              -> company
 *  3. user registered as a registrar          -> registrar
 *  4. otherwise                               -> none (not registered yet)
 * An account that is both a company and a registrar is refused (conflict).
 */
export async function resolveAccount(user: AuthedUser): Promise<Account> {
  if (isAdminEmail(user.email)) {
    return { user, role: "admin", company: null, conflict: null };
  }
  const [company, registrar] = await Promise.all([
    findCompanyContext(user.email),
    isRegistrarUser(user.id),
  ]);
  if (company && registrar) {
    return {
      user,
      role: "none",
      company: null,
      conflict:
        "This Google account is linked to both a registrar and a company. An account can only have one role, so please contact the Robin team.",
    };
  }
  if (company) return { user, role: "company", company, conflict: null };
  if (registrar) return { user, role: "registrar", company: null, conflict: null };
  return { user, role: "none", company: null, conflict: null };
}

/**
 * Company-only access. Registrars and admins are refused here, even though they
 * are signed in, so they never get company features.
 */
export async function requireCompany(req: Request): Promise<CompanyContext> {
  const account = await resolveAccount(await authenticate(req));

  if (account.conflict) throw new AuthError(account.conflict, 403, "none");
  if (account.role === "admin") {
    throw new AuthError("This is a Robin admin account. Use the Admin Panel instead.", 403, "admin");
  }
  if (account.role === "registrar") {
    throw new AuthError(
      "This Google account is a registrar account, so it can't open a company dashboard.",
      403,
      "registrar"
    );
  }
  if (!account.company) {
    throw new AuthError(
      "This Google account is not linked to any company. Use the email the company registered with, or ask your company to add you in Assign Team.",
      403,
      "none"
    );
  }
  return account.company;
}

/** Admin-only access. The email must be listed in the ADMIN_EMAILS env var. */
export async function requireAdmin(req: Request): Promise<AuthedUser> {
  const user = await authenticate(req);
  if (!isAdminEmail(user.email)) {
    throw new AuthError("This account is not allowed to use the admin panel.", 403);
  }
  return user;
}

/**
 * Throws if this email can't be used for a company login because it already
 * belongs to an admin or a registrar. Used before a company or team email is saved.
 */
export async function assertEmailFreeForCompany(email: string) {
  const clean = email.trim().toLowerCase();
  if (isAdminEmail(clean)) {
    throw new AuthError("That email belongs to a Robin admin, so it can't be used for a company.", 409);
  }
  const { data, error } = await getSupabaseAdmin()
    .from("registrar_profiles")
    .select("user_id")
    .ilike("email", likeEscape(clean))
    .limit(1);
  if (error) throw error;
  if ((data ?? []).length > 0) {
    throw new AuthError("That email belongs to a registrar account, so it can't be used for a company.", 409);
  }
}

/** Makes a first-time Google login a registrar (only when it has no other role yet) */
export async function createRegistrarProfile(user: AuthedUser) {
  const { error } = await getSupabaseAdmin()
    .from("registrar_profiles")
    .upsert(
      {
        user_id: user.id,
        email: user.email,
        registrar_type: "Individual",
        full_name: user.fullName,
        private_address: "",
        contact_number: "",
        nic_or_br_number: "",
        verification_doc_url: "",
        verification_status: "Unverified",
        subscription_plan: "Free",
        subscription_status: "Active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id", ignoreDuplicates: true }
    );
  if (error) throw error;
}

/** Only the primary and secondary accounts may manage the team and settings */
export function requireOwner(ctx: CompanyContext) {
  if (ctx.role === "team") {
    throw new AuthError("Only the company's primary or secondary account can do this.", 403);
  }
}

export function errorResponse(err: unknown, fallback: string) {
  if (err instanceof AuthError) {
    return Response.json({ error: err.message, role: err.role }, { status: err.status });
  }
  console.error(fallback, err);
  return Response.json({ error: fallback }, { status: 500 });
}