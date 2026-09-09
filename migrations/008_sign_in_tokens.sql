-- Magic-link tokens, so a link can be spent exactly once.
--
-- Before this, verification checked only a signature and an expiry, which made
-- every link replayable for its whole life. A link that sits in a mailbox, gets
-- forwarded, or is captured in a proxy log was a working key for 24 hours.
--
-- One row per link, claimed on first use. The unique primary key is what makes
-- the claim atomic: two requests carrying the same token race to insert, and
-- exactly one wins. The loser is refused.
--
-- The jti is stored as a SHA-256 hash, so this table is a record of what has
-- been spent rather than a collection of usable tokens.

create table if not exists sign_in_tokens (
  jti         text primary key,
  email       text        not null,
  claimed_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

-- Lets an operator see recent sign-in attempts for one address, and supports
-- the cleanup below.
create index if not exists idx_sign_in_tokens_email
  on sign_in_tokens (email, claimed_at desc);

create index if not exists idx_sign_in_tokens_expires
  on sign_in_tokens (expires_at);

-- Rows only need to outlive the token they represent. Anything past its expiry
-- can no longer be replayed even if it were missing from this table, so it is
-- safe to delete. Run periodically; nothing depends on it being prompt.
--
--   delete from sign_in_tokens where expires_at < now() - interval '7 days';
