-- Access requests.
--
-- Membership is by invitation. A clinician who wants in tells us who they are
-- here; an operator assesses the request and, if there is work that fits, sends
-- a normal invitation from /ops. A request creates nothing and grants nothing:
-- it is a note for a human to read, and the invitation is still the only thing
-- that makes an account.
--
-- Deliberately separate from invites. An invite is a credential we issued; a
-- request is something a stranger typed. Mixing the two in one table would put
-- unverified input next to bearer tokens, and make every invite query filter
-- out rows nobody vouched for.

create table if not exists access_requests (
  id          uuid primary key default gen_random_uuid(),

  -- Length limits are enforced here as well as in the API, because this is the
  -- table an anonymous form writes to and the database is the only layer that
  -- cannot be bypassed by a future caller.
  full_name   text not null check (char_length(full_name) between 1 and 120),
  -- Lowercase and trimmed by construction, as clinicians.email and
  -- invites.invited_email are (migration 009), so lookups can be exact.
  email       text not null check (
                email = lower(btrim(email)) and char_length(email) between 3 and 254
              ),
  specialty   text not null check (char_length(specialty) between 1 and 120),
  credential  text not null check (char_length(credential) between 1 and 120),
  country     text not null check (char_length(country) between 1 and 80),

  -- Rendered as a link in the operator console, so only http(s) is accepted.
  -- Anything else, javascript: included, is refused at write time.
  profile_url text null check (
                profile_url is null
                or (char_length(profile_url) <= 500 and profile_url ~* '^https?://')
              ),
  referred_by text null check (referred_by is null or char_length(referred_by) <= 120),

  status      text not null default 'pending'
                check (status in ('pending', 'invited', 'declined')),
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz null,
  -- The invitation this request led to, so an operator can see the outcome.
  invite_id   uuid null references invites(id) on delete set null
);

-- One open request per address. A second submission while one is waiting is a
-- duplicate, not new information, and the API answers it identically so the
-- form cannot be used to learn whether an address has already asked.
create unique index if not exists idx_access_requests_one_pending
  on access_requests (email)
  where status = 'pending';

-- The operator list: pending requests, newest first.
create index if not exists idx_access_requests_status_recent
  on access_requests (status, created_at desc);

alter table access_requests enable row level security;
-- All access is through the service role in the API layer; no client reads.
