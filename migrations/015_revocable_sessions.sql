-- Sessions that can be ended.
--
-- verifySessionToken used to check only a token's signature and its seven-day
-- expiry, and never read this table. A session could not be ended early: not on
-- sign-out, not for a lost device, not when someone's access was withdrawn. For
-- a platform handling patient cases, removing access has to take effect on the
-- next request, so verification now requires a row here whose revoked_at is
-- null and whose expires_at is still ahead.
--
-- The token column is already unique, so the lookup by token hash is indexed.

alter table sessions add column if not exists revoked_at timestamptz;

-- Ending every session for one clinician looks them up by clinician. Only live
-- rows are ever updated, so the index covers only those.
create index if not exists idx_sessions_clinician_live
  on sessions (clinician_id)
  where revoked_at is null;
