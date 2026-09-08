import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, ClipboardCheck, ShieldCheck, UserCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ApplyActions } from "@/components/landing/ApplyDialog";
import { ELIGIBILITY } from "@/lib/marketing-content";

export const metadata: Metadata = {
  title: "Our experts | Senebiclabs",
  description:
    "Who reviews on Senebiclabs, how credentials are verified, and how the quality of clinical judgment is upheld once someone is on the platform.",
};

/**
 * Reviewer profiles.
 *
 * Empty until real clinicians have agreed to be named. The section renders
 * nothing while the list is empty, so this page never shows an invented expert.
 * A page called "our experts" is exactly where a fabricated person would do the
 * most damage, so it says how vetting works instead of who has passed it.
 *
 * To add one, append an entry. Each needs a real clinician who has consented to
 * appear by name, credential and specialty.
 */
interface Expert {
  name: string;
  credential: string;
  specialty: string;
  country: string;
}

const EXPERTS: Expert[] = [
  // { name: "Dr …", credential: "MD", specialty: "Internal medicine", country: "Ghana" },
];

const VETTING = [
  {
    icon: UserCheck,
    step: "Application",
    body: "A clinician applies with their name, specialty, credential and the country they practise in. Nothing is created at this point. An application is a request to be considered.",
  },
  {
    icon: BadgeCheck,
    step: "Credential check",
    body: "We check the licence given against the register it was issued by. A licence that is not active, or not in the specialty claimed, does not proceed.",
  },
  {
    icon: ClipboardCheck,
    step: "Calibration",
    body: "A short set of cases with known answers, written by the clinical leads for that body of work. It confirms that a reviewer reads cases the way the rubric expects before any real case reaches them.",
  },
  {
    icon: ShieldCheck,
    step: "Invitation",
    body: "Only then is an invitation sent, to one named address, good once. That invitation is what creates an account. Nobody registers themselves.",
  },
];

const SAFEGUARDS = [
  {
    title: "More than one clinician per case",
    body: "Cases are reviewed by several clinicians rather than one, so a single reading never becomes the answer on its own.",
  },
  {
    title: "Disagreements are adjudicated",
    body: "Where reviewers differ, the case goes to adjudication rather than to a majority vote. A split between experienced clinicians is treated as information, not noise.",
  },
  {
    title: "Nobody approves their own writing",
    body: "For written work, one clinician writes and a different one approves, edits or sends it back. The platform will not offer a reviewer their own work, and refuses it if asked directly.",
  },
  {
    title: "Flagging is free and paid",
    body: "A clinician who cannot judge a case flags it and is paid the same as for completing one. Nobody is ever paid more for guessing than for saying so.",
  },
];

export default function OurExperts() {
  return (
    <>
      <section className="border-b border-hairline">
        <div className="mx-auto max-w-[1100px] px-5 py-20 text-center lg:px-8">
          <p className="text-label uppercase text-accent">Our experts</p>
          <h1
            className="mx-auto mt-4 max-w-[720px] text-[34px] leading-[1.15] text-ink sm:text-[44px]"
            style={{ fontFamily: "var(--font-serif)", fontWeight: 600 }}
          >
            Every judgment here has a licence behind it
          </h1>
          <p className="mx-auto mt-5 max-w-[580px] text-[17px] leading-relaxed text-muted">
            Reviewing is done by clinicians who are licensed and practising in
            the area they are reviewing. Membership is vetted and by invitation,
            and this is what that means in practice.
          </p>
        </div>
      </section>

      {/* Who is here */}
      <section className="border-b border-hairline bg-canvas">
        <div className="mx-auto max-w-[720px] px-5 py-16 lg:px-8">
          <h2 className="text-[26px] font-semibold leading-tight text-ink">
            Who reviews here
          </h2>
          <div className="mt-4 space-y-4 text-body leading-relaxed text-muted">
            <p>
              Physicians and specialists who hold a current licence and still
              practise. They review inside their own specialty, against the
              guidelines they already work to, not against a rubric invented for
              the task.
            </p>
            <p>
              The specialties represented change as new work arrives. Rather than
              publish a list that would be out of date by the time you read it,
              we would rather you told us yours. If we do not have work for it
              now, the application stays on file until we do.
            </p>
          </div>

          <div className="mt-8 rounded-card border border-hairline bg-surface p-6">
            <h3 className="text-section text-ink">What we require</h3>
            <ul className="mt-4 space-y-2.5">
              {ELIGIBILITY.map((r) => (
                <li key={r} className="flex items-start gap-2.5">
                  <BadgeCheck
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

      {/* Vetting */}
      <section className="border-b border-hairline">
        <div className="mx-auto max-w-[1100px] px-5 py-16 lg:px-8">
          <div className="text-center">
            <h2 className="text-[26px] font-semibold leading-tight text-ink">
              How we vet
            </h2>
            <p className="mx-auto mt-3 max-w-[520px] text-body text-muted">
              Four things happen between applying and seeing a real case.
            </p>
          </div>

          <ol className="mx-auto mt-10 max-w-[760px] divide-y divide-hairline border-y border-hairline">
            {VETTING.map((v, i) => (
              <li
                key={v.step}
                className="flex flex-col gap-1.5 py-5 sm:flex-row sm:items-baseline sm:gap-6"
              >
                <span
                  aria-hidden="true"
                  className="tnum shrink-0 text-[15px] font-semibold text-accent sm:w-10"
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="sm:flex-1">
                  <h3 className="text-section text-ink">{v.step}</h3>
                  <p className="mt-1 text-body leading-relaxed text-muted">
                    {v.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Profiles appear only once real clinicians have agreed to be named. */}
      {EXPERTS.length > 0 && (
        <section className="border-b border-hairline bg-canvas">
          <div className="mx-auto max-w-[1100px] px-5 py-16 lg:px-8">
            <h2 className="text-center text-[26px] font-semibold leading-tight text-ink">
              Some of the clinicians who review here
            </h2>
            <div className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {EXPERTS.map((e) => (
                <Card key={e.name} className="h-full p-5">
                  <p className="text-section text-ink">{e.name}</p>
                  <p className="mt-1 text-body text-muted">
                    {e.credential}, {e.specialty}
                  </p>
                  <p className="mt-0.5 text-[13px] text-muted">{e.country}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Safeguards */}
      <section className="border-b border-hairline bg-canvas">
        <div className="mx-auto max-w-[1100px] px-5 py-16 lg:px-8">
          <div className="text-center">
            <h2 className="text-[26px] font-semibold leading-tight text-ink">
              How quality holds up
            </h2>
            <p className="mx-auto mt-3 max-w-[540px] text-body text-muted">
              Vetting decides who gets in. These decide what happens afterwards.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-2">
            {SAFEGUARDS.map((s) => (
              <Card key={s.title} className="h-full p-5">
                <h3 className="text-section text-ink">{s.title}</h3>
                <p className="mt-1.5 text-body leading-relaxed text-muted">
                  {s.body}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-[1100px] px-5 py-20 text-center lg:px-8">
          <h2
            className="mx-auto max-w-[560px] text-[30px] leading-tight text-ink"
            style={{ fontFamily: "var(--font-serif)", fontWeight: 600 }}
          >
            Apply to review with us
          </h2>
          <p className="mx-auto mt-3 max-w-[460px] text-body text-muted">
            Tell us your specialty and licence. We review every application.
          </p>
          <div className="mt-8">
            <ApplyActions />
          </div>
          <p className="mt-6 text-body text-muted">
            <Link
              href="/faqs"
              className="focusable rounded-btn font-medium text-accent underline-offset-2 hover:underline"
            >
              Read the questions clinicians ask
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
