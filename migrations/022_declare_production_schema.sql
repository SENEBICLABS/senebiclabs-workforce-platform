-- Declare what production already has, so a database built from this repo matches it.
--
-- Two changes were made to the live database by hand and never written down here:
--
--   agreement_acceptances  used by /api/agreement/accept and /api/me since August
--   invites.token_hash     invite tokens are stored hashed since 819c311 ("Store invite
--                          tokens as a hash"); the code never writes the plain `token`
--                          column again, but migration 003 still declares it NOT NULL,
--                          so on a database built from this repo every invite failed
--
-- Everything here is IF NOT EXISTS, and nothing is dropped. On production it changes
-- nothing except, if it does not exist yet, adding a unique index on token_hash (a hash
-- per invite; it cannot collide). The plain token column is made optional rather than
-- removed: dropping a column is not something to do by declaration.

create table if not exists agreement_acceptances (
  id            uuid primary key default gen_random_uuid(),
  clinician_id  uuid not null references clinicians (id) on delete cascade,
  version       text not null,
  accepted_at   timestamptz not null default now(),
  ip            text,
  -- A second acceptance of the same version is answered as "already accepted" (23505).
  unique (clinician_id, version)
);
alter table agreement_acceptances enable row level security;

alter table invites add column if not exists token_hash text;

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'invites' and column_name = 'token') then
    alter table invites alter column token drop not null;
  end if;
end $$;

create unique index if not exists invites_token_hash_key on invites (token_hash);
