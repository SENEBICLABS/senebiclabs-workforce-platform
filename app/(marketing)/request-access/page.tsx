import type { Metadata } from "next";
import { RequestAccessForm } from "@/components/landing/RequestAccess";

export const metadata: Metadata = {
  title: "Request access | Senebiclabs",
  description:
    "Membership of Senebiclabs is by invitation. Tell us your name, specialty and the country you practise in, and our team will review your request.",
};

/**
 * Request access, as a page of its own.
 *
 * A list, not an application form. Requests are kept and reviewed by our team,
 * and that is the one thing the page promises: an email when it does. It does
 * not promise review or an invitation, because neither happens to a request.
 *
 * Its own URL, so it can be linked to directly. The page is a server component
 * for the metadata and the heading; only the form itself runs on the client.
 */
export default function RequestAccessPage() {
  return (
    <section>
      <div className="mx-auto w-full max-w-[1040px] px-5 pb-24 pt-32 text-center sm:pb-32 sm:pt-40 lg:px-8">
        <p className="font-display text-[12px] font-extrabold uppercase tracking-[0.3em] text-accent-ink">Request access</p>
        <h1 className="mx-auto mt-5 max-w-[880px] text-[38px] font-extrabold leading-[1.08] text-ink sm:text-[54px]">
          Tell us who you are
        </h1>
        <p className="mx-auto mt-5 max-w-[560px] text-[19px] leading-relaxed text-muted">
          Membership is by invitation. Tell us who you are and our team will review
          your request. If we have work that fits your practice, we will email you an
          invitation.
        </p>

        <div className="mx-auto mt-14 w-full max-w-[480px]">
          {/* Read here, on the server, and handed to the form. The page is
              prerendered, so this is read at build time: a changed key takes
              effect on the next deploy. */}
          <RequestAccessForm siteKey={process.env.NEXT_TURNSTILE_SITE_KEY} />

          <div className="mt-8 rounded-card border border-hairline bg-canvas-top p-6 text-left">
            <h2 className="text-[16px] font-bold text-ink">Why we ask for these</h2>
            <ul className="mt-3 space-y-2 text-[15px] leading-relaxed text-muted">
              <li>
                <span className="font-semibold text-strong">Specialty and country</span>{" "}
                tell us which of our projects your practice fits.
              </li>
              <li>
                <span className="font-semibold text-strong">Email</span> is where we
                reply, and where any invitation is sent.
              </li>
              <li>
                <span className="font-semibold text-strong">LinkedIn</span> is
                optional, and helps us know who you are.
              </li>
            </ul>
            <p className="mt-3 text-[14px] text-subtle">
              Requesting access does not create an account or guarantee an invitation.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
