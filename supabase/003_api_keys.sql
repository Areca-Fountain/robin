-- Run once in Supabase -> SQL Editor.
-- API keys that let a company's own software call the Robin API.
-- Only a SHA-256 hash of each key is stored. The real key is shown once, when it is created.

create table if not exists api_keys (
  id            uuid primary key default gen_random_uuid(),
  company_id    text not null,                 -- same id as company_applications.id
  name          text not null,                 -- label, e.g. "HR system"
  key_prefix    text not null,                 -- first 12 characters, safe to show (rbn_AbCd1234)
  key_hash      text not null unique,          -- SHA-256 hex of the full key
  scopes        text[] not null default array['letters:read', 'letters:write'],
  created_by    text,                          -- email of the person who created it
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  expires_at    timestamptz,                   -- optional; null = never expires
  revoked_at    timestamptz                    -- set when the key is revoked
);

create index if not exists api_keys_company_idx on api_keys (company_id);

-- Only the server (service-role key) may touch this table.
-- No policies on purpose, so the browser's anon key can never read it.
alter table api_keys enable row level security;