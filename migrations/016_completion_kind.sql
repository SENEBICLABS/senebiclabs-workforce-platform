-- Every paid pass leaves a record, and says which kind of pass it was.
--
-- task_completions was the only per-case record of work, and only three of the
-- four passes a clinician can make ever wrote one. Judging wrote a row,
-- authoring wrote a row, a review pass wrote a row. Flagging wrote nothing at
-- all: it recorded that the case should not be offered to that clinician again
-- and stopped there. So a clinician who read a case, decided honestly that they
-- could not judge it, and said so, left no trace of having done the work.
--
-- Nothing here prices anything. It records what happened, while it is happening,
-- because a rate can be decided later and applied to a record, whereas a pass
-- that was never recorded cannot be reconstructed afterwards.
--
-- Three changes, and they belong together. Adding the column without the other
-- two breaks the overlap ceiling the moment the first flag is written.

begin;

-- 1. The column, defaulting to 'judgement'.
--
--    Checked before writing this: task_completions, task_flags and review_items
--    are all empty, so the default backfills nothing and cannot mislabel
--    anything. It stays as the column default because it is the right answer
--    for the pool shape that is live, and because a row arriving without a kind
--    is a bug worth failing safe on rather than rejecting outright. Every
--    caller in the application states its kind explicitly.
alter table task_completions
  add column if not exists kind text not null default 'judgement';

alter table task_completions
  drop constraint if exists task_completions_kind_check;

alter table task_completions
  add constraint task_completions_kind_check
  check (kind in ('judgement', 'flag', 'authoring', 'review'));

-- 2. The uniqueness rule has to admit the kind.
--
--    It was unique (clinician_id, ls_task_id): one row per clinician per case,
--    full stop. That did real work — it is what stops a reviewer being recorded
--    twice for sending a draft back and then approving the rewrite — and it
--    must keep doing it. But it also means that once a clinician flags a case,
--    no other pass on that case could ever be recorded for them. Flagging would
--    become a one-way door, silently.
--
--    Per kind keeps every dedup that mattered: two review passes on one case
--    still collapse to one row, two authoring passes still collapse to one, a
--    second judgement is still refused. A flag and a later judgement are now
--    two different facts, and both are kept.
alter table task_completions
  drop constraint if exists unique_clinician_task;

drop index if exists unique_clinician_task;

create unique index if not exists unique_clinician_task_kind
  on task_completions (clinician_id, ls_task_id, kind);

-- Counting judgements for one case is now the hot path in claim_task_slot,
-- under a row lock, so it gets its own index rather than a sequential scan.
create index if not exists task_completions_judgements_by_task
  on task_completions (ls_task_id)
  where kind = 'judgement';

-- 3. The overlap ceiling counts judgements, and nothing else.
--
--    A pool commissions a fixed number of readings per case. Flag rows and
--    authoring rows are passes, but they are not readings, and counting them
--    would starve a case of the reviewers it was commissioned for: three
--    clinicians flagging a hard case would fill it and it would never be judged
--    by anyone. The ceiling asks one question, so it counts one kind.
create or replace function claim_task_slot(
  p_clinician_id uuid,
  p_pool_id uuid,
  p_ls_task_id integer,
  p_annotation_data jsonb
) returns text
language plpgsql
as $$
declare
  v_ceiling integer;
  v_taken   integer;
begin
  -- Serialise every claim against this pool.
  select maximum_annotations into v_ceiling
  from pools where id = p_pool_id
  for update;

  if not found then
    return 'full';
  end if;

  -- Has this clinician already JUDGED this case? A flag of theirs on the same
  -- case is a different pass and must not be read as one.
  if exists (
    select 1 from task_completions
    where clinician_id = p_clinician_id
      and ls_task_id = p_ls_task_id
      and kind = 'judgement'
  ) then
    return 'already';
  end if;

  if v_ceiling is not null then
    select count(*) into v_taken
    from task_completions
    where ls_task_id = p_ls_task_id
      and kind = 'judgement';

    if v_taken >= v_ceiling then
      return 'full';
    end if;
  end if;

  insert into task_completions (clinician_id, pool_id, ls_task_id, annotation_data, kind)
  values (p_clinician_id, p_pool_id, p_ls_task_id, p_annotation_data, 'judgement');

  return 'claimed';
exception
  when unique_violation then
    return 'already';
end;
$$;

revoke all on function claim_task_slot(uuid, uuid, integer, jsonb) from public, anon, authenticated;

commit;
