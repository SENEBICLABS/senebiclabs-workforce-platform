# Where this platform sits

This repo is the **clinician-serving layer**. It is the "Remotask" tier: it puts
work in front of licensed clinicians and records what they decide. The **HEALTH
backend** is the "Scale AI" tier: it owns the client relationship, the data, and
everything downstream of a submitted annotation.

Tasks live in the shared database. A pool serves one HEALTH project
(`pools.project_id`) and reads that project's config and reviewer count
directly (`lib/gate.ts`), so they cannot drift from what HEALTH scores against.
Each answer is written by one database function together with its completion
and an event (`lib/taskstore.ts`), and this platform then nudges HEALTH's
`/internal/process-answers` to score it. See HEALTH's
`docs/native-task-store.md`. A pool with no project is not served at all.

The two services call each other directly in a few places: this platform reads
HEALTH's held cases (`/admin/held/project/...`), sends a senior's decision to
`/admin/adjudicate` (`lib/health.ts`), and sends the scoring nudge.

```
 HEALTH backend                shared database               this platform
 ──────────────                ───────────────               ─────────────
 creates the project  ───────▶  project_items
 ingests client data            (task numbers from
                                 1,000,000,000)
                                      │
                                      │  read tasks      ◀── serves the next
                                      │                      task to a clinician
                                      │                      (eligibility gate)
                                      ▼
                                 task_answers    ◀────────  answer + completion
                                 answer_events               + event, one
                                      │                      transaction
 scores the answer  ◀── nudge ────────┘
 QA · adjudication · gold
 the client deliverable
```

Label Studio, which these tasks used to live in, has been removed. Column names
kept from it (`ls_task_id`, `ls_annotation_id`, `pools.ls_project_id`) now hold
task numbers and answer ids, or nothing, until a migration renames or drops them.

## What this platform owns

- The clinician experience: sign-in, eligibility, calibration, the workspace.
- **The confidentiality gate.** A clinician only ever sees pools they are
  eligible for, re-checked server-side on every pool- and task-scoped request.
- Serving concurrency: which task a clinician gets next, and the overlap ceiling,
  enforced by the database function that records the answer.
- Payments to clinicians.

## What this platform does not own

- **Creating projects.** A pool maps to a project HEALTH already created.
  Nothing here creates, configures, or deletes projects or tasks.
- **Ingest.** HEALTH loads client data as the project's items.
- **Consensus, QA, adjudication, gold.** HEALTH computes these from the
  answers in the task store.
- **The client deliverable.** HEALTH produces and delivers it.

## `/api/internal/preview/{poolId}` is not the deliverable

It exists so ops can see what our clinicians submitted for a pool. Its consensus is a naive majority with no QA, no
adjudication and no gold, so it will disagree with the official deliverable —
when it does, it is the one that is wrong.

It is authorised by `OPS_API_KEY`, returns `internal_only: true` with a notice,
sets `X-Internal-Only: true`, and its CSV downloads as
`INTERNAL-PREVIEW-*.csv` with a banner row. Never send it to a client.

## Adding a client

1. HEALTH creates the project and ingests the data.
2. Insert a `pools` row with `project_id` set to that project (`ls_project_id`
   is required by the table and unused: use `0`). The pool needs no config of
   its own. See HEALTH's `docs/native-task-store.md`.
3. Grant eligibility. No code changes — the workspace renders from the
   project's `eval_config`.

## Testing

`npx vitest run` runs the unit tests. The task store's database guarantees are
tested against Postgres in HEALTH's `tests/sql`, and HEALTH's
`scripts/native_e2e_stack.sh` starts a throwaway copy of both apps for an
end-to-end rehearsal (`tests/e2e/test_native_cutover.py`). Nothing in either
touches production.

The hand-run `scripts/verify-*.mjs` read `.env.local` and run against a live
database. Only the read-only ones and those that build their own throwaway rows
remain; the write-path checks that needed a webhook-free Label Studio project
went with it.
