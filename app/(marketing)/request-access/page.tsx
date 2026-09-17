import type { Metadata } from "next";
import { RequestAccessForm } from "@/components/landing/RequestAccess";

export const metadata: Metadata = {
  title: "Request access | Senebiclabs",
  description:
    "Senebiclabs is invite-only for now. Tell us your name, specialty and the country you practise in, and we will email you when we open to clinicians.",
};

/**
 * Request access, as a page of its own.
 *
 * A list, not a queue. Requests are kept until Senebiclabs opens to clinicians,
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
        <p className="text-label uppercase text-muted">Request access</p>
        <h1 className="mx-auto mt-5 max-w-[880px] text-[42px] leading-[1.04] text-ink sm:text-[60px]">
          Tell us who you are
        </h1>
        <p className="mx-auto mt-5 max-w-[560px] text-[19px] leading-relaxed text-muted">
          Senebiclabs is invite-only for now. Tell us who you are and we will
          add you to the list. When we open to clinicians, we will email you.
        </p>

        <div className="mx-auto mt-14 w-full max-w-[440px]">
          {/* Read here, on the server, and handed to the form. The page is
              prerendered, so this is read at build time: a changed key takes
              effect on the next deploy. */}
          <RequestAccessForm siteKey={process.env.NEXT_TURNSTILE_SITE_KEY} />
        </div>
      </div>
    </section>
  );
}
