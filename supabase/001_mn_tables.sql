-- Robin Private (Midnight) tables.
-- All tables are prefixed mn_ so the existing Cardano tables are untouched.
-- NO employee personal data is stored here (no name, NIC, position, salary).
-- Run this once in Supabase -> SQL Editor.

-- 1. Companies registered as issuers on the Midnight contract
create table if not exists mn_issuers (
  company_id        text primary key,            -- same id as company_applications.id
  issuer_id         text not null unique,        -- 64-hex: hash of the company's issuer secret
  midnight_address  text,                        -- company's Midnight wallet address (optional)
  registered_tx     text,                        -- tx id of registerIssuer
  status            text not null default 'pending'
                    check (status in ('pending', 'registered', 'removed')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 2. Private letters: only links and public chain data
create table if not exists mn_letters (
  id                 uuid primary key,           -- the letterId used in links
  company_id         text not null,
  commitment         text not null unique,       -- 64-hex commitment on Midnight
  midnight_tx        text,                       -- tx id of issueLetter
  cardano_tx_hash    text,                       -- optional: link to the public Cardano record
  cardano_letter_hash text,                      -- optional: SHA-256 of the PDF (public layer)
  issued_by          text,                       -- email of the person who issued it
  issued_at          timestamptz not null default now(),
  revoked            boolean not null default false,
  revoked_at         timestamptz
);
create index if not exists mn_letters_company_idx on mn_letters (company_id);

-- 3. Verification requests (a verifier asks for ONE specific claim)
create table if not exists mn_verify_requests (
  id             uuid primary key default gen_random_uuid(),
  nonce          text not null unique,           -- 64-hex, answered on-chain by the employee
  claim          text not null check (claim in ('employment', 'tenure', 'position')),
  min_days       integer,                        -- for claim = 'tenure'
  position_hash  text,                           -- for claim = 'position' (64-hex SHA-256)
  status         text not null default 'pending'
                 check (status in ('pending', 'proven', 'expired')),
  issuer_id      text,                           -- filled when proven
  proven_tx      text,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null default (now() + interval '1 day')
);

-- Lock the tables down: only the server (service-role key) may read or write.
-- No policies on purpose, so the browser's anon key can never touch them.
alter table mn_issuers          enable row level security;
alter table mn_letters          enable row level security;
alter table mn_verify_requests  enable row level security;