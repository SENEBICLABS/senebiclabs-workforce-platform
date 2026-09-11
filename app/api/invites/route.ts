import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { supabaseAdmin } from "@/lib/supabase";
import {
  countInvitesCreatedBy,
  createAndSendInvite,
  INVITE_CAP_WINDOW_SECONDS,
  INVITE_DAILY_CAP,
  normalizeEmail,
} from "@/lib/invites";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Issues an invite.
 *
 * Two ways to be allowed: a clinician whose `can_invite` is set, or the
 * operator key. The flag is the durable mechanism — granting it to a member
 * turns the in-app invite UI on for them with no deploy — and the operator key
 * is how the first clinicians get invited before any member holds the flag.
 */

async function resolveInviter(req: NextRequest): Promise<
  | { ok: true; inviterId: string | null; inviterName: string }
  | { ok: false; status: number; error: string }
> {
  const opsKey = process.env.OPS_API_KEY;
  const presented =
    req.headers.get("x-ops-key") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (opsKey && presented === opsKey) {
    return { ok: true, inviterId: null, inviterName: "Senebiclabs" };
  }

  // Otherwise it must be a signed-in clinician who holds the permission.
  const sessionToken =
    req.cookies.get(SESSION_COOKIE)?.value ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  const auth = sessionToken ? await verifySessionToken(sessionToken) : null;
  if (!auth) {
    return { ok: false, status: 401, error: "Sign in to invite a colleague." };
  }

  const { data } = await supabaseAdmin
    .from("clinicians")
    .select("id, name, can_invite")
    .eq("id", auth.clinicianId)
    .maybeSingle();

  if (!data?.can_invite) {
    return {
      ok: false,
      status: 403,
      error: "You do not have permission to invite colleagues.",
    };
  }

  return {
    ok: true,
    inviterId: data.id as string,
    inviterName: (data.name as string) || "A colleague",
  };
}

/**
 * What one inviter may send.
 *
 * Every invitation puts branded mail from our domain into a stranger's inbox,
 * so this is the same abuse the sign-in link endpoint already guards against:
 * a free relay, paid for in Resend reputation, which is shared across every
 * transactional email the platform sends. The difference is only that the
 * caller here is a trusted member — and can_invite exists precisely so it can
 * be granted, which is the moment a careless script or a stolen session starts
 * to matter.
 *
 * Two limits, enforced two different ways, because they want different things.
 *
 * The burst check stays in memory. Its job is to make a script conspicuous,
 * not to bound damage, so a per-instance approximation is fine and costs
 * nothing. Five in ten minutes is far above what anyone invites by hand.
 *
 * The daily cap counts rows. It is the number that bounds how much mail a
 * compromised account can send, and an in-memory limiter whose effective cap
 * is the limit times however many serverless instances are warm would not
 * bound it. One indexed count against a small table on a human-rate action is
 * imperceptible; this is not a hot path.
 */
const BURST = { max: 5, windowSeconds: 600 } as const;

export async function POST(req: NextRequest) {
  const inviter = await resolveInviter(req);
  if (!inviter.ok) {
    return NextResponse.json({ error: inviter.error }, { status: inviter.status });
  }

  // Keyed on the inviter, not the caller's address: the identity is known here,
  // unlike the anonymous endpoints, and it is the thing you would suspend. The
  // operator-key path has no inviter id and falls back to IP rather than being
  // exempt, because that key is what an attacker would use if they had it.
  const who = inviter.inviterId ?? `ops:${clientIp(req)}`;

  // A 429 rather than something quieter. Dropping it silently, or answering
  // with a fake success, would leave a member believing colleagues had been
  // invited when nothing was sent — the same failure as the "an invite is
  // already waiting" message this endpoint used to return. The copy reads as a
  // guard rail because the caller is a colleague rather than a stranger.
  const refuse = (retryAfter: number, detail: string) =>
    NextResponse.json(
      {
        error: `${detail} The limit protects our email sending reputation. Try again shortly, or ask an operator to raise it.`,
      },
      { status: 429, headers: { "retry-after": String(retryAfter) } }
    );

  const burst = rateLimit(`invite:burst:${who}`, BURST);
  if (!burst.ok) {
    console.warn(`[invites] burst limit hit by ${who}`);
    return refuse(burst.retryAfter, "That is a lot of invitations at once.");
  }

  // Counted from the rows, so restarting a server or spreading requests across
  // instances does not reset it.
  const sentToday = await countInvitesCreatedBy(inviter.inviterId);
  if (sentToday !== null && sentToday >= INVITE_DAILY_CAP) {
    console.warn(
      `[invites] daily cap hit by ${who}: ${sentToday}/${INVITE_DAILY_CAP} in the last 24h`
    );
    return refuse(
      INVITE_CAP_WINDOW_SECONDS,
      `That is ${sentToday} invitations in a day, which is the limit.`
    );
  }

  let email: string;
  try {
    const body = await req.json();
    email = normalizeEmail(String(body?.email ?? ""));
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const created = await createAndSendInvite(
    email,
    inviter.inviterId,
    inviter.inviterName
  );

  if (!created.ok) {
    return NextResponse.json({ error: created.error }, { status: created.status });
  }

  const invite = created.invite;

  return NextResponse.json({
    invited_email: invite.invited_email,
    expires_at: invite.expires_at,
    sent: true,
  });
}
