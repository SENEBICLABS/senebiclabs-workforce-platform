import type { Metadata } from "next";
import Link from "next/link";
import { Faqs } from "@/components/landing/Faqs";
import { ApplyActions } from "@/components/landing/ApplyDialog";

export const metadata: Metadata = {
  title: "FAQs | Senebiclabs",
  description:
    "Questions clinicians ask about joining Senebiclabs: how vetting works, how pay works, how much time it takes, and what a review involves.",
};

export default function FaqsPage() {
  return (
    <>
      <section>
        <div className="mx-auto max-w-[1100px] px-5 py-20 text-center lg:px-8">
          <p className="text-label uppercase text-muted">FAQs</p>
          <h1
            className="mx-auto mt-4 max-w-[640px] text-[34px] leading-[1.15] text-ink sm:text-[44px]"
          >
            Questions clinicians ask
          </h1>
          <p className="mx-auto mt-5 max-w-[520px] text-[17px] leading-relaxed text-muted">
            If something here is not covered, write to us and we will answer it
            properly rather than point you at a form.
          </p>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-[680px] px-5 py-16 text-center lg:px-8">
          <Faqs />
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-[1100px] px-5 py-20 text-center lg:px-8">
          <h2
            className="mx-auto max-w-[560px] text-[30px] leading-tight text-ink"
          >
            Put your clinical knowledge to paid work
          </h2>
          <p className="mx-auto mt-3 max-w-[460px] text-body text-muted">
            Apply with your specialty and licence. We review every application.
          </p>
          <div className="mt-8">
            <ApplyActions />
          </div>
          <p className="mt-6 text-body text-muted">
            <Link
              href="/about-us"
              className="focusable rounded-btn font-semibold text-accent underline-offset-2 hover:underline"
            >
              Read more about what we do
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
