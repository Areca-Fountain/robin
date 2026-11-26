-- Run once in Supabase -> SQL Editor.
-- One row per call to /api/v1 made with an API key. Used for rate limiting
-- (calls in the last minute) and for the Usage tab in the company dashboard.
-- Paths are stored with ids removed (for example /api/v1/letters/{id}), never the letter itself.

create table if not exists api_request_logs (
  id           bigint generated always as identity primary key,
  company_id   text not null,
  key_id       uuid,
  method       text not null,
  path         text not null,
  status       integer not null,
  duration_ms  integer,
  created_at   timestamptz not null default now()
);

create index if not exists api_request_logs_key_idx     on api_request_logs (key_id, created_at desc);
create index if not exists api_request_logs_company_idx on api_request_logs (company_id, created_at desc);

-- Server only (service-role key). No policies on purpose.
alter table api_request_logs enable row level security;
