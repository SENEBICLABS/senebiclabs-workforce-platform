-- Access requests are for review, and have nothing to do with invites.
--
-- A request is someone telling us who they are. The operator reads it and marks
-- it reviewed. If there is someone we want, we reach out ourselves and, when it
-- comes to it, send an invitation the ordinary way from the Invites section.
-- Nothing links the two, so a request can never become a way into the invite
-- machinery, and an invitation never depends on how someone first got in touch.
--
-- So the outcome is just whether a person has looked at it: pending or
-- reviewed. There is no "invited" or "declined" to record, and no invite to
-- point at.

-- Any row already decided counts as reviewed. (The table has held no real
-- requests so far, so this is for correctness rather than to preserve data.)
update access_requests set status = 'reviewed' where status in ('invited', 'declined');

alter table access_requests drop constraint if exists access_requests_status_check;
alter table access_requests add constraint access_requests_status_check
  check (status in ('pending', 'reviewed'));

alter table access_requests drop column if exists invite_id;
