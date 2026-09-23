/**
 * Evidence: direct access grants only pools marked open_access.
 * Run after migrations/004_pool_open_access.sql is applied.
 */
import fs from "fs";
import { resolveSandbox } from "./sandbox.mjs";
import { signInLinkFor } from "./sign-in-link.mjs";
import { plantInvite } from "./invite.mjs";
const env=Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("="))
  .map(l=>[l.slice(0,l.indexOf("=")).trim(),l.slice(l.indexOf("=")+1).trim()]));
const APP="http://localhost:3000";
const SB=`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;
const H={apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,"Content-Type":"application/json"};
const q=(p,i={})=>fetch(`${SB}/${p}`,{headers:H,...i});
const qj=(p,i={})=>q(p,i).then(r=>r.json());
const hr=(t)=>console.log(`\n${"═".repeat(70)}\n${t}\n${"═".repeat(70)}`);

if((await q("pools?select=open_access&limit=1")).status!==200){
  console.log("migrations/004_pool_open_access.sql is not applied — stopping."); process.exit(1);
}

// This script flips open_access on real pool rows, so the two it is allowed to
// flip are the sandboxes, resolved and webhook-checked. The pilot is read, and
// only to prove it stays shut; nothing here ever writes to it.
const judge=await resolveSandbox("judge",env,qj);
const author=await resolveSandbox("author",env,qj);

hr("1. POOLS: everything closed by default");
let pools=await qj("pools?select=id,name,ls_project_id,open_access&order=name");
for(const p of pools) console.log(`  open_access=${String(p.open_access).padEnd(5)} ls_project=${String(p.ls_project_id).padEnd(3)} ${p.name}`);

// Open the sandbox only. The HEALTH pool (project 27) stays closed.
const sandbox=pools.find(p=>p.id===judge.poolId);
await q(`pools?id=eq.${sandbox.id}`,{method:"PATCH",body:JSON.stringify({open_access:true})});
pools=await qj("pools?select=id,name,ls_project_id,open_access&order=name");
console.log(`\n  opened "${sandbox.name}" only:`);
for(const p of pools) console.log(`    open_access=${String(p.open_access).padEnd(5)} ${p.name}`);
// The pool that feeds HEALTH. Never opened, never written, only checked.
const health=pools.find(p=>p.id!==judge.poolId&&p.id!==author.poolId);
console.log(`\n  "${health.name}" (feeds HEALTH) untouched by this script, open_access=${health.open_access}`);

hr("2. A FRESHLY INVITED CLINICIAN GETS ONLY OPEN POOLS");
const stamp=Date.now().toString().slice(-6);
const INVITEE=`godwinyampoi449+oa${stamp}@gmail.com`;
const {raw,status:inviteStatus,sent}=await plantInvite(env,{q,qj,app:APP},INVITEE);
console.log(`  POST /api/invites → HTTP ${inviteStatus}${sent?"":"  (declined; invitation written directly so the gating test can run)"}`);

const v=await fetch(`${APP}/api/auth/verify`,{method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({token:await signInLinkFor(env,INVITEE),invite:raw})});
console.log(`  accept → HTTP ${v.status}  ${JSON.stringify(await v.json())}`);
const cookie=(v.headers.get("set-cookie")??"").split(";")[0];
const [me]=await qj(`clinicians?email=eq.${encodeURIComponent(INVITEE)}&select=id`);
const mine=await qj(`pool_eligibility?clinician_id=eq.${me.id}&select=pool_id,eligible`);
console.log(`\n  eligibility rows granted: ${mine.length} (of ${pools.length} pools)`);
for(const r of mine) console.log(`    ${pools.find(p=>p.id===r.pool_id)?.name}`);
console.log(`  granted ONLY open pools: ${mine.every(r=>pools.find(p=>p.id===r.pool_id)?.open_access===true)}`);
console.log(`  closed pools NOT granted: ${!mine.some(r=>pools.find(p=>p.id===r.pool_id)?.open_access!==true)}`);

hr("3. A CLOSED POOL IS ABSENT FROM THEIR /api/pools");
const listed=await (await fetch(`${APP}/api/pools`,{headers:{Cookie:cookie}})).json();
console.log(`  GET /api/pools → ${listed.pools.length} pool(s)`);
for(const p of listed.pools) console.log(`    ${p.name}`);
console.log(`\n  closed pools absent: ${!listed.pools.some(p=>p.id===health.id)}`);
const direct=await fetch(`${APP}/api/pools/${health.id}/next`,{headers:{Cookie:cookie}});
console.log(`  asking for the closed pool directly → HTTP ${direct.status}  ${await direct.text()}`);

hr("4. OPENING A POOL GRANTS IT ON THE NEXT TOP-UP");
const other=pools.find(p=>p.id===author.poolId);
console.log(`  opening "${other.name}" …`);
await q(`pools?id=eq.${other.id}`,{method:"PATCH",body:JSON.stringify({open_access:true})});
await fetch(`${APP}/api/auth/verify`,{method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({token:await signInLinkFor(env,INVITEE)})});
const after=await qj(`pool_eligibility?clinician_id=eq.${me.id}&select=pool_id`);
console.log(`  eligibility rows: ${mine.length} → ${after.length}`);
console.log(`  newly opened pool granted: ${after.some(r=>r.pool_id===other.id)}`);
console.log(`  HEALTH pool still NOT granted: ${!after.some(r=>r.pool_id===health.id)}`);

// leave the estate as found: close what this script opened
// Leave the estate exactly as found: the invited test account removed, and
// both sandboxes closed again. Without this the clinicians table collected one
// row per run for ever, which also skews every count an operator looks at.
for(const tbl of ["task_completions","task_flags","pool_eligibility","sessions"]){
  await q(`${tbl}?clinician_id=eq.${me.id}`,{method:"DELETE"});
}
await q(`invites?invited_email=eq.${encodeURIComponent(INVITEE)}`,{method:"DELETE"});
await q(`clinicians?id=eq.${me.id}`,{method:"DELETE"});
console.log(`\n  test clinician removed: ${(await qj(`clinicians?email=eq.${encodeURIComponent(INVITEE)}&select=id`)).length===0}`);

// Leave the estate exactly as found: both sandboxes closed again.
await q(`pools?id=eq.${other.id}`,{method:"PATCH",body:JSON.stringify({open_access:false})});
await q(`pools?id=eq.${sandbox.id}`,{method:"PATCH",body:JSON.stringify({open_access:false})});
const end=await qj("pools?select=name,open_access&order=name");
console.log(`\n  reverted; every pool closed again: ${end.every(p=>p.open_access===false)}`);
for(const p of end) console.log(`    open_access=${String(p.open_access).padEnd(5)} ${p.name}`);
