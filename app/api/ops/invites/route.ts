import { NextRequest, NextResponse } from "next/server";
import { withOps } from "@/lib/ops-auth";
import { supabaseAdmin } from "@/lib/supabase";
import {
  createAndSendInvite,
  INVITE_DAILY_CAP,
  invitesCreatedPerInviter,
} from "@/lib/invites";

export const dynamic = "force-dynamic";

/** Invites still awaiting acceptance, newest first. */
export async function GET(req: NextRequest) {
  return withOps(req, async () => {
    const [{ data: invites }, { data: people }, senders] = await Promise.all([
      supabaseAdmin
        .from("invites")
        .select("id, invited_email, invited_by, status, created_at, expires_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      supabaseAdmin.from("clinicians").select("id, email"),
      // Who has been sending, from the same rows the cap counts, so the two
      // cannot disagree about what happened. This is the durable view: it
      // survives a restart, where the in-memory burst limiter only ever knows
      // one instance's version of events.
      invitesCreatedPerInviter(),
    ]);

    const byId = new Map((people ?? []).map((c) => [c.id, c.email]));
    const now = Date.now();

    return NextResponse.json({
      // Beside the list rather than behind a separate call: a member at or near
      // the cap is either confused or compromised, and both are things an
      // operator should see without going looking for them.
      sent_last_24h: senders.map((s) => ({
        inviter: s.inviterId
          ? (byId.get(s.inviterId) ?? "removed account")
          : "Senebiclabs",
        count: s.count,
        at_cap: s.count >= INVITE_DAILY_CAP,
      })),
      daily_cap: INVITE_DAILY_CAP,
      invites: (invites ?? []).map((i) => ({
        id: i.id,
        email: i.invited_email,
        // Null means it came from the operator console, not a colleague.
        invited_by: i.invited_by ? (byId.get(i.invited_by) ?? "removed account") : "Senebiclabs",
        sent: i.created_at,
        expires: i.expires_at,
        expired: i.expires_at ? new Date(i.expires_at).getTime() < now : false,
      })),
    });
  });
}

/** Sends an invite. Same object, expiry and email as a colleague's invite. */
export async function POST(req: NextRequest) {
  return withOps(req, async () => {
    let email: string;
    try {
      email = String((await req.json())?.email ?? "");
    } catch {
      return NextResponse.json({ error: "Malformed request." }, { status: 400 });
    }

    const created = await createAndSendInvite(email, null, "Senebiclabs");
    if (!created.ok) {
      return NextResponse.json({ error: created.error }, { status: created.status });
    }

    return NextResponse.json({
      invited_email: created.invite.invited_email,
      expires_at: created.invite.expires_at,
      sent: true,
    });
  });
}
