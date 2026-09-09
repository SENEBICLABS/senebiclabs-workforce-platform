import type { Metadata } from "next";
import Link from "next/link";
import { Faqs } from "@/components/landing/Faqs";
import { SignInCta } from "@/components/landing/SignInCta";

export const metadata: Metadata = {
  title: "FAQs | Senebiclabs",
  description:
    "Questions clinicians ask about joining Senebiclabs: how vetting works, how pay works, how much time it takes, and what a review involves.",
};

export default function FaqsPage() {
  return (
    <>
      <section>
        <div className="mx-auto w-full max-w-[1040px] px-5 py-24 text-center sm:py-32 lg:px-8">
          <p className="text-label uppercase text-muted">FAQs</p>
          <h1
            className="mx-auto mt-5 max-w-[880px] text-[42px] leading-[1.04] text-ink sm:text-[60px]"
          >
            Questions clinicians ask
          </h1>
          <p className="mx-auto mt-5 max-w-[560px] text-[17px] leading-relaxed text-muted">
            If something here is not covered, write to us and we will answer it
            properly rather than point you at a form.
          </p>
        </div>
      </section>

      <section>
        <div className="mx-auto w-full max-w-[1040px] px-5 py-20 text-center sm:py-28 lg:px-8">
          <Faqs />
        </div>
      </section>

      <section>
        <div className="mx-auto w-full max-w-[1040px] px-5 py-24 text-center sm:py-32 lg:px-8">
          <h2
            className="mx-auto max-w-[880px] text-[30px] leading-[1.1] text-ink sm:text-[38px]"
          >
            Put your clinical knowledge to paid work
          </h2>
          <p className="mx-auto mt-5 max-w-[560px] text-[17px] leading-relaxed text-muted">
            Membership is by invitation. If a colleague has sent you one, it is
            waiting in your inbox.
          </p>
          <div className="mt-8">
            <SignInCta />
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
