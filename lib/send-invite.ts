import "server-only";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || "noreply@senebiclabs.com";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/**
 * Sends an invite link.
 *
 * Throws on failure. The caller withdraws the invite when it throws, because an
 * invite whose link never arrived is worse than none: it silently blocks a
 * retry to the same address.
 */
export async function sendInviteEmail(
  email: string,
  token: string,
  inviterName: string
): Promise<void> {
  const link = `${APP_URL}/join?token=${encodeURIComponent(token)}`;

  if (!RESEND_API_KEY) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY is not configured");
    }
    console.warn(`[invite] no RESEND_API_KEY — link for ${email}: ${link}`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: email,
      subject: "You have been invited to Senebiclabs",
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#10312E">
          <p style="font-size:17px;font-weight:600;margin:0 0 24px">Senebiclabs</p>
          <h1 style="font-size:22px;font-weight:600;margin:0 0 12px">You have been invited</h1>
          <p style="font-size:15px;line-height:1.6;color:#5B6A68;margin:0 0 24px">
            ${escapeHtml(inviterName)} invited you to join Senebiclabs as a reviewing clinician.
            Senebiclabs is invite-only, and this link is for ${escapeHtml(email)}.
          </p>
          <a href="${link}" style="display:inline-block;background:#0E7C74;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:6px">Accept your invitation</a>
          <p style="font-size:13px;line-height:1.6;color:#8A9C99;margin:28px 0 0">
            This invitation expires in 7 days and can be used once.
            If you were not expecting it, you can ignore this email.
          </p>
        </div>`,
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend rejected the invite: ${res.status} ${await res.text()}`);
  }
}

/** Shared by every email that interpolates text somebody else typed. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}
