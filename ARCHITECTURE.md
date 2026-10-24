# Where this platform sits

This repo is the **clinician-serving layer**. It is the "Remotask" tier: it puts
work in front of licensed clinicians and records what they decide. The **HEALTH
backend** is the "Scale AI" tier: it owns the client relationship, the data, and
everything downstream of a submitted annotation.

There are two task stores, chosen per project in HEALTH
(`project_submissions.task_store`):

- **Native.** Tasks are HEALTH's own items, read from the shared database, and
  each answer is written by one database function together with its completion
  and an event (`lib/taskstore.ts`). The pool has `project_id` set and reads
  that project's config and reviewer count directly (`lib/gate.ts`). After an
  answer this platform nudges HEALTH's `/internal/process-answers` to score it.
  Label Studio is never called. See HEALTH's `docs/native-task-store.md`.
- **Label Studio**, the original path, drawn below. Task ids below a billion are
  Label Studio's; native task numbers start at a billion, which is how a route
  holding only a task id knows which store it belongs to.

The two services do call each other directly in a few places: this platform
reads HEALTH's held cases (`/admin/held/...`) and sends a senior's decision to
`/admin/adjudicate` (`lib/health.ts`), and on the native store it sends the
scoring nudge.

```
 HEALTH backend                Label Studio                 this platform
 ──────────────                ────────────                 ─────────────
 creates the project  ───────▶  project + tasks
 ingests client data            (task.data carries
 (its own _item_id)              HEALTH's _item_id)
                                      │
                                      │  GET tasks       ◀── serves the next
                                      │                      task to a clinician
                                      │                      (eligibility gate)
                                      │
                                      ▼
                                 annotation      ◀────────  POST annotation
                                      │                      (LS-first, then
                                      │                       record completion)
                                      │
 webhook  ◀── ANNOTATION_CREATED ─────┘
 QA · adjudication · gold
 the client deliverable
```

## What this platform owns

- The clinician experience: sign-in, eligibility, calibration, the workspace.
- **The confidentiality gate.** A clinician only ever sees pools they are
  eligible for, re-checked server-side on every pool- and task-scoped request.
- Serving concurrency: which task a clinician gets next, and the overlap ceiling
  (`migrations/002_claim_task_slot.sql`).
- Writing annotations to Label Studio in the exact result format, LS-first, with
  the completion recorded only after the write succeeds.
- Payments to clinicians.

## What this platform does not own

- **Creating Label Studio projects.** A pool maps to a project HEALTH already
  created. Nothing here creates, configures, or deletes projects — `lib/labelstudio.ts`
  exposes only task reads and annotation writes.
- **Ingest.** HEALTH loads client data and stamps its own `_item_id`.
- **Consensus, QA, adjudication, gold.** HEALTH computes these from the
  annotations it pulls via its webhook.
- **The client deliverable.** HEALTH produces and delivers it.

## `/api/internal/preview/{poolId}` is not the deliverable

It exists so ops can see what our clinicians submitted for a pool without
opening Label Studio. Its consensus is a naive majority with no QA, no
adjudication and no gold, so it will disagree with the official deliverable —
when it does, it is the one that is wrong.

It is authorised by `OPS_API_KEY`, returns `internal_only: true` with a notice,
sets `X-Internal-Only: true`, and its CSV downloads as
`INTERNAL-PREVIEW-*.csv` with a banner row. Never send it to a client.

## Adding a client

1. HEALTH creates the Label Studio project, ingests the data, registers its
   webhook.
2. Insert a `pools` row pointing `ls_project_id` at that project, with an
   `eval_config` whose field names match the project's label config `name=`
   attributes, and `maximum_annotations` matching the project's overlap.
3. Grant eligibility. No code changes — the workspace renders from `eval_config`.

`to_name` on every result entry is `"image"`, matching the convention in
HEALTH's label configs.

## Testing

**Never test against a project that has a webhook.** A webhook means HEALTH
consumes every annotation written there, and deleting the tasks afterwards does
not retract what was already delivered.

`scripts/assert-test-project.mjs` enforces this — it refuses any project with a
webhook. Call it before a test writes anything:

```js
import { assertTestProject } from "./scripts/assert-test-project.mjs";
await assertTestProject(38);
```

or from the shell:

```
node scripts/assert-test-project.mjs 38
```

Project 38 ("All Field Types — TEST") is the sandbox and is webhook-free.
Projects 27, 17 and 18 carry HEALTH's webhook — do not write to them.

