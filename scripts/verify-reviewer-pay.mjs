/**
 * Evidence: reviewer pay does not depend on the outcome.
 *
 *   node scripts/verify-reviewer-pay.mjs
 *
 * A sends work back and is recorded for it. The same reviewer then approves the
 * rewrite of that same task and is not recorded twice. Pay is therefore the
 * same whether they approve or reject, and cannot be earned by rubber-stamping.
 */
import fs from "fs";
import { sessionFor } from "./session-for.mjs";
import { resolveSandbox } from "./sandbox.mjs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const APP = "http://localhost:3000";
const SB = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;
const H = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};
const q = (p, i = {}) => fetch(`${SB}/${p}`, { headers: H, ...i });
const qj = (p, i = {}) => q(p, i).then((r) => r.json());
const LSH = { Authorization: `Token ${env.LABEL_STUDIO_API_TOKEN}`, "Content-Type": "application/json" };
const LS = (p, i = {}) => fetch(`${env.LABEL_STUDIO_API_URL}${p}`, { headers: LSH, ...i });
const hr = (t) => console.log(`\n${"═".repeat(72)}\n${t}\n${"═".repeat(72)}`);

// Named in .env.local, checked for webhooks before a single write.
const { project: PROJECT, pool } = await resolveSandbox("author", env, qj);
if ((await q("review_items?select=id&limit=1")).status === 404) {
  console.log("migrations/006_review_items.sql is not applied — stopping.");
  process.exit(1);
}

const original = structuredClone(pool.eval_config);

hr("SETUP");
const cfg = structuredClone(pool.eval_config);
cfg.review_required = true;
cfg.schema.field_order = ["draft_answer"];
cfg.schema.fields = { draft_answer: { type: "text", title: "Written answer", required: true } };
await q(`pools?id=eq.${pool.id}`, { method: "PATCH", body: JSON.stringify({ eval_config: cfg }) });

const stamp = Date.now().toString().slice(-6);
const A = `godwinyampoi449+wa${stamp}@gmail.com`;   // first author
const R = `godwinyampoi449+wr${stamp}@gmail.com`;   // the reviewer under test
const C = `godwinyampoi449+wc${stamp}@gmail.com`;   // rewrites after the send-back
const ids = {};
for (const email of [A, R, C]) {
  const [c] = await (await q("clinicians", {
    method: "POST", headers: { ...H, Prefer: "return=representation" },
    body: JSON.stringify({ email, name: email.split("+")[1].split("@")[0], access_code: Math.random().toString(36).slice(2, 10).toUpperCase(), active: true }),
  })).json();
  ids[email] = c.id;
  await q("pool_eligibility", { method: "POST", body: JSON.stringify({ clinician_id: c.id, pool_id: pool.id, eligible: true, eligible_since: new Date().toISOString() }) });
}
const call = async (email) => {
  const t = await sessionFor(env, { clinicianId: ids[email], email });
  return (p, i = {}) => fetch(`${APP}${p}`, { ...i, headers: { Cookie: `sessionToken=${t}`, "Content-Type": "application/json", ...i.headers } });
};
const cA = await call(A), cR = await call(R), cC = await call(C);
const nextFor = async (fn, phase) => {
  for (let i = 0; i < 8; i++) {
    const r = await fn(`/api/pools/${pool.id}/next`);
    if (r.status === 204) return null;
    const t = await r.json();
    if (t.phase === phase) return t;
    await fn(`/api/tasks/${t.task_id}/flag`, { method: "POST", body: JSON.stringify({ reason: "seeking phase" }) });
  }
  return null;
};
const reviewerRows = () => qj(`task_completions?clinician_id=eq.${ids[R]}&pool_id=eq.${pool.id}&select=id,ls_task_id,annotation_data`);
console.log(`  reviewer under test: ${R}`);

hr("1. AN ITEM IS AUTHORED, THEN SENT BACK");
const t1 = await nextFor(cA, "author");
await cA(`/api/tasks/${t1.task_id}/submit`, { method: "POST", body: JSON.stringify({ answers: { draft_answer: "Terse first draft." } }) });
console.log(`  A authors task ${t1.task_id}`);
console.log(`  reviewer completions before their pass: ${(await reviewerRows()).length}`);

const toReview = await nextFor(cR, "review");
console.log(`  reviewer served task ${toReview.task_id} (phase=${toReview.phase})`);
const rej = await cR(`/api/tasks/${toReview.task_id}/review`, {
  method: "POST", body: JSON.stringify({ action: "reject", reason: "Needs the next step spelled out." }),
});
console.log(`  POST review {action:"reject"} → HTTP ${rej.status}  ${JSON.stringify(await rej.json())}`);

const afterReject = await reviewerRows();
console.log(`\n  reviewer completions after SEND-BACK: ${afterReject.length}   (must be 1)`);
console.log(`  recorded against task: ${afterReject[0]?.ls_task_id}`);
console.log(`  what was recorded: ${JSON.stringify(afterReject[0]?.annotation_data)}`);
const lsNow = ((await (await LS(`/api/tasks/${t1.task_id}/`)).json()).annotations ?? []).length;
console.log(`  LS annotations on it: ${lsNow}   (paid, but nothing published)`);

hr("2. THE SAME TASK IS REWRITTEN AND THE SAME REVIEWER APPROVES IT");
const rewrite = await nextFor(cC, "author");
console.log(`  C is served task ${rewrite.task_id}  (same task: ${rewrite.task_id === t1.task_id})`);
await cC(`/api/tasks/${rewrite.task_id}/submit`, { method: "POST", body: JSON.stringify({ answers: { draft_answer: "Rewritten: advise same-day assessment and state why." } }) });

const again = await nextFor(cR, "review");
console.log(`  reviewer served task ${again?.task_id} again: ${again?.task_id === t1.task_id}`);
const app = await cR(`/api/tasks/${again.task_id}/review`, { method: "POST", body: JSON.stringify({ action: "approve" }) });
console.log(`  POST review {action:"approve"} → HTTP ${app.status}  ${JSON.stringify(await app.json()).slice(0, 80)}`);

const afterApprove = await reviewerRows();
console.log(`\n  reviewer completions after APPROVAL: ${afterApprove.length}   (must still be 1)`);
console.log(`  no second row added: ${afterApprove.length === afterReject.length}`);
console.log(`  same row id as before: ${afterApprove[0]?.id === afterReject[0]?.id}`);

hr("3. PAY IS THE SAME EITHER WAY");
const lsEnd = ((await (await LS(`/api/tasks/${t1.task_id}/`)).json()).annotations ?? []).length;
console.log(`  reviewer did 2 passes on task ${t1.task_id}: one send-back, one approval`);
console.log(`  reviewer completions:  ${afterApprove.length}`);
console.log(`  LS annotations:        ${lsEnd}   (published only on approval)`);
console.log(`\n  rejecting paid the same as approving: ${afterReject.length === 1}`);
console.log(`  approving the rewrite added nothing:  ${afterApprove.length === 1}`);
console.log(`  → nothing to gain by rubber-stamping: ${afterReject.length === 1 && afterApprove.length === 1}`);

const rec = await (await fetch(`${APP}/api/tasks/reconcile?poolId=${pool.id}`, { headers: { "x-ops-key": env.OPS_API_KEY } })).json();
console.log(`\n  reconcile: mode=${rec.mode} ls=${rec.ls_annotations} expected=${rec.expected_annotations} diverged=${rec.diverged} orphans=${rec.orphans_found}`);
console.log(`  work: ${JSON.stringify(rec.work)}`);

hr("CLEANUP");
for (let p = 1; p <= 5; p++) {
  const j = await (await LS(`/api/projects/${PROJECT}/tasks/?page=${p}&page_size=200`)).json();
  const rows = Array.isArray(j) ? j : (j.tasks ?? []);
  for (const t of rows) for (const a of t.annotations ?? []) await LS(`/api/annotations/${a.id}/`, { method: "DELETE" });
  if (rows.length < 200) break;
}
await q(`review_items?pool_id=eq.${pool.id}`, { method: "DELETE" });
for (const email of [A, R, C]) {
  for (const tbl of ["task_completions", "pool_eligibility", "sessions", "task_flags"]) {
    await q(`${tbl}?clinician_id=eq.${ids[email]}`, { method: "DELETE" });
  }
  await q(`clinicians?id=eq.${ids[email]}`, { method: "DELETE" });
}
await q(`pools?id=eq.${pool.id}`, { method: "PATCH", body: JSON.stringify({ eval_config: original }) });
console.log(`  cleaned up; pool config restored`);
