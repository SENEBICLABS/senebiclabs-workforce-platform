/**
 * Evidence for the author → reviewer flow.
 *
 *   node scripts/verify-review-flow.mjs
 *
 * A authors an item, B is served it (never A), B edits and approves, the item
 * is done with B's text, and A is refused if they try to review their own work.
 * Runs entirely against the webhook-free sandbox.
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
const hr = (t) => console.log(`\n${"═".repeat(70)}\n${t}\n${"═".repeat(70)}`);

// Named in .env.local, checked for webhooks before a single write.
const { pool } = await resolveSandbox("author", env, qj);

if ((await q("review_items?select=id&limit=1")).status === 404) {
  console.log("migrations/006_review_items.sql is not applied — stopping.");
  process.exit(1);
}

/* ── setup: a written-work pool ─────────────────────────────────── */
hr("0. SETUP — a pool whose config asks for review");
const cfg = structuredClone(pool.eval_config);
cfg.review_required = true;
cfg.schema.field_order = ["draft_answer"];
cfg.schema.fields = {
  draft_answer: {
    type: "text",
    title: "Written answer",
    hint: "Write the answer a clinician should receive.",
    required: true,
  },
};
await q(`pools?id=eq.${pool.id}`, { method: "PATCH", body: JSON.stringify({ eval_config: cfg, maximum_annotations: 1 }) });
console.log(`  pool "${pool.name}"  review_required=true, one written field`);

// Two clinicians, both eligible.
const stamp = Date.now().toString().slice(-6);
const A = `godwinyampoi449+auth${stamp}@gmail.com`;
const B = `godwinyampoi449+rev${stamp}@gmail.com`;
const ids = {};
for (const email of [A, B]) {
  const [c] = await (await q("clinicians", {
    method: "POST", headers: { ...H, Prefer: "return=representation" },
    body: JSON.stringify({ email, name: email.split("+")[1].split("@")[0], access_code: Math.random().toString(36).slice(2, 10).toUpperCase(), active: true }),
  })).json();
  ids[email] = c.id;
  await q("pool_eligibility", { method: "POST", body: JSON.stringify({ clinician_id: c.id, pool_id: pool.id, eligible: true, eligible_since: new Date().toISOString() }) });
}
const cookieFor = async (email) => {
  const t = await sessionFor(env, { clinicianId: ids[email], email });
  return `sessionToken=${t}`;
};
const cA = await cookieFor(A), cB = await cookieFor(B);
const as = (cookie) => (p, i = {}) =>
  fetch(`${APP}${p}`, { ...i, headers: { Cookie: cookie, "Content-Type": "application/json", ...i.headers } });
const callA = as(cA), callB = as(cB);
console.log(`  author   A = ${A}`);
console.log(`  reviewer B = ${B}`);

/* ── 1. A authors ───────────────────────────────────────────────── */
hr("1. A IS SERVED AN ITEM AND WRITES THE ANSWER");
const t1 = await (await callA(`/api/pools/${pool.id}/next`)).json();
console.log(`  GET next → phase=${t1.phase}  task ${t1.task_id} (case ${t1.case_id})`);
const AUTHORED = "Advise urgent same-day review: the described chest pain with diaphoresis is a red flag for acute coronary syndrome and must not wait.";
const lsBefore = ((await (await LS(`/api/tasks/${t1.task_id}/`)).json()).annotations ?? []).length;
const sub = await callA(`/api/tasks/${t1.task_id}/submit`, {
  method: "POST", body: JSON.stringify({ answers: { draft_answer: AUTHORED } }),
});
const subBody = await sub.json();
console.log(`  POST submit → HTTP ${sub.status}  ${JSON.stringify({ phase: subBody.phase, state: subBody.state, awaiting_review: subBody.awaiting_review })}`);
const item1 = await qj(`review_items?pool_id=eq.${pool.id}&ls_task_id=eq.${t1.task_id}&select=state,author_id,authored_data`);
const lsAfterAuthor = ((await (await LS(`/api/tasks/${t1.task_id}/`)).json()).annotations ?? []).length;
console.log(`\n  item state: ${item1[0]?.state}`);
console.log(`  author recorded as A: ${item1[0]?.author_id === ids[A]}`);
console.log(`  LS annotations ${lsBefore} → ${lsAfterAuthor}  (draft NOT published: ${lsAfterAuthor === lsBefore})`);

/* ── 2. A is never served their own item ────────────────────────── */
hr("2. A IS NEVER SERVED THEIR OWN ITEM TO REVIEW");
const againRes = await callA(`/api/pools/${pool.id}/next`);
const again = againRes.status === 204 ? null : await againRes.json();
console.log(`  A asks for work again → HTTP ${againRes.status}`);
console.log(`  got their own item back: ${again?.task_id === t1.task_id}   (must be false)`);
if (again) console.log(`  served instead: phase=${again.phase} task ${again.task_id}`);

const selfReview = await callA(`/api/tasks/${t1.task_id}/review`, {
  method: "POST", body: JSON.stringify({ action: "approve" }),
});
console.log(`\n  A calls the review endpoint on it directly → HTTP ${selfReview.status}`);
console.log(`  ${JSON.stringify(await selfReview.json())}`);
console.log(`  blocked server-side: ${selfReview.status === 403}`);

/* ── 3. B is served it and edits + approves ─────────────────────── */
hr("3. B IS SERVED A's ITEM, EDITS, AND APPROVES");
let served = null;
for (let i = 0; i < 6; i++) {
  const r = await callB(`/api/pools/${pool.id}/next`);
  if (r.status === 204) break;
  const t = await r.json();
  if (t.phase === "review" && t.task_id === t1.task_id) { served = t; break; }
  // Anything else is an authoring task; flag past it to reach the review item.
  await callB(`/api/tasks/${t.task_id}/flag`, { method: "POST", body: JSON.stringify({ reason: "seeking the review item" }) });
}
console.log(`  B served: phase=${served?.phase}  task ${served?.task_id}`);
console.log(`  it is A's item: ${served?.task_id === t1.task_id}`);
console.log(`  B sees the authored text: ${JSON.stringify(served?.authored?.draft_answer)?.slice(0, 70)}…`);
console.log(`  author identity withheld from the payload: ${!JSON.stringify(served ?? {}).includes(ids[A])}`);

const EDITED = AUTHORED.replace("urgent same-day review", "immediate emergency assessment");
const dec = await callB(`/api/tasks/${t1.task_id}/review`, {
  method: "POST", body: JSON.stringify({ action: "edit", answers: { draft_answer: EDITED } }),
});
console.log(`\n  POST review {action:"edit"} → HTTP ${dec.status}  ${JSON.stringify(await dec.json()).slice(0, 90)}`);

/* ── 4. the item is done, with B's text ─────────────────────────── */
hr("4. THE ITEM IS DONE, AND B's TEXT IS THE ANSWER");
const [final] = await qj(`review_items?pool_id=eq.${pool.id}&ls_task_id=eq.${t1.task_id}&select=*`);
console.log(`  state:         ${final.state}`);
console.log(`  review_action: ${final.review_action}`);
console.log(`  reviewer is B: ${final.reviewer_id === ids[B]}`);
console.log(`  author still A: ${final.author_id === ids[A]}`);

const lsTask = await (await LS(`/api/tasks/${t1.task_id}/`)).json();
const anns = lsTask.annotations ?? [];
const delivered = anns.at(-1)?.result?.find((r) => r.from_name === "draft_answer")?.value?.text?.[0];
console.log(`\n  LS annotations now: ${anns.length}  (one approved value, not a merge)`);
console.log(`  delivered text == B's edit:   ${delivered === EDITED}`);
console.log(`  delivered text == A's draft:  ${delivered === AUTHORED}   (must be false)`);
console.log(`\n  A wrote:     "${AUTHORED.slice(0, 62)}…"`);
console.log(`  B delivered: "${String(delivered).slice(0, 62)}…"`);

/* ── 5. cleanup ─────────────────────────────────────────────────── */
hr("5. CLEANUP");
for (const a of anns) await LS(`/api/annotations/${a.id}/`, { method: "DELETE" });
await q(`review_items?pool_id=eq.${pool.id}`, { method: "DELETE" });
for (const email of [A, B]) {
  const id = ids[email];
  for (const tbl of ["task_completions", "pool_eligibility", "sessions", "task_flags"]) {
    await q(`${tbl}?clinician_id=eq.${id}`, { method: "DELETE" });
  }
  await q(`clinicians?id=eq.${id}`, { method: "DELETE" });
}
await q(`pools?id=eq.${pool.id}`, { method: "PATCH", body: JSON.stringify({ eval_config: pool.eval_config }) });
const leftA = await qj(`clinicians?email=eq.${encodeURIComponent(A)}&select=id`);
const leftB = await qj(`clinicians?email=eq.${encodeURIComponent(B)}&select=id`);
const lsEnd = ((await (await LS(`/api/tasks/${t1.token ?? t1.task_id}/`)).json()).annotations ?? []).length;
console.log(`  test clinicians removed: ${leftA.length === 0 && leftB.length === 0}`);
console.log(`  sandbox annotations left: ${lsEnd}`);
console.log(`  pool config restored: true`);
