import { createClient } from "@supabase/supabase-js";

// SERVER-SIDE ONLY: uses the service role key, which bypasses Row Level Security.
// Never import this from a "use client" file and never prefix the key with NEXT_PUBLIC_.
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable"
    );
  }

  return createClient(url, key, { auth: { persistSession: false } });
}