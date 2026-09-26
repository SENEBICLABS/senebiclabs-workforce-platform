-- One extra judgement on a held case, and only one.
--
-- A pool commissions a fixed number of readings per case — two, in the
-- lab-interpretation pool. When those two disagree the case is held, and the
-- way out is a third clinician's judgement, which gives a majority. But the
-- ceiling exists precisely to stop a case collecting more readings than the
-- client commissioned, so the third reading has to be an exception rather than
-- a raised ceiling: raising it would open every case to a third reviewer,
-- including the ones that agreed.
--
-- So the caller says when it is adjudicating, and that permits exactly one
-- reading beyond the ceiling. The route is what establishes the right to say
-- it: the clinician is senior for the pool, and the case is one HEALTH is
-- holding. The function's job is only to make the extra slot atomic and to
-- allow no more than one of them.
--
-- Two seniors submitting at the same moment is the case this has to survive.
-- The pool row is locked for the duration, as it already was, so they
-- serialise: the first sees ceiling readings and takes the extra slot, the
-- second sees ceiling + 1 and is refused. Neither can overshoot.
--
-- The adjudicating row is an ordinary judgement, of kind 'judgement'. It is a
-- reading of the case like any other, it is paid like any other, and counting
-- it as anything else would break the ceiling it has just been let past: a
-- separate kind would leave the judgement count at the ceiling and let a second
-- senior in behind it.

begin;

-- The signature gains a parameter, so the old function has to go rather than be
-- replaced. Leaving both would make a four-argument call ambiguous, and
-- PostgREST resolves by argument name: every existing caller would start
-- failing with "function is not unique" instead of claiming a slot.
drop function if exists claim_task_slot(uuid, uuid, integer, jsonb);

create or replace function claim_task_slot(
  p_clinician_id uuid,
  p_pool_id uuid,
  p_ls_task_id integer,
  p_annotation_data jsonb,
  p_adjudication boolean default false
) returns text
language plpgsql
as $$
declare
  v_ceiling integer;
  v_limit   integer;
  v_taken   integer;
begin
  -- Serialise every claim against this pool.
  select maximum_annotations into v_ceiling
  from pools where id = p_pool_id
  for update;

  if not found then
    return 'full';
  end if;

  -- Has this clinician already judged this case? A flag of theirs on the same
  -- case is a different pass and must not be read as one. A senior who took
  -- part in the original reading is caught here too: they cannot adjudicate a
  -- disagreement they are one half of.
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

    -- Adjudicating buys exactly one reading beyond the ceiling, never two.
    v_limit := v_ceiling + (case when p_adjudication then 1 else 0 end);

    if v_taken >= v_limit then
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

revoke all on function claim_task_slot(uuid, uuid, integer, jsonb, boolean) from public, anon, authenticated;

commit;
