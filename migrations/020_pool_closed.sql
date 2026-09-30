-- A pool can be finished in two ways, and only one of them is countable.
--
-- Nothing left below the reviewer ceiling and nothing still held means the work
-- is done, and the platform can see that for itself. Delivered is different: a
-- project can be handed downstream while cases technically remain, and after
-- that no clinician should be offered any of it. No count can tell you that
-- happened, so an operator says so here.
--
-- Null means open. The timestamp is kept rather than a boolean because "when
-- did this pool stop taking work" is the question anyone asks afterwards, and a
-- boolean cannot answer it.
alter table pools add column if not exists closed_at timestamptz;

comment on column pools.closed_at is
  'When an operator closed this pool to clinicians. Null while it is open.';
