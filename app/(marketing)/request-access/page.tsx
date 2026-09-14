import type { Metadata } from "next";
import { RequestAccessForm } from "@/components/landing/RequestAccess";

export const metadata: Metadata = {
  title: "Request access | Senebiclabs",
  description:
    "Senebiclabs is invite-only. Tell us your name, specialty and the country you practise in, and we will be in touch when there is work that fits.",
};

/**
 * Request access, as a page of its own.
 *
 * Its own URL, so it can be linked to directly and opened from the nav without
 * a dialog over whatever page the reader was on. The page is a server component
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
        <p className="mx-auto mt-5 max-w-[560px] text-[17px] leading-relaxed text-muted">
          Senebiclabs is invite-only. Tell us who you are, and we will reach out
          with an invitation when there is work that fits your specialty.
        </p>

        <div className="mx-auto mt-14 w-full max-w-[440px]">
          <RequestAccessForm />
        </div>
      </div>
    </section>
  );
}
