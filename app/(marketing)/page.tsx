import type { Metadata } from "next";
import Link from "next/link";
import {
  MEASURE,
  Section,
  SectionHead,
} from "@/components/landing/Section";
import { Testimonials } from "@/components/landing/Testimonials";
import { Faqs } from "@/components/landing/Faqs";
import { RequestAccessButton } from "@/components/landing/RequestAccessButton";
import { WorkTabs } from "@/components/landing/WorkTabs";
import { Slideshow } from "@/components/landing/Slideshow";
import { ELIGIBILITY, JOIN_STEPS, WHY_SENEBICLABS, WORK_TASKS } from "@/lib/marketing-content";

export const metadata: Metadata = {
  title: "Senebiclabs for clinicians",
  description:
    "Paid remote work for licensed clinicians. Put your clinical knowledge to work reviewing medical AI, on your own schedule. Invite-only for now: request access and we will email you when we open.",
};

/**
 * The landing page's story, top to bottom:
 *
 *   the promise        what you could do, and one button to start
 *   why it matters     medical AI already answers people; someone has to check
 *   the work           what a clinician actually does here
 *   why join           what the work gives back
 *   who it is for      the bar, stated plainly
 *   (testimonials)     renders only once real clinicians have given quotes
 *   how to start       four steps, as they are today
 *   questions          the featured FAQs
 *   the close          the same button again
 *
 * Where a page like this would usually show counts of experts and money paid,
 * this one explains the problem instead. There are no figures here we could
 * stand behind yet, so there are no figures.
 */


export default function Landing() {
  return (
    <>
      {/* Two columns: the promise on the left, the one thing to do on the
          right. Stacks, promise first, on a phone. */}
      <section>
        <div className="mx-auto grid w-full max-w-[1280px] items-center gap-12 px-5 pb-20 pt-32 sm:pt-40 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-16 lg:px-10 lg:pb-28">
          <div>
            <p className="font-display text-[12px] font-extrabold uppercase tracking-[0.3em] text-accent-ink">
              For licensed clinicians
            </p>
            <h1 className="mt-5 max-w-[640px] text-[40px] font-extrabold leading-[1.06] text-ink sm:text-[56px]">
              Your clinical expertise can shape the future of medical AI.
            </h1>
            <div className="mt-6 max-w-[560px] space-y-3 text-[18px] leading-relaxed text-muted">
              <p className="font-medium text-strong">
                Join medical experts around the world shaping the future of medical AI.
              </p>
              <p>
                Use your expertise to help build, evaluate, and improve the AI systems
                that will shape the future of healthcare.
              </p>
            </div>
          </div>

          <div className="flex flex-col items-start gap-5 lg:items-center">
            <RequestAccessButton className="w-full sm:w-auto" />
            <ul className="flex flex-wrap gap-2">
              {["Fully remote", "Invite-only", "No AI experience needed"].map((t) => (
                <li
                  key={t}
                  className="rounded-full border border-hairline-strong bg-white px-3.5 py-1.5 text-[14px] font-medium text-strong"
                >
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Why it matters. The problem first, so the work that follows reads as
          the answer to it rather than as a list of tasks. */}
      <Section dark>
        <SectionHead
          eyebrow="Why clinicians"
          title="Medical AI is already answering people's health questions"
        />
        <div className={`${MEASURE.prose} mt-8 space-y-5 text-center text-body leading-relaxed text-muted`}>
          <p>
            People ask these systems about symptoms, medicines and results, and the
            answers sound just as confident when they are wrong. A model cannot tell
            you when that is. A clinician who works in that area can.
          </p>
          <p>
            That is the work here. Licensed clinicians read what a model said, judge
            it against the guidelines they already practise by, and correct it.
            What they decide becomes the standard the model is measured and
            improved against.
          </p>
        </div>
      </Section>

      {/* Three tabs rather than three columns: a visitor picks the task they
          want to understand and sees what it involves. */}
      <Section wide>
        <SectionHead
          eyebrow="The work"
          title="How clinicians like you improve AI models"
          intro="We depend on licensed clinicians, in the specialties they actually practise, to improve medical AI. Look through the tasks you would do on Senebiclabs."
        />
        <WorkTabs tasks={WORK_TASKS} />
      </Section>

      {/* One claim at a time, swiped through, so each gets the room to say
          what it actually means rather than being a line in a grid. */}
      <Section wide>
        <SectionHead
          eyebrow="Why Senebiclabs"
          title="Why clinicians join"
          intro="Four things you can hold us to, and what each one means in practice."
        />
        <Slideshow items={WHY_SENEBICLABS} />
      </Section>

      <Section tight>
        <SectionHead
          eyebrow="Who it is for"
          title="The bar is clinical experience"
          intro="There is nothing to buy and no training to complete first."
        />
        <ul className="mx-auto mt-10 grid max-w-[640px] grid-cols-1 gap-y-3 text-center sm:grid-cols-2">
          {ELIGIBILITY.map((r) => (
            <li key={r} className="text-body text-muted">
              {r}
            </li>
          ))}
        </ul>
      </Section>

      {/* Renders only once real quotes exist. */}
      <Testimonials />

      <Section>
        <SectionHead eyebrow="How it works" title="Four steps to your first case" />
        <ol className="mx-auto mt-14 max-w-[720px] space-y-10">
          {JOIN_STEPS.map((step, i) => (
            <li key={step.title} className="text-center">
              <p aria-hidden="true" className="tnum font-display text-[34px] font-extrabold leading-none text-accent">
                {String(i + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-3 text-[19px] font-bold leading-snug text-ink">{step.title}</h3>
              <p className={`${MEASURE.intro} mt-2 text-body leading-relaxed text-muted`}>
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </Section>

      <Section>
        <SectionHead eyebrow="Questions" title="What clinicians ask" />
        <div className="mx-auto mt-14 max-w-[680px] text-left">
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
          title="Put your clinical knowledge to paid work"
          intro="Senebiclabs is invite-only for now. Request access and we will email you when we open to clinicians."
        />
        <div className="mt-10 flex justify-center">
          <RequestAccessButton />
        </div>
      </Section>
    </>
  );
}
