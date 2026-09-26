import { NextRequest, NextResponse } from "next/server";
import { withOps } from "@/lib/ops-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** Who may see this pool: every clinician, with their current state on it. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withOps(req, async () => {
    const { id } = await params;

    const [{ data: pool }, { data: people }, { data: rows }] = await Promise.all([
      supabaseAdmin.from("pools").select("id, name, open_access").eq("id", id).maybeSingle(),
      supabaseAdmin.from("clinicians").select("id, email, name").order("created_at"),
      supabaseAdmin.from("pool_eligibility").select("clinician_id, eligible, senior").eq("pool_id", id),
    ]);

    if (!pool) return NextResponse.json({ error: "No such pool." }, { status: 404 });

    const held = new Map((rows ?? []).map((r) => [r.clinician_id, r.eligible !== false]));
    const senior = new Map((rows ?? []).map((r) => [r.clinician_id, r.senior === true]));

    return NextResponse.json({
      pool,
      clinicians: (people ?? []).map((c) => ({
        id: c.id,
        email: c.email,
        name: c.name,
        eligible: held.get(c.id) === true,
        senior: senior.get(c.id) === true,
      })),
    });
  });
}

/**
 * Sets who may see this pool, and who settles disagreements in it.
 *
 * Takes the full intended lists and makes the table match them, so the operator
 * states the end result rather than issuing a sequence of grants and revokes
 * that could half-apply.
 *
 * Seniority is per pool by construction: it lives on the row joining this
 * clinician to this pool, so granting it here says nothing about any other
 * pool. Naming someone senior who is not also on the access list is refused
 * rather than quietly ignored — it is a mistake worth seeing, and the state it
 * would leave behind (senior for a pool they cannot open) reads as working
 * until a disagreement arrives and nothing is offered to anyone.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withOps(req, async () => {
    const { id } = await params;

    let wanted: string[];
    // Absent and empty mean different things here, which is the one place this
    // endpoint departs from stating the end result. A caller that does not
    // mention seniority — anything written before it existed — must not
    // silently strip it from a pool, so absent leaves it alone. An explicit
    // empty list still clears it, so a pool can be emptied of seniors on
    // purpose. The console always sends the list.
    let seniors: string[] | null;
    try {
      const body = await req.json();
      wanted = Array.isArray(body?.clinician_ids) ? body.clinician_ids.map(String) : [];
      seniors = Array.isArray(body?.senior_ids) ? body.senior_ids.map(String) : null;
    } catch {
      return NextResponse.json({ error: "Malformed request." }, { status: 400 });
    }

    const stray = (seniors ?? []).filter((s) => !wanted.includes(s));
    if (stray.length > 0) {
      return NextResponse.json(
        {
          error:
            "A senior must also have access to the pool. " +
            `${stray.length} clinician(s) were marked senior without it.`,
        },
        { status: 400 }
      );
    }

    const { data: pool } = await supabaseAdmin
      .from("pools").select("id").eq("id", id).maybeSingle();
    if (!pool) return NextResponse.json({ error: "No such pool." }, { status: 404 });

    const { data: rows } = await supabaseAdmin
      .from("pool_eligibility")
      .select("id, clinician_id, eligible, senior")
      .eq("pool_id", id);

    const existing = new Map((rows ?? []).map((r) => [r.clinician_id, r]));
    const target = new Set(wanted);

    const shouldBeSenior = seniors === null ? null : new Set(seniors);

    let granted = 0;
    let revoked = 0;

    // Grant or re-enable everyone on the list, and set seniority to match.
    for (const clinicianId of target) {
      const row = existing.get(clinicianId);
      const senior = shouldBeSenior?.has(clinicianId) ?? false;

      if (!row) {
        const { error } = await supabaseAdmin.from("pool_eligibility").insert({
          clinician_id: clinicianId,
          pool_id: id,
          eligible: true,
          senior,
          eligible_since: new Date().toISOString(),
        });
        if (!error) granted++;
      } else {
        const patch: Record<string, unknown> = {};
        if (row.eligible === false) {
          patch.eligible = true;
          granted++;
        }
        if (shouldBeSenior && (row.senior === true) !== senior) patch.senior = senior;
        if (Object.keys(patch).length > 0) {
          await supabaseAdmin.from("pool_eligibility").update(patch).eq("id", row.id);
        }
      }
    }

    // Remove the row for anyone left off it, so the pool disappears from their
    // dashboard rather than lingering as a disabled record.
    for (const [clinicianId, row] of existing) {
      if (target.has(clinicianId)) continue;
      await supabaseAdmin.from("pool_eligibility").delete().eq("id", row.id);
      revoked++;
    }

    const [{ count }, { count: seniorCount }] = await Promise.all([
      supabaseAdmin
        .from("pool_eligibility")
        .select("id", { count: "exact", head: true })
        .eq("pool_id", id)
        .eq("eligible", true),
      supabaseAdmin
        .from("pool_eligibility")
        .select("id", { count: "exact", head: true })
        .eq("pool_id", id)
        .eq("eligible", true)
        .eq("senior", true),
    ]);

    return NextResponse.json({
      granted,
      revoked,
      eligible_now: count ?? 0,
      seniors_now: seniorCount ?? 0,
    });
  });
}
