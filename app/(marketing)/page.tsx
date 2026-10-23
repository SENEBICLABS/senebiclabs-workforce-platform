import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import {
  EYEBROW,
  MEASURE,
  Section,
  SectionHead,
} from "@/components/landing/Section";
import { Testimonials } from "@/components/landing/Testimonials";
import { Faqs } from "@/components/landing/Faqs";
import { RequestAccessButton } from "@/components/landing/RequestAccessButton";
import { WorkTabs } from "@/components/landing/WorkTabs";
import {
  ELIGIBILITY,
  JOIN_STEPS,
  PAY_POINTS,
  STANDARDS,
  TRUST,
  WORK_TASKS,
} from "@/lib/marketing-content";

export const metadata: Metadata = {
  title: "Senebiclabs for clinicians",
  description:
    "Your clinical expertise helps evaluate and improve medical AI. Senebiclabs brings licensed clinicians to structured, remote evaluation work. Membership is by invitation: request access to join the list.",
};

/**
 * The landing page, in the order a clinician deciding whether to apply needs
 * it:
 *
 *   hero              what this is, and the one thing to do
 *   purpose           why clinical judgment is the thing being asked for
 *   the work          what contributors actually do
 *   who               the requirements, and that requesting is not acceptance
 *   how it works      the journey as the product runs it today
 *   standards, trust  what we expect, and how case material is handled
 *   pay               only as far as the agreement goes
 *   questions         the featured FAQs
 *   the close         the same call to action
 *
 * No figures, no testimonials and no outcome claims: none exist yet in a form
 * we could stand behind. The CTA is "Request access" because that is the real
 * flow; there is no direct application.
 */

/** A titled block of text on a white card, for the short lists below. */
function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-hairline bg-surface p-6 text-left shadow-card">
      <h3 className="text-[18px] font-bold leading-snug text-ink">{title}</h3>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">{children}</p>
    </div>
  );
}

export default function Landing() {
  return (
    <>
      {/* Two columns: the promise on the left, the one thing to do on the
          right. Stacks, promise first, on a phone. */}
      <section>
        <div className="mx-auto grid w-full max-w-[1280px] items-center gap-12 px-5 pb-20 pt-32 sm:pt-40 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-16 lg:px-10 lg:pb-28">
          <div>
            <p className={EYEBROW}>For licensed clinicians</p>
            <h1 className="mt-5 max-w-[680px] text-[38px] font-extrabold leading-[1.08] text-ink sm:text-[54px]">
              Your clinical expertise helps evaluate and improve medical AI.
            </h1>
            <p className="mt-6 max-w-[580px] text-[18px] leading-relaxed text-muted">
              Senebiclabs brings licensed clinicians to structured, remote work on
              medical AI: judging the answers these systems give, labelling clinical
              data, and writing reference answers, each against a rubric written for
              the project.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <RequestAccessButton />
              <a
                href="#how-it-works"
                className="focusable inline-flex h-14 items-center justify-center rounded-full border border-hairline-strong bg-white px-8 font-display text-[16px] font-bold text-ink transition-colors hover:border-ink"
              >
                See how it works
              </a>
            </div>
            <p className="mt-4 text-[14px] text-subtle">
              Membership is by invitation. Requesting access adds you to our list; it
              does not create an account.
            </p>
          </div>

          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {[
              ["Clinical, not technical", "No AI experience needed. The judgment asked for is the one you use in practice."],
              ["Remote and self-paced", "Work in your browser when it suits you. No shifts, no minimum hours."],
              ["Paid work", "Rates and schedule are agreed with you in writing before you begin."],
            ].map(([title, body]) => (
              <li
                key={title}
                className="flex gap-3 rounded-card border border-hairline bg-white p-5 shadow-card"
              >
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-on-fill">
                  <Check size={14} strokeWidth={3} aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-[16px] font-semibold text-ink">{title}</span>
                  <span className="mt-0.5 block text-[15px] text-muted">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Purpose. The problem first, so the work that follows reads as the
          answer to it. */}
      <Section dark>
        <SectionHead
          eyebrow="Why clinicians"
          title="Only a clinician can tell when a medical answer is wrong"
        />
        <div className={`${MEASURE.prose} mt-8 space-y-5 text-center text-body leading-relaxed text-muted`}>
          <p>
            Medical AI systems answer questions about symptoms, medicines and test
            results, and they sound just as confident when they are wrong. Whether an
            answer is correct, complete and safe is a clinical judgment, and it takes a
            clinician who works in that area to make it.
          </p>
          <p>
            That is the work here. Clinicians read what a system said, judge it against
            the guidelines they already practise by, and record what is right, what is
            wrong and what is missing. Those judgments are what the system is measured
            against.
          </p>
        </div>
      </Section>

      <Section wide>
        <SectionHead
          eyebrow="The work"
          title="What contributors do"
          intro="Work comes in projects, and each project has one purpose. Which kinds you see depends on the projects you are given access to; not every clinician does every kind."
        />
        <WorkTabs tasks={WORK_TASKS} />
        <p className={`${MEASURE.intro} mt-8 text-center text-[15px] text-subtle`}>
          In every kind of work you can flag a case you cannot judge. The flag is
          recorded as work.
        </p>
      </Section>

      <Section tight>
        <SectionHead
          eyebrow="Who can contribute"
          title="Practising clinicians"
          intro="There is nothing to buy and no training to complete first."
        />
        <ul className="mx-auto mt-10 grid max-w-[760px] grid-cols-1 gap-3 sm:grid-cols-2">
          {ELIGIBILITY.map((r) => (
            <li
              key={r}
              className="flex items-center gap-3 rounded-card border border-hairline bg-white px-5 py-4 text-left text-[16px] text-strong shadow-card"
            >
              <Check size={18} strokeWidth={2.5} aria-hidden="true" className="shrink-0 text-accent-ink" />
              {r}
            </li>
          ))}
        </ul>
        <p className={`${MEASURE.intro} mt-8 text-center text-[15px] leading-relaxed text-muted`}>
          Every request is reviewed by our team. We invite clinicians whose specialty
          fits the work we have running, so requesting access does not guarantee an
          invitation.
        </p>
      </Section>

      {/* Renders only once real quotes exist. */}
      <Testimonials />

      <section id="how-it-works" className="scroll-mt-24">
        <div className="mx-auto w-full max-w-[1280px] px-5 py-20 sm:py-28 lg:px-10">
          <SectionHead eyebrow="How it works" title="From request to your first case" />
          <ol className="mx-auto mt-14 grid max-w-[820px] gap-4">
            {JOIN_STEPS.map((step, i) => (
              <li
                key={step.title}
                className="flex gap-5 rounded-card border border-hairline bg-white p-6 text-left shadow-card sm:gap-7 sm:p-7"
              >
                <p
                  aria-hidden="true"
                  className="tnum w-12 shrink-0 font-display text-[36px] font-extrabold leading-none text-accent"
                >
                  {String(i + 1).padStart(2, "0")}
                </p>
                <div>
                  <h3 className="text-[18px] font-bold leading-snug text-ink">{step.title}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <Section>
        <SectionHead
          eyebrow="Quality and trust"
          title="Careful clinical judgment, handled with care"
          intro="What we ask of every contributor, and how case material and your identity are protected."
        />
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {STANDARDS.map((s) => (
            <InfoCard key={s.title} title={s.title}>
              {s.body}
            </InfoCard>
          ))}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {TRUST.map((t) => (
            <InfoCard key={t.title} title={t.title}>
              {t.body}
            </InfoCard>
          ))}
        </div>
        <p className={`${MEASURE.prose} mt-8 text-center text-[15px] leading-relaxed text-muted`}>
          More than one clinician reads each item. On projects that use adjudication,
          disagreements go to a senior clinician. Written answers are reviewed by a
          colleague, and nobody reviews their own.
        </p>
      </Section>

      <Section tight>
        <SectionHead
          eyebrow="Compensation"
          title="How pay works"
          intro="The terms that apply to you are agreed in writing, and set out in the reviewer agreement you accept when you join."
        />
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {PAY_POINTS.map((p) => (
            <InfoCard key={p.title} title={p.title}>
              {p.body}
            </InfoCard>
          ))}
        </div>
      </Section>

      <Section>
        <SectionHead eyebrow="Questions" title="What clinicians ask" />
        <div className="mx-auto mt-14 max-w-[720px] text-left">
          <Faqs featuredOnly />
        </div>
        <p className="mt-10 text-center text-body text-muted">
          <Link
            href="/faqs"
            className="focusable rounded-btn font-semibold text-accent-ink underline-offset-2 hover:underline"
          >
            Read all the questions
          </Link>
        </p>
      </Section>

      <Section>
        <SectionHead
          title="Put your clinical expertise to work"
          intro="If you are a licensed clinician, request access. We review every request and email you if we have work that fits your practice."
        />
        <div className="mt-10 flex justify-center">
          <RequestAccessButton />
        </div>
      </Section>
    </>
  );
}
