import type { Metadata } from "next";
import {
  CalendarClock,
  CheckCircle2,
  Globe,
  Lock,
  Scale,
  Stethoscope,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { ApplyActions } from "@/components/landing/ApplyDialog";
import { Testimonials } from "@/components/landing/Testimonials";
import { Faqs } from "@/components/landing/Faqs";
import { ELIGIBILITY } from "@/lib/marketing-content";

export const metadata: Metadata = {
  title: "Senebiclabs for clinicians",
  description:
    "Paid remote work for licensed clinicians. Apply your clinical knowledge to reviewing medical AI, on your own schedule. Membership is vetted and by invitation.",
};

const EXPECTATIONS = [
  {
    icon: Wallet,
    title: "Paid for what you already know",
    body: "Paid per reviewed case, at professional rates, with the rate visible before you take anything on.",
  },
  {
    icon: CalendarClock,
    title: "Remote and flexible",
    body: "No shifts and no minimum hours. Pick up cases when you have time and stop when you do not.",
  },
  {
    icon: Stethoscope,
    title: "Work inside your specialty",
    body: "You review in the areas you actually practise, against the guidelines you already work to.",
  },
  {
    icon: Scale,
    title: "Real clinical rigour",
    body: "Several clinicians see each case and disagreements are adjudicated. Considered work, not volume piecework.",
  },
  {
    icon: Lock,
    title: "Confidential by design",
    body: "Case material stays inside the platform. You see only the pools you have been given.",
  },
  {
    icon: Globe,
    title: "Your judgment is the standard",
    body: "A correction you make today shapes how a model answers the same question for everyone who asks it next.",
  },
];

const STEPS = [
  {
    title: "Apply",
    body: "Tell us your specialty and your licence. It takes a couple of minutes.",
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
        {/* Hero */}
        <section>
          <div className="mx-auto max-w-[1100px] px-5 py-20 text-center lg:px-8 lg:py-24">
            <p className="text-label uppercase text-accent">
              For licensed clinicians
            </p>
            <h1
              className="mx-auto mt-4 max-w-[760px] text-[38px] leading-[1.12] text-ink sm:text-[52px]"
              style={{ fontFamily: "var(--font-serif)", fontWeight: 600 }}
            >
              Your clinical expertise can shape the future of medical AI.
            </h1>
            {/* Three paragraphs, so three elements. Blank lines inside a single
                JSX text node collapse to spaces, which ran these together into
                one block on the page. */}
            <div className="mx-auto mt-5 max-w-[600px] space-y-4 text-[17px] leading-relaxed text-muted">
              <p>
                Join medical experts around the world shaping the future of
                medical AI.
              </p>
              <p>
                Use your expertise to help build, evaluate, and improve the AI
                systems that will shape the future of healthcare.
              </p>
              <p>
                Work on your schedule. Get paid for your expertise. Help build
                better medical AI.
              </p>
            </div>

            <div className="mt-8">
              <ApplyActions />
            </div>

            <p className="mt-5 text-[13px] text-muted">
              Membership is vetted. Apply, and we send an invitation to the
              clinicians we can offer work to.
            </p>
          </div>
        </section>

        {/* What you can expect */}
        <section>
          <div className="mx-auto max-w-[1100px] px-5 py-16 lg:px-8">
            <div className="text-center">
              <h2 className="text-[26px] font-semibold leading-tight text-ink">
                What you can expect
              </h2>
              <p className="mx-auto mt-3 max-w-[500px] text-body text-muted">
                Paid work that fits around clinical practice, and that changes
                what these systems tell people.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {EXPECTATIONS.map((item) => (
                <Card key={item.title} className="h-full p-5">
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-accent"
                  >
                    <item.icon size={17} />
                  </span>
                  <h3 className="mt-4 text-section text-ink">{item.title}</h3>
                  <p className="mt-1.5 text-body text-muted">{item.body}</p>
                </Card>
              ))}
            </div>

            {/* Eligibility sits with the offer, the way a fellowship page states
                who may apply rather than giving it a section of its own. */}
            <div className="mx-auto mt-10 max-w-[720px] rounded-card border border-hairline bg-surface p-6 text-center">
              <h3 className="text-section text-ink">Who can apply</h3>
              <p className="mx-auto mt-2 max-w-[440px] text-body text-muted">
                The bar is clinical experience. There is nothing to buy and no
                training to complete first.
              </p>
              <ul className="mx-auto mt-5 grid max-w-[600px] grid-cols-1 gap-2.5 text-left sm:grid-cols-2">
                {ELIGIBILITY.map((r) => (
                  <li key={r} className="flex items-start gap-2.5">
                    <CheckCircle2
                      size={16}
                      aria-hidden="true"
                      className="mt-0.5 shrink-0 text-accent"
                    />
                    <span className="text-body text-muted">{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Renders only once real quotes exist. */}
        <Testimonials />

        {/* How it works */}
        <section>
          <div className="mx-auto max-w-[1100px] px-5 py-16 lg:px-8">
            <h2 className="text-center text-[26px] font-semibold leading-tight text-ink">
              How it works
            </h2>

            <ol className="mx-auto mt-10 max-w-[760px] space-y-6">
              {STEPS.map((step, i) => (
                <li
                  key={step.title}
                  className="flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:gap-6"
                >
                  <span
                    aria-hidden="true"
                    className="tnum shrink-0 text-[15px] font-semibold text-accent sm:w-10"
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="sm:flex-1">
                    <h3 className="text-section text-ink">{step.title}</h3>
                    <p className="mt-1 text-body text-muted">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-10">
              <ApplyActions />
            </div>
          </div>
        </section>

        {/* FAQs: the featured subset, with the rest a click away. */}
        <section>
          <div className="mx-auto max-w-[1100px] px-5 py-16 lg:px-8">
            <h2 className="text-center text-[26px] font-semibold leading-tight text-ink">
              FAQs
            </h2>

            <div className="mx-auto mt-10 max-w-[720px]">
              <Faqs featuredOnly />
            </div>

            <p className="mt-8 text-center text-body text-muted">
              <Link
                href="/faqs"
                className="focusable rounded-btn font-medium text-accent underline-offset-2 hover:underline"
              >
                Read all the questions
              </Link>
            </p>
          </div>
        </section>

        {/* Closing band */}
        <section>
          <div className="mx-auto max-w-[1100px] px-5 py-20 text-center lg:px-8">
            <h2
              className="mx-auto max-w-[560px] text-[30px] leading-tight text-ink"
              style={{ fontFamily: "var(--font-serif)", fontWeight: 600 }}
            >
              Put your clinical knowledge to paid work
            </h2>
            <p className="mx-auto mt-3 max-w-[460px] text-body text-muted">
              Apply with your specialty and licence. We review every application.
            </p>
            <div className="mt-8">
              <ApplyActions />
            </div>
          </div>
        </section>
    </>
  );
}
