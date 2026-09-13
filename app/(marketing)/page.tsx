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
import { ELIGIBILITY } from "@/lib/marketing-content";

export const metadata: Metadata = {
  title: "Senebiclabs for clinicians",
  description:
    "Paid remote work for licensed clinicians. Put your clinical knowledge to work reviewing medical AI, on your own schedule. Membership is by invitation.",
};

const EXPECTATIONS = [
  {
    title: "Paid for what you already know",
    body: "Paid per reviewed case, at professional rates, with the rate visible before you take anything on.",
  },
  {
    title: "Remote and flexible",
    body: "No shifts and no minimum hours. Pick up cases when you have time and stop when you do not.",
  },
  {
    title: "Work inside your specialty",
    body: "You review in the areas you actually practise, against the guidelines you already work to.",
  },
  {
    title: "Real clinical rigour",
    body: "Several clinicians see each case and disagreements are adjudicated. Considered work, not volume piecework.",
  },
  {
    title: "Confidential by design",
    body: "Case material stays inside the platform. You see only the pools you have been given.",
  },
  {
    title: "Your judgment is the standard",
    body: "A correction you make today shapes how a model answers the same question for everyone who asks it next.",
  },
];

/**
 * What a clinician actually does, rather than what they get.
 *
 * Every one of these describes a control the workspace really renders: the
 * choice and scale fields, the span highlighter, the free text and structured
 * fields, the flag, and the approve / edit / send back actions on a review
 * pool. Nothing here is aspirational, so it stays true as long as those do.
 */
const WORK = [
  {
    title: "Judge an answer",
    body: "A case, and the answer a model gave for it. You say whether it holds up, choose what went wrong if it did not, rate how confident you are, and highlight the exact passage at fault. The rubric for that body of work sits beside the case while you read.",
  },
  {
    title: "Write the answer yourself",
    body: "Where the model's answer will not do, or the case calls for one written from scratch, you write it. Structured fields where the work needs structure, prose where it needs prose.",
  },
  {
    title: "Approve a colleague's",
    body: "Written work always goes to a second clinician, and never to its author. You approve it, edit it, or send it back saying what has to change. Sending back pays exactly what approving pays.",
  },
];

const STEPS = [
  {
    title: "Get invited",
    body: "An invitation arrives by email, addressed to you, when there is work open in your specialty.",
  },
  {
    title: "Get verified",
    body: "We check your credentials against the register you are licensed with.",
  },
  {
    title: "Calibrate",
    body: "A short set of cases in your specialty, so we can match you to the right work.",
  },
  {
    title: "Review",
    body: "Work through cases from anywhere, on your own schedule, at your own pace.",
  },
  {
    title: "Get paid",
    body: "Paid per reviewed case, including the cases you flag rather than answer.",
  },
];

export default function Landing() {
  return (
    <>
        <Hero>
          <p className="text-label uppercase text-muted">
            For licensed clinicians
          </p>
          <h1 className="mx-auto mt-5 max-w-[880px] text-[42px] leading-[1.04] text-ink sm:text-[60px]">
            Your clinical expertise can shape the future of medical AI.
          </h1>
          {/* Three steps of one ink: the heading at full, this lead at 85%,
              the rest at 72%. That is the whole hierarchy. */}
          <div className={`${MEASURE.intro} mt-7 space-y-4 text-[17px] leading-relaxed text-muted`}>
            <p className="text-strong">
              Join medical experts around the world shaping the future of
              medical AI.
            </p>
            <p>
              Use your expertise to help build, evaluate, and improve the AI
              systems that will shape the future of healthcare.
            </p>
          </div>


          <p className="mt-6 text-[13px] text-muted">
            Membership is by invitation. If you have one, opening it is all it
            takes.
          </p>
        </Hero>

        {/* What the work is, before what it pays. A clinician deciding whether
            to accept an invitation wants to know what a case looks like
            first. */}
        <Section>
          <SectionHead
            eyebrow="The work"
            title="How real experts like you improve AI models"
            intro="We depend on licensed clinicians, in the specialties they actually practise, to improve medical AI. Here are some common tasks you would do on Senebiclabs."
          />
          <Grid>
            {WORK.map((w, i) => (
              <GridItem key={w.title} index={i + 1} title={w.title}>
                {w.body}
              </GridItem>
            ))}
          </Grid>
          <p className={`${MEASURE.intro} mt-14 text-center text-body text-muted`}>
            Any case you cannot judge, you flag instead of guessing. It goes to
            another clinician, and it pays the same as one you complete.
          </p>
        </Section>

        <Section>
          <SectionHead
            eyebrow="What to expect"
            title="Paid work that fits around clinical practice"
            intro="And that changes what these systems tell people."
          />
          <Grid>
            {EXPECTATIONS.map((item, i) => (
              <GridItem key={item.title} index={i + 1} title={item.title}>
                {item.body}
              </GridItem>
            ))}
          </Grid>
        </Section>

        {/* Eligibility sits with the offer, the way a fellowship page states
            who it is for rather than giving it a section of its own. */}
        <Section tight>
          <SectionHead
            eyebrow="Who reviews here"
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
          <SectionHead eyebrow="How it works" title="From invitation to getting paid" />
          <ol className="mx-auto mt-14 max-w-[720px] space-y-10">
            {STEPS.map((step, i) => (
              <li key={step.title} className="text-center">
                <p aria-hidden="true" className="tnum text-label text-accent">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-3 text-[17px] leading-snug text-ink">
                  {step.title}
                </h3>
                <p className={`${MEASURE.intro} mt-2 text-body leading-relaxed text-muted`}>
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </Section>

        {/* FAQs: the featured subset, with the rest a click away. */}
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
            intro="Membership is by invitation. If a colleague has sent you one, it is waiting in your inbox."
          />
        </Section>

    </>
  );
}
