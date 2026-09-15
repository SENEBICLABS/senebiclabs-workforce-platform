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
import { RequestAccessButton } from "@/components/landing/RequestAccessButton";
import { ELIGIBILITY } from "@/lib/marketing-content";

export const metadata: Metadata = {
  title: "Our experts | Senebiclabs",
  description:
    "Who reviews on Senebiclabs, how licences are verified, and how the quality of clinical judgment is upheld once someone is on the platform.",
};

/**
 * Our experts, top to bottom:
 *
 *   the promise        every judgment has a licence behind it
 *   who reviews        who they are, and what we require
 *   how we vet         the four steps before anyone sees a real case
 *   (profiles)         only once real clinicians have agreed to be named
 *   how quality holds  what happens after someone is in
 *   the close          request access
 *
 * A page like this usually runs on expert stories and ratings. We have neither
 * yet, and a page called "our experts" is exactly where a fabricated person
 * would do the most damage, so it shows how vetting works instead of who has
 * passed it.
 */

/**
 * Reviewer profiles. Empty until real clinicians have agreed to be named; the
 * section renders nothing while it is. Each entry needs a real clinician who
 * has consented to appear by name, credential and specialty.
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
    title: "Request access",
    body: "A clinician tells us their name, specialty and the country they practise in. Nothing is created at this point.",
  },
  {
    title: "Licence check",
    body: "We check the licence against the register it was issued by. A licence that is not active, or not in the specialty claimed, does not go further.",
  },
  {
    title: "Calibration",
    body: "A short set of cases with known answers, written by the clinical leads for that body of work. It confirms a reviewer reads cases the way the rubric expects before any real case reaches them.",
  },
  {
    title: "Invitation",
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
    body: "For written work, one clinician writes and a different one approves, edits or sends it back. The platform will not offer a reviewer their own work.",
  },
  {
    title: "Flagging is paid",
    body: "A clinician who cannot judge a case flags it and is paid the same as for completing one. Nobody is paid more for guessing than for saying so.",
  },
];

export default function OurExperts() {
  return (
    <>
      <Hero>
        <p className="text-label uppercase text-muted">Our experts</p>
        <h1 className="mx-auto mt-5 max-w-[880px] text-[42px] leading-[1.04] text-ink sm:text-[60px]">
          Every judgment here has a licence behind it
        </h1>
        <p className={`${MEASURE.intro} mt-5 text-[17px] leading-relaxed text-muted`}>
          Reviewing is done by clinicians who are licensed and practising in the
          area they review. Membership is vetted and by invitation, and this is what
          that means in practice.
        </p>
      </Hero>

      <Section>
        <SectionHead eyebrow="Who reviews here" title="Practising clinicians, in their own specialty" />
        <div className={`${MEASURE.prose} mt-8 space-y-5 text-center text-body leading-relaxed text-muted`}>
          <p>
            Physicians and specialists who hold a current licence and still practise.
            They review inside their own specialty, against the guidelines they
            already work to, not against a rubric invented for the task.
          </p>
          <p>
            The specialties we need change as new work arrives. Rather than publish a
            list that would be out of date by the time you read it, we would rather
            you told us yours when you request access.
          </p>
        </div>
        <div className="mt-12 text-center">
          <h3 className="text-[17px] leading-snug text-ink">What we require</h3>
          <ul className="mx-auto mt-5 grid max-w-[640px] grid-cols-1 gap-y-3 sm:grid-cols-2">
            {ELIGIBILITY.map((r) => (
              <li key={r} className="text-body text-muted">
                {r}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section>
        <SectionHead
          eyebrow="Vetting"
          title="How we vet"
          intro="Four things happen before anyone sees a real case."
        />
        <ol className="mx-auto mt-14 max-w-[720px] space-y-10">
          {VETTING.map((v, i) => (
            <li key={v.title} className="text-center">
              <p aria-hidden="true" className="tnum text-label text-accent">
                {String(i + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-3 text-[17px] leading-snug text-ink">{v.title}</h3>
              <p className={`${MEASURE.intro} mt-2 text-body leading-relaxed text-muted`}>
                {v.body}
              </p>
            </li>
          ))}
        </ol>
      </Section>

      {/* Profiles appear only once real clinicians have agreed to be named. */}
      {EXPERTS.length > 0 && (
        <Section>
          <SectionHead title="Some of the clinicians who review here" />
          <div className="mt-14 grid grid-cols-1 gap-x-10 gap-y-12 md:grid-cols-3">
            {EXPERTS.map((e) => (
              <div key={e.name} className="text-center">
                <p className="text-[17px] leading-snug text-ink">{e.name}</p>
                <p className="mt-1 text-body text-muted">
                  {e.credential}, {e.specialty}
                </p>
                <p className="mt-0.5 text-[13px] text-muted">{e.country}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section>
        <SectionHead
          eyebrow="Quality"
          title="How quality holds up"
          intro="Vetting decides who gets in. These decide what happens afterwards."
        />
        <Grid cols={2}>
          {SAFEGUARDS.map((s, i) => (
            <GridItem key={s.title} index={i + 1} title={s.title}>
              {s.body}
            </GridItem>
          ))}
        </Grid>
      </Section>

      <Section>
        <SectionHead
          title="Review with clinicians who know the work"
          intro="Senebiclabs is invite-only for now. Request access and we will email you when we open to clinicians."
        />
        <div className="mt-10 flex flex-col items-center gap-6">
          <RequestAccessButton />
          <Link
            href="/faqs"
            className="focusable rounded-btn text-body font-semibold text-accent underline-offset-2 hover:underline"
          >
            Read the questions clinicians ask
          </Link>
        </div>
      </Section>
    </>
  );
}
