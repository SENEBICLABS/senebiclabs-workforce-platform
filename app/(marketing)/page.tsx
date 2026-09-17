import type { Metadata } from "next";
import Link from "next/link";
import {
  Grid,
  GridItem,
  Hero,
  MEASURE,
  Section,
  SectionHead,
} from "@/components/landing/Section";
import { Testimonials } from "@/components/landing/Testimonials";
import { Faqs } from "@/components/landing/Faqs";
import { RequestAccessButton } from "@/components/landing/RequestAccessButton";
import { WorkTabs } from "@/components/landing/WorkTabs";
import { ELIGIBILITY, JOIN_STEPS, WORK_TASKS } from "@/lib/marketing-content";

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

const WHY_JOIN = [
  {
    title: "Paid for what you already know",
    body: "Paid per reviewed case, at professional rates, with the rate shown before you take anything on.",
  },
  {
    title: "Remote, on your schedule",
    body: "No shifts and no minimum hours. Pick up cases when you have time, and stop when you do not.",
  },
  {
    title: "Inside your own specialty",
    body: "You review in the area you practise, against the guidelines you already work to, not a rubric invented for the task.",
  },
  {
    title: "Your judgment becomes the standard",
    body: "A correction you make today shapes how a model answers the same question for everyone who asks it next.",
  },
];

export default function Landing() {
  return (
    <>
      <Hero>
        <p className="text-label uppercase text-muted">For licensed clinicians</p>
        <h1 className="mx-auto mt-5 max-w-[880px] text-[42px] leading-[1.04] text-ink sm:text-[60px]">
          Your clinical expertise can shape the future of medical AI.
        </h1>
        <div className={`${MEASURE.intro} mt-7 space-y-4 text-[19px] leading-relaxed text-muted`}>
          <p className="text-strong">
            Join medical experts around the world shaping the future of medical AI.
          </p>
          <p>
            Use your expertise to help build, evaluate, and improve the AI systems
            that will shape the future of healthcare.
          </p>
        </div>

        <div className="mt-10 flex flex-col items-center gap-5">
          <RequestAccessButton />
          <p className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
            Fully remote · Paid per case · No AI experience needed
          </p>
        </div>
      </Hero>

      {/* Why it matters. The problem first, so the work that follows reads as
          the answer to it rather than as a list of tasks. */}
      <Section>
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
      <Section>
        <SectionHead
          eyebrow="The work"
          title="How clinicians like you improve AI models"
          intro="We depend on licensed clinicians, in the specialties they actually practise, to improve medical AI. Look through the tasks you would do on Senebiclabs."
        />
        <WorkTabs tasks={WORK_TASKS} />
        <p className={`${MEASURE.intro} mt-10 text-center text-body text-muted`}>
          Any case you cannot judge, you flag instead of guessing. It goes to
          another clinician, and it pays the same as one you complete.
        </p>
      </Section>

      <Section>
        <SectionHead
          eyebrow="Why Senebiclabs"
          title="Why clinicians join"
          intro="Paid work that fits around clinical practice, and changes what these systems tell people."
        />
        <Grid cols={2}>
          {WHY_JOIN.map((item, i) => (
            <GridItem key={item.title} index={i + 1} title={item.title}>
              {item.body}
            </GridItem>
          ))}
        </Grid>
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
              <p aria-hidden="true" className="tnum text-label text-accent">
                {String(i + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-3 text-[19px] leading-snug text-ink">{step.title}</h3>
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
            className="focusable rounded-btn font-semibold text-accent underline-offset-2 hover:underline"
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
