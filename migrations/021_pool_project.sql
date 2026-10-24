-- A pool on the native task store points at its HEALTH project, and takes its
-- configuration from there.
--
-- Until now a pool carried its own copy of the project's eval_config and its own
-- reviewer ceiling, both pasted in by hand when the pool was created. HEALTH's
-- copy could then be edited (a rubric fix, a different reviewer count) while
-- clinicians kept answering the old form and stopping at the old ceiling, and
-- nothing would say so. A pool with project_id set has no copy: the gate reads
-- the project's own eval_config and reviewers_per_item, so there is one place to
-- change and nothing to drift.
--
-- Pools without project_id are Label Studio pools and keep working exactly as
-- before, reading their own columns.
--
-- Apply this BEFORE HEALTH's migrations/005_native_task_store.sql, whose
-- functions read pools.project_id.

-- These two columns are read everywhere and were added to the live database by
-- hand, so no migration declared them. Declaring them here is a no-op where they
-- exist and makes a database built from this repo match production.
alter table pools add column if not exists eval_config jsonb;
alter table pools add column if not exists maximum_annotations integer;

alter table pools add column if not exists project_id uuid
  references project_submissions (id) on delete restrict;

-- One pool per native project. Two pools on one project made attribution and
-- cleanup ambiguous on Label Studio (reconcile refuses them for that reason); on
-- the native store they are simply not allowed.
create unique index if not exists pools_one_per_project
  on pools (project_id) where project_id is not null;

comment on column pools.project_id is
  'The HEALTH project this pool serves on the native task store. When set, the pool''s own eval_config and maximum_annotations are ignored.';
