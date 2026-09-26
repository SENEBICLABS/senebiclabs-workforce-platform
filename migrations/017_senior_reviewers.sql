-- Seniority is per pool, not per clinician.
--
-- A clinician who settles disagreements in radiology is not thereby the person
-- to settle them in lab interpretation. The right to adjudicate belongs to the
-- pairing of a clinician and a pool, which is what pool_eligibility already is,
-- so it goes there rather than on clinicians.
--
-- Default false. Seniority is granted deliberately, the same way eligibility is,
-- and a clinician who is merely eligible stays merely eligible.
--
-- This migration adds the column and nothing else. What a senior is offered,
-- and the one extra judgement they are allowed on a held case, are changes to
-- claim_task_slot and to the serving route; they are deliberately not here,
-- because the number of readings a case takes before it is held decides how
-- that exception should be written, and that is still being settled.

begin;

alter table pool_eligibility
  add column if not exists senior boolean not null default false;

-- The serving path asks "is this clinician senior for this pool" on every
-- request for work, and the ops console asks "who are the seniors of this
-- pool". Both are answered from the existing (clinician_id, pool_id) access
-- pattern, so no new index is needed for them.
--
-- This one is for the other direction: listing the pools a clinician is senior
-- for, which is a small set and rarely asked, but the partial index costs
-- almost nothing because it indexes only the rows where senior is true.
create index if not exists pool_eligibility_seniors
  on pool_eligibility (pool_id, clinician_id)
  where senior = true;

commit;
