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
import { Faqs } from "@/components/landing/Faqs";
import { RequestAccessButton } from "@/components/landing/RequestAccessButton";
import { JOIN_STEPS } from "@/lib/marketing-content";

export const metadata: Metadata = {
  title: "About us | Senebiclabs",
  description:
    "Senebiclabs is a clinical review platform. Licensed clinicians judge what medical AI says against the guidelines they already work to, and that judgment becomes the reference these systems are measured against.",
};

/**
 * About us, top to bottom:
 *
 *   the mission         why the company exists, in one line
 *   why we built it     the problem and what we do about it
 *   how we think        the decisions that shape the platform
 *   what we promise     what a clinician can hold us to
 *   how to join         the same four steps as the landing page
 *   questions           the featured FAQs
 *   the close           request access
 *
 * No impact figures and no quotes: neither exists yet in a form we could
 * stand behind.
 */

const PRINCIPLES = [
  {
    title: "Clinicians, not annotators",
    body: "Every review is done by someone licensed and practising in the area they are reviewing. There is no general pool of workers reading medical cases, because the judgment we need is the judgment a clinician has and a layperson does not.",
  },
  {
    title: "Disagreement is signal",
    body: "Several clinicians see each case. Where they disagree, the case is adjudicated rather than settled by whichever answer got more votes. A split between two experienced clinicians usually means the case is genuinely hard, and that is worth recording rather than averaging away.",
  },
  {
    title: "Written work is reviewed, not merged",
    body: "Where a clinician writes an answer rather than choosing one, a second clinician approves it, edits it, or sends it back. Two good answers to the same question are not votes to be blended.",
  },
  {
    title: "Confidential by construction",
    body: "Case material stays inside the platform. A clinician sees only the pools they have been given, access can be withdrawn, and nothing is downloadable. The system enforces it rather than a policy asking for it.",
  },
];

const PROMISES = [
  {
    title: "Paid for honest work",
    body: "Paid per case, at a rate shown before you accept anything. Flagging a case you cannot judge pays the same as completing one, because a platform that pays only for answers ends up buying guesses.",
  },
  {
    title: "Your time stays yours",
    body: "No shifts, no minimum hours and no targets. Your place is saved between sessions, so you can stop mid-case and come back to it.",
  },
  {
    title: "Asked because you are qualified",
    body: "Membership is vetted. We would rather a smaller number of clinicians did this properly than a larger number did it quickly, and that is what keeps the work worth doing.",
  },
];

export default function AboutUs() {
  return (
    <>
      <Hero>
        <p className="text-label uppercase text-muted">About us</p>
        <h1 className="mx-auto mt-5 max-w-[880px] text-[42px] leading-[1.04] text-ink sm:text-[60px]">
          Someone has to decide what a correct answer looks like
        </h1>
        <p className={`${MEASURE.intro} mt-5 text-[19px] leading-relaxed text-muted`}>
          Medical AI is measured against a reference standard. That standard is not
          discovered in the data. It is set by people who know the subject, and
          Senebiclabs is where licensed clinicians set it.
        </p>
      </Hero>

      <Section>
        <SectionHead eyebrow="Our story" title="Why we built Senebiclabs" />
        <div className={`${MEASURE.prose} mt-8 space-y-5 text-center text-body leading-relaxed text-muted`}>
          <p>
            A model gives an answer to a clinical question. Whether that answer is
            good is not something the model can tell you, and it is not something a
            general reviewer can tell you either. It takes a clinician who works in
            that area and knows the guidelines the answer should follow.
          </p>
          <p>
            We put those cases in front of clinicians who do. They confirm the
            answer, correct it, or flag what it missed. What comes out is the
            reference a medical AI system is tested and improved against, with a
            specialty and a licence behind every judgment in it.
          </p>
          <p>
            We build the side of that which clinicians use: how work is served, how
            access is controlled, how disagreements are resolved, and how people are
            paid for the time they put in.
          </p>
        </div>
      </Section>

      <Section>
        <SectionHead
          eyebrow="How we work"
          title="How we think about the work"
          intro="Four decisions that shape everything else on the platform."
        />
        <Grid cols={2}>
          {PRINCIPLES.map((p, i) => (
            <GridItem key={p.title} index={i + 1} title={p.title}>
              {p.body}
            </GridItem>
          ))}
        </Grid>
      </Section>

      <Section>
        <SectionHead
          eyebrow="Our promise"
          title="What we promise the clinicians who work here"
        />
        <Grid>
          {PROMISES.map((p, i) => (
            <GridItem key={p.title} index={i + 1} title={p.title}>
              {p.body}
            </GridItem>
          ))}
        </Grid>
      </Section>

      <Section>
        <SectionHead eyebrow="How to join" title="Four steps to your first case" />
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
