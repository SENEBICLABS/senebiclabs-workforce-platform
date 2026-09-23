import { NextRequest, NextResponse } from "next/server";
import { withOps } from "@/lib/ops-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { READINGS_ONLY } from "@/lib/completions";

export const dynamic = "force-dynamic";

/** Everyone on the panel, with what each of them can do and has done. */
export async function GET(req: NextRequest) {
  return withOps(req, async () => {
    const search = (new URL(req.url).searchParams.get("q") ?? "").trim().toLowerCase();

    const [{ data: people }, { data: completions }, { data: eligibility }] =
      await Promise.all([
        supabaseAdmin
          .from("clinicians")
          .select("id, email, name, active, can_invite, invited_by, created_at")
          .order("created_at", { ascending: true }),
        supabaseAdmin.from("task_completions").select("clinician_id").in("kind", READINGS_ONLY),
        supabaseAdmin.from("pool_eligibility").select("clinician_id, eligible"),
      ]);

    const reviews = new Map<string, number>();
    for (const row of completions ?? []) {
      reviews.set(row.clinician_id, (reviews.get(row.clinician_id) ?? 0) + 1);
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
        pools: pools.get(c.id) ?? 0,
      }));

    return NextResponse.json({ clinicians: rows });
  });
}
