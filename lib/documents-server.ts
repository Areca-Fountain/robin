// SERVER-SIDE ONLY. Helpers for private document storage.
//
// All identity documents (NIC, BR, authorization letters) live in ONE private
// Supabase bucket. Nobody can open them by URL. Admins get short-lived signed
// links, and a registrar can only open their own files.

import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase-admin";

/** The bucket every NEW upload goes to */
export const DOCUMENT_BUCKET = "company-documents";

/** Old rows may point into either bucket. Only these two can ever be signed. */
const ALLOWED_BUCKETS = new Set(["company-documents", "company-docs"]);

export interface DocRef {
  bucket: string;
  path: string;
}

/**
 * Turns whatever is stored in the database into { bucket, path }.
 *  - new rows store a plain path:            "registrar/<userId>/br-documents/<uuid>.pdf"
 *  - old rows store a full public URL:       ".../storage/v1/object/public/company-docs/br-documents/123_ab.pdf"
 * Returns null for anything else (so nothing unexpected is ever signed).
 */
export function parseDocRef(value: unknown): DocRef | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;

  let bucket = DOCUMENT_BUCKET;
  let path = raw;

  if (/^https?:\/\//i.test(raw)) {
    const m = raw.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/([^?#]+)/);
    if (!m) return null;
    bucket = m[1];
    try {
      path = decodeURIComponent(m[2]);
    } catch {
      return null;
    }
  }

  if (!ALLOWED_BUCKETS.has(bucket)) return null;
  if (!path || path.startsWith("/") || path.includes("..") || path.length > 400) return null;
  return { bucket, path };
}

/** One short-lived signed link, or null if the value is not a valid reference or the file is missing */
export async function signDocument(value: unknown, expiresInSeconds = 120): Promise<string | null> {
  const ref = parseDocRef(value);
  if (!ref) return null;
  const { data, error } = await getSupabaseAdmin()
    .storage.from(ref.bucket)
    .createSignedUrl(ref.path, expiresInSeconds);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/**
 * Signs many stored values at once (used by the admin overview).
 * Returns a Map from the stored value to its signed link. Values that cannot be
 * signed are left out of the map.
 */
export async function signDocuments(
  values: unknown[],
  expiresInSeconds = 3600
): Promise<Map<string, string>> {
  const supabase = getSupabaseAdmin();
  const byBucket = new Map<string, Map<string, string>>(); // bucket -> (path -> stored value)

  for (const v of values) {
    const ref = parseDocRef(v);
    if (!ref || typeof v !== "string") continue;
    if (!byBucket.has(ref.bucket)) byBucket.set(ref.bucket, new Map());
    byBucket.get(ref.bucket)!.set(ref.path, v);
  }

  const out = new Map<string, string>();
  for (const [bucket, paths] of byBucket) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrls([...paths.keys()], expiresInSeconds);
    if (error || !data) continue;
    for (const item of data) {
      if (item.error || !item.signedUrl || !item.path) continue;
      const stored = paths.get(item.path);
      if (stored) out.set(stored, item.signedUrl);
    }
  }
  return out;
}

/** Does this registrar own the stored document value? */
export async function registrarOwnsDocument(userId: string, value: string): Promise<boolean> {
  const ref = parseDocRef(value);
  if (!ref) return false;

  // Files uploaded through /api/documents/upload by this registrar
  if (ref.bucket === DOCUMENT_BUCKET && ref.path.startsWith(`registrar/${userId}/`)) {
    return true;
  }

  // Older files: owned if one of this registrar's own rows points at it
  const supabase = getSupabaseAdmin();
  const checks = await Promise.all([
    supabase.from("company_applications").select("id").eq("registrar_user_id", userId).eq("rep_letter_url", value).limit(1),
    supabase.from("company_applications").select("id").eq("registrar_user_id", userId).eq("br_document_url", value).limit(1),
    supabase.from("company_applications").select("id").eq("registrar_user_id", userId).eq("kyc_document_url", value).limit(1),
    supabase.from("registrar_profiles").select("user_id").eq("user_id", userId).eq("verification_doc_url", value).limit(1),
  ]);
  for (const c of checks) {
    if (c.error) throw c.error;
    if ((c.data ?? []).length > 0) return true;
  }
  return false;
}