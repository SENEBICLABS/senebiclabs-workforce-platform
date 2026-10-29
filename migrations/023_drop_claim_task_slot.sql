-- Drop claim_task_slot, which only the Label Studio submit path called.
--
-- It counted readings and inserted the completion under a row lock, after the answer had
-- already been written to Label Studio. On the task store a judgement is recorded by
-- HEALTH's native_submit_judgement (HEALTH migration 005), which enforces the ceiling
-- itself, and a senior's decision is a plain completion insert guarded by its unique
-- index. Nothing calls this function any more: no route, no script, no other function.
--
-- Every overload is dropped (migrations 002, 016 and 018 each declared one). Safe to re-run.
-- Migrations 002, 016 and 018 are history and are not edited.

do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'claim_task_slot'
  loop
    execute format('drop function %s', f);
  end loop;
end $$;
