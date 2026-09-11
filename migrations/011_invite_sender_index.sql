-- Supports the daily invite cap and the operator's sending view.
--
-- Both ask the same question — how many invitations did this inviter create
-- since a point in time — and neither had an index for it. Irrelevant at the
-- current size, but the cap now runs on every invite creation, so it is the
-- kind of thing that is cheap to add today and tedious to diagnose later.
--
-- invited_by leads because the cap filters on it and the view groups by it;
-- created_at follows so the range scan happens inside each inviter's rows.

create index if not exists idx_invites_sender_recent
  on invites (invited_by, created_at desc);
