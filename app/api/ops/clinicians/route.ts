import { NextRequest, NextResponse } from "next/server";
import { withOps } from "@/lib/ops-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { READING_KINDS } from "@/lib/completions";
import { flagRate } from "@/lib/flag-rate";

export const dynamic = "force-dynamic";

/**
 * Everyone on the panel, with what each of them can do and has done.
 *
 * The flag rate is here because nothing else can tell an operator whether
 * flagging is being used honestly. A flag is the escape hatch for a case a
 * clinician cannot judge, and it is meant to be used: a panel with no flags at
 * all is a panel guessing at cases it should have declined. But it is also the
 * cheapest pass to make, and without this number nobody could see a clinician
 * flagging everything.
 *
 * Over what: flags divided by flags plus readings, which is every case the
 * clinician was served and acted on. Adjudications are left out of both halves
 * because they are a second pass over a case already read, and counting them
 * would quietly shrink the rate of whoever settles the most disagreements.
 *
 * It is null rather than 0 for someone who has done nothing yet. A new
 * clinician has not flagged nothing; they have not been asked anything, and 0%
 * beside their name would read as a record they have not earned.
 */
export async function GET(req: NextRequest) {
  return withOps(req, async () => {
    const search = (new URL(req.url).searchParams.get("q") ?? "").trim().toLowerCase();

    const [{ data: people }, { data: completions }, { data: eligibility }] =
      await Promise.all([
        supabaseAdmin
          .from("clinicians")
          .select("id, email, name, active, can_invite, invited_by, created_at")
          .order("created_at", { ascending: true }),
        supabaseAdmin
          .from("task_completions")
          .select("clinician_id, kind")
          .in("kind", [...READING_KINDS, "flag"]),
        supabaseAdmin.from("pool_eligibility").select("clinician_id, eligible"),
      ]);

    const reviews = new Map<string, number>();
    const flags = new Map<string, number>();
    for (const row of completions ?? []) {
      const tally = row.kind === "flag" ? flags : reviews;
      tally.set(row.clinician_id, (tally.get(row.clinician_id) ?? 0) + 1);
    }
    const pools = new Map<string, number>();
    for (const row of eligibility ?? []) {
      if (row.eligible === false) continue;
      pools.set(row.clinician_id, (pools.get(row.clinician_id) ?? 0) + 1);
    }
    const byId = new Map((people ?? []).map((c) => [c.id, c]));

    const rows = (people ?? [])
      .filter((c) =>
        !search ||
        c.email.toLowerCase().includes(search) ||
        String(c.name ?? "").toLowerCase().includes(search)
      )
      .map((c) => ({
        id: c.id,
        email: c.email,
        name: c.name,
        active: c.active !== false,
        can_invite: c.can_invite === true,
        joined: c.created_at,
        // The address that vouched for them, not an id an operator must resolve.
        invited_by: c.invited_by ? (byId.get(c.invited_by)?.email ?? "removed account") : null,
        reviews: reviews.get(c.id) ?? 0,
        flags: flags.get(c.id) ?? 0,
        flag_rate: flagRate(reviews.get(c.id) ?? 0, flags.get(c.id) ?? 0),
        pools: pools.get(c.id) ?? 0,
      }));

    return NextResponse.json({ clinicians: rows });
  });
}
