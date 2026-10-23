import type { Metadata } from "next";
import Link from "next/link";
import { Hero, MEASURE, Section, SectionHead } from "@/components/landing/Section";
import { Faqs } from "@/components/landing/Faqs";
import { RequestAccessButton } from "@/components/landing/RequestAccessButton";

export const metadata: Metadata = {
  title: "FAQs | Senebiclabs",
  description:
    "Questions clinicians ask about Senebiclabs: who can join, what the work involves, how it is reviewed, how pay works and how case material is handled.",
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
        <p className="font-display text-[12px] font-extrabold uppercase tracking-[0.3em] text-accent-ink">FAQs</p>
        <h1 className="mx-auto mt-5 max-w-[880px] text-[38px] font-extrabold leading-[1.08] text-ink sm:text-[54px]">
          Questions clinicians ask
        </h1>
        <p className={`${MEASURE.intro} mt-5 text-[19px] leading-relaxed text-muted`}>
          Who can join, what the work involves, how it is reviewed, how pay works,
          and how case material is handled.
        </p>
      </Hero>

      <Section>
        <div className="text-center">
          <Faqs />
        </div>
      </Section>

      <Section>
        <SectionHead
          title="Put your clinical expertise to work"
          intro="Membership is by invitation. Request access and our team will review it; we email you if we have work that fits your practice."
        />
        <div className="mt-10 flex flex-col items-center gap-6">
          <RequestAccessButton />
          <Link
            href="/about-us"
            className="focusable rounded-btn text-body font-semibold text-accent-ink underline-offset-2 hover:underline"
          >
            Read more about what we do
          </Link>
        </div>
      </Section>
    </>
  );
}
