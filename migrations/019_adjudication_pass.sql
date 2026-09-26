-- A senior's decision is a pass of its own.
--
-- It is not a judgement. A judgement is one reading among the several a case is
-- commissioned for; an adjudication is the answer that settles them, made by
-- someone senior for that pool, and it is recorded in HEALTH as the final label
-- rather than written to Label Studio as a third annotation. Giving it its own
-- kind keeps those two apart everywhere they are counted, and lets the work
-- record show a senior what they actually did.
--
-- It is still work, and it is still paid like any other pass.

begin;

alter table task_completions
  drop constraint if exists task_completions_kind_check;

alter table task_completions
  add constraint task_completions_kind_check
  check (kind in ('judgement', 'flag', 'authoring', 'review', 'adjudication'));

-- One adjudication per case, whoever makes it.
--
-- This is the guard that stops two seniors settling the same disagreement.
-- The ordinary ceiling cannot do it: that counts judgements, and an
-- adjudication is not one. The existing unique index on
-- (clinician_id, ls_task_id, kind) only stops the same senior twice, which is
-- not the problem — two different seniors opening the same held case at the
-- same moment is.
--
-- Unique on the case alone, so the second writer loses on the insert and the
-- route can refuse before it calls HEALTH. That ordering matters: the row is
-- claimed first and HEALTH is told second, so a race can at worst leave a row
-- with no decision behind it, never two decisions for one case.
create unique index if not exists task_completions_one_adjudication
  on task_completions (ls_task_id)
  where kind = 'adjudication';

commit;
