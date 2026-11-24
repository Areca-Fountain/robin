-- Run once in Supabase -> SQL Editor.
-- A short internal reference the company types when issuing (for example "EMP-0042").
-- Do NOT put names, NIC numbers or other personal data in it.
alter table mn_letters add column if not exists note text;
