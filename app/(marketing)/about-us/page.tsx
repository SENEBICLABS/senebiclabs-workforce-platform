import type { Metadata } from "next";
import Link from "next/link";
import { SignInCta } from "@/components/landing/SignInCta";

export const metadata: Metadata = {
  title: "About us | Senebiclabs",
  description:
    "Senebiclabs is a clinical review platform. Licensed clinicians judge what medical AI says against the guidelines they already work to, and that judgment becomes the reference these systems are measured against.",
};

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
    body: "Where a clinician writes an answer rather than choosing one, a second clinician approves it, edits it, or sends it back. The approved text is delivered as one clinician's words. Two good answers to the same question are not votes to be blended.",
  },
  {
    title: "Confidential by construction",
    body: "Case material stays inside the platform. A clinician sees only the pools they have been given, access is a record that can be withdrawn, and nothing is downloadable. The confidentiality is enforced by the system rather than asked for in a policy.",
  },
];

export default function AboutUs() {
  return (
    <>
      <section>
        <div className="mx-auto w-full max-w-[1040px] px-5 py-24 text-center sm:py-32 lg:px-8">
          <p className="text-label uppercase text-muted">About us</p>
          <h1
            className="mx-auto mt-5 max-w-[880px] text-[42px] leading-[1.04] text-ink sm:text-[60px]"
          >
            Someone has to decide what a correct answer looks like
          </h1>
          <p className="mx-auto mt-5 max-w-[560px] text-[17px] leading-relaxed text-muted">
            Medical AI is measured against a reference standard. That standard is
            not discovered in the data, it is set by people who know the subject.
            Senebiclabs is where licensed clinicians set it.
          </p>
        </div>
      </section>

      <section>
        <div className="mx-auto w-full max-w-[1040px] px-5 py-20 text-center sm:py-28 lg:px-8">
          <div className="space-y-5 text-body leading-relaxed text-muted">
            <h2 className="mx-auto max-w-[880px] text-[30px] leading-[1.1] text-ink sm:text-[38px]">
              What we do
            </h2>
            <p>
              A model gives an answer to a clinical question. Whether that answer
              is good is not something the model can tell you, and it is not
              something a general reviewer can tell you either. It takes a
              clinician who works in that area and knows the guidelines the
              answer should follow.
            </p>
            <p>
              We put those cases in front of clinicians who do. They confirm the
              answer, correct it, or flag what it missed. What comes out is the
              reference a medical AI system is tested and improved against, with
              a named specialty and a licence behind every judgment in it.
            </p>
            <p>
              We build the side of that which clinicians use: how work is served,
              how access is controlled, how disagreements are resolved, and how
              people are paid for the time they put in.
            </p>
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto w-full max-w-[1040px] px-5 py-20 sm:py-28 lg:px-8">
          <div className="text-center">
            <h2 className="mx-auto max-w-[880px] text-[30px] leading-[1.1] text-ink sm:text-[38px]">
              How we think about the work
            </h2>
            <p className="mx-auto mt-5 max-w-[560px] text-[17px] leading-relaxed text-muted">
              Four decisions that shape everything else on the platform.
            </p>
          </div>

          <div className="mt-14 grid grid-cols-1 gap-x-10 gap-y-12 md:grid-cols-2">
            {PRINCIPLES.map((p) => (
              <div key={p.title} className="text-center">
                <h3 className="text-[17px] leading-snug text-ink">{p.title}</h3>
                <p className="mt-1.5 text-body leading-relaxed text-muted">
                  {p.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto w-full max-w-[1040px] px-5 py-20 text-center sm:py-28 lg:px-8">
          <div className="space-y-5 text-body leading-relaxed text-muted">
            <h2 className="mx-auto max-w-[880px] text-[30px] leading-[1.1] text-ink sm:text-[38px]">
              How we treat the clinicians who work here
            </h2>
            <p>
              Reviewing is professional work and is paid as such, per case, at a
              rate shown before anyone accepts anything. Flagging a case you
              cannot judge pays the same as completing one, because a platform
              that pays only for answers is a platform that buys guesses.
            </p>
            <p>
              There are no shifts, no minimum hours and no targets. Membership is
              by invitation and is vetted, which keeps the work worth doing and
              means we are asking a smaller number of people to do it properly
              rather than a larger number to do it quickly.
            </p>
          </div>
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
              href="/our-experts"
              className="focusable rounded-btn font-semibold text-accent underline-offset-2 hover:underline"
            >
              See who reviews here
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
