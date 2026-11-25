-- Robin Private (Midnight) tables.
-- All tables are prefixed mn_ so the existing Cardano tables are untouched.
-- NO employee personal data is stored here (no name, NIC, position, salary).
-- Run this once in Supabase -> SQL Editor.

create table if not exists mn_issuers (
  company_id text primary key,
  issuer_id text not null unique,
  midnight_address text,
  registered_tx text,
  status text not null default 'pending'
    check (status in ('pending', 'registered', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists mn_letters (
  id uuid primary key,
  company_id text not null,
  commitment text not null unique,
  midnight_tx text,
  cardano_tx_hash text,
  cardano_letter_hash text,
  issued_by text,
  issued_at timestamptz not null default now(),
  revoked boolean not null default false,
  revoked_at timestamptz
);

create index if not exists mn_letters_company_idx on mn_letters (company_id);

create table if not exists mn_verify_requests (
  id uuid primary key default gen_random_uuid(),
  nonce text not null unique,
  claim text not null check (claim in ('employment', 'tenure', 'position')),
  min_days integer,
  position_hash text,
  status text not null default 'pending'
    check (status in ('pending', 'proven', 'expired')),
  issuer_id text,
  proven_tx text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 day')
);

alter table mn_issuers enable row level security;
alter table mn_letters enable row level security;
alter table mn_verify_requests enable row level security;
