import { supabase } from "@/lib/supabase";

export type AccountRole = "admin" | "company" | "registrar" | "none";

export interface AccountInfo {
  email: string;
  role: AccountRole;
  /** Where this role's own portal lives */
  home: string;
  /** Set when the account is both a registrar and a company */
  conflict: string | null;
}

export const ROLE_LABEL: Record<AccountRole, string> = {
  admin: "Robin admin",
  company: "company",
  registrar: "registrar",
  none: "unregistered",
};

/** POST to one of our API routes with the Google login attached */
export async function authedPost(path: string, body: unknown = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Please sign in.");
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

/** Asks the server what the signed-in account is. Returns null when nobody is signed in. */
export async function fetchAccount(intent?: "registrar"): Promise<AccountInfo | null> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;

  const res = await authedPost("/api/auth/session", intent ? { intent } : {});
  if (res.status === 401) {
    await supabase.auth.signOut();
    return null;
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Could not check your account.");
  return json as AccountInfo;
}