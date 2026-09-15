import type { Metadata } from "next";
import Link from "next/link";
import { Hero, MEASURE, Section, SectionHead } from "@/components/landing/Section";
import { Faqs } from "@/components/landing/Faqs";
import { RequestAccessButton } from "@/components/landing/RequestAccessButton";

export const metadata: Metadata = {
  title: "FAQs | Senebiclabs",
  description:
    "Questions clinicians ask about Senebiclabs: joining, when we open, what a review involves, how pay works and how much time it takes.",
};

/**
 * FAQs, grouped by topic: joining, the work, pay, practicalities. The answers
 * live in lib/marketing-content.ts so this page and the featured subset on the
 * landing page cannot drift apart.
 */
export default function FaqsPage() {
  return (
    <>
      <Hero>
        <p className="text-label uppercase text-muted">FAQs</p>
        <h1 className="mx-auto mt-5 max-w-[880px] text-[42px] leading-[1.04] text-ink sm:text-[60px]">
          Questions clinicians ask
        </h1>
        <p className={`${MEASURE.intro} mt-5 text-[17px] leading-relaxed text-muted`}>
          Joining, when we open, what a review involves, how pay works, and how
          much of your time it takes.
        </p>
      </Hero>

      <Section>
        <div className="text-center">
          <Faqs />
        </div>
      </Section>

      <Section>
        <SectionHead
          title="Put your clinical knowledge to paid work"
          intro="Senebiclabs is invite-only for now. Request access and we will email you when we open to clinicians."
        />
        <div className="mt-10 flex flex-col items-center gap-6">
          <RequestAccessButton />
          <Link
            href="/about-us"
            className="focusable rounded-btn text-body font-semibold text-accent underline-offset-2 hover:underline"
          >
            Read more about what we do
          </Link>
        </div>
      </Section>
    </>
  );
}
