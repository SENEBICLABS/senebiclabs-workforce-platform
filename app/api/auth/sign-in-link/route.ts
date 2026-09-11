import { NextRequest, NextResponse } from "next/server";
import { createSignInLink, SIGN_IN_LINK_EXPIRY_MINUTES } from "@/lib/auth";
import { findClinicianByEmail } from "@/lib/clinicians";
import { findPendingInviteForEmail, normalizeEmail } from "@/lib/invites";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || "noreply@senebiclabs.com";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/** Deliberately loose. The real check is whether the address is known to us. */
const LOOKS_LIKE_EMAIL = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;

/**
 * The same answer whatever happened.
 *
 * Never says whether the address is a member. Membership here is a fact about
 * a named clinician, and an endpoint that distinguishes "sent" from "no such
 * account" hands anyone a way to test whether a particular doctor works with
 * us. That matters more than usual for an invite-only platform.
 */
const ACCEPTED = {
  success: true,
  message: "If that address can sign in, a link is on its way.",
  // Reported rather than repeated in the page copy, which had drifted to
  // "24 hours" and stayed there when the token dropped to fifteen minutes.
  expiresInMinutes: SIGN_IN_LINK_EXPIRY_MINUTES,
};

async function sendSignInLinkEmail(email: string, path: string) {
  if (!RESEND_API_KEY) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY is not configured");
    }
    console.warn("RESEND_API_KEY not set — skipping email (development only)");
    console.log(`✉️  Sign-in link for ${email}: ${APP_URL}${path}`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: email,
      subject: "Your Senebiclabs sign-in link",
      html: `
        <h2>Sign in to Senebiclabs</h2>
        <p>Use the link below to sign in. It works once and expires in
           ${SIGN_IN_LINK_EXPIRY_MINUTES} minutes.</p>
        <p><a href="${APP_URL}${path}" style="display:inline-block;padding:12px 24px;background:#0d0d0d;color:#22F0D5;text-decoration:none;border-radius:6px;font-weight:bold;">Sign in</a></p>
        <p style="margin-top:24px;color:#666;font-size:12px;">
          If you did not ask for this, you can ignore it. Nobody can sign in
          without opening the link from this mailbox.
        </p>
      `,
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend rejected the send: ${res.status} ${await res.text()}`);
  }
}

/** A link is only ever sent to someone who could actually get through the gate. */
async function mayReceiveLink(email: string): Promise<boolean> {
  // Through the shared lookup, which is exact. This is the authorisation
  // check and the link is then mailed to the address that was typed, so under
  // the .ilike this used to use, those could be two different people: a typed
  // address containing "_" or "%" was a pattern that authorised against a
  // member's row while delivery went to the attacker's mailbox. One request,
  // so rate limiting never came into it.
  //
  // Note this address is unverified form input, unlike the gate's, which
  // something has already vouched for. Nothing here proves identity; it only
  // decides whether a link is worth sending.
  if (await findClinicianByEmail(email)) return true;

  return Boolean(await findPendingInviteForEmail(email));
}

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = (await req.json())?.email;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  if (typeof raw !== "string" || !LOOKS_LIKE_EMAIL.test(raw.trim())) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const email = normalizeEmail(raw);

  // Two keys. The address is the one that matters, because it is the thing
  // being mailed; the IP catches someone walking a list of addresses.
  for (const [key, limit] of [
    [`signin:addr:${email}`, { max: 3, windowSeconds: 900 }],
    [`signin:ip:${clientIp(req)}`, { max: 10, windowSeconds: 900 }],
  ] as const) {
    const { ok, retryAfter } = rateLimit(key, limit);
    if (!ok) {
      return NextResponse.json(
        { error: "Too many sign-in requests. Try again shortly." },
        { status: 429, headers: { "retry-after": String(retryAfter) } }
      );
    }
  }

  try {
    // The endpoint used to mail a link to any address given to it, which made
    // it a free relay for sending Senebiclabs-branded mail to strangers. Now
    // nothing is sent unless the address could sign in, and the caller is told
    // the same thing either way.
    if (!(await mayReceiveLink(email))) {
      console.warn(`[sign-in-link] refused, address is not known: ${email}`);
      return NextResponse.json(ACCEPTED);
    }

    const path = `/auth/verify?token=${await createSignInLink(email)}`;

    try {
      await sendSignInLinkEmail(email, path);
    } catch (err) {
      // A silent failure here shows someone "check your email" for a message
      // that was never sent, and locks them out with no error anywhere.
      console.error("[sign-in-link] send failed", err);
      return NextResponse.json(
        { error: "We could not send your sign-in link. Please try again in a moment." },
        { status: 502 }
      );
    }

    return NextResponse.json(ACCEPTED);
  } catch (err) {
    console.error("[sign-in-link] failed", err);
    return NextResponse.json(
      { error: "We could not send your sign-in link. Please try again in a moment." },
      { status: 500 }
    );
  }
}
