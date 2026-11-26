-- Run once in Supabase -> SQL Editor.
-- A "draft" is a letter that Robin has prepared (PDF made, hash computed, unsigned
-- transaction returned) but that the company has not signed and confirmed yet.
-- Drafts are not letters: nothing appears in /api/v1/letters until confirmation.

create table if not exists letter_drafts (
  id             uuid primary key,              -- becomes letters.id on confirmation
  company_id     text not null,
  key_id         uuid,                          -- the API key that created it
  letter_hash    text not null,
  employee_name  text not null,
  position       text,
  work_status    text,                          -- active | resigned
  format_id      uuid,
  issuer_address text not null,                 -- the company wallet address used to build the transaction
  verify_url     text not null,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  confirmed_at   timestamptz
);

create index if not exists letter_drafts_company_idx on letter_drafts (company_id);

-- Server only (service-role key). No policies on purpose.
alter table letter_drafts enable row level security;
