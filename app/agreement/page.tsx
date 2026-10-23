"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Check, FileText } from "lucide-react";
import { useAppState } from "@/components/AppState";
import { OnboardingShell } from "@/components/auth/AuthShell";
import { Card, IconBadge } from "@/components/ui/Card";
import { FieldError } from "@/components/ui/Field";
import { ApiError, api } from "@/lib/api";

const CLAUSES = [
  {
    heading: "1. Scope of work",
    body: "You review medical-AI outputs for clinical accuracy and safety, exercising your own professional judgment. You are engaged as an independent clinician, not an employee, and you choose which pools you take and when you work.",
  },
  {
    heading: "2. Professional standard",
    body: "You will apply the standard of care you would apply in practice, and the rubric supplied with each pool. Where the two conflict, flag the case rather than resolving it yourself.",
  },
  {
    heading: "3. Confidentiality",
    body: "Case material is confidential. You will not copy, retain, republish, or discuss it outside the platform, and you will not use it to train or evaluate any other system.",
  },
  {
    heading: "4. Data privacy",
    body: "Case material may contain de-identified patient information. You will not attempt to re-identify any individual. If you recognise a case or a person in it, stop and report the conflict.",
  },
  {
    heading: "5. Payment",
    body: "You are paid for the work you complete and submit. Your rate and payment schedule are agreed with you in writing before you begin; they are not published in the platform. Cases you flag as ones you cannot judge are recorded as work. Payment for flagged cases is at the rate agreed with you in writing. Where written work is sent back to be rewritten, that pass is recorded and paid as an approval would be. Every pass is recorded at the time it is made, and you can see your own on your work record.",
  },
  {
    heading: "6. Liability",
    body: "Your reviews inform system evaluation. They are not clinical advice to any patient and create no clinician–patient relationship.",
  },
];

export default function AgreementPage() {
  const router = useRouter();
  const { reloadMe } = useAppState();
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleAccept = async () => {
    if (!accepted) {
      setError("Tick the box to confirm you have read the agreement.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await api.acceptAgreement();
      // The account is read once for the whole app; read it again so the
      // "accept the agreement" prompt does not follow them to the next page.
      reloadMe();
      router.push("/welcome");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "That did not save. Try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <OnboardingShell>
        <IconBadge size="lg">
          <FileText size={22} strokeWidth={1.75} />
        </IconBadge>
        <h1 className="mt-5 text-[28px] font-bold leading-tight tracking-[-0.03em] text-ink sm:text-[32px]">
          Reviewer agreement
        </h1>
        <p className="mt-2 text-body text-muted">
          Please read this before you begin reviewing. It covers what the work is,
          the standard it is held to, how case material must be handled, and how you
          are paid.
        </p>

        <Card className="mt-8 overflow-hidden">
          <div className="max-h-[440px] divide-y divide-hairline-soft overflow-y-auto">
            {CLAUSES.map((clause) => (
              <section key={clause.heading} className="px-5 py-5 sm:px-6">
                <h2 className="text-[15px] font-semibold text-ink">
                  {clause.heading}
                </h2>
                <p className="mt-1.5 text-[15px] leading-relaxed text-muted">
                  {clause.body}
                </p>
              </section>
            ))}
          </div>
        </Card>

        <label
          className={`mt-5 flex cursor-pointer items-start gap-3 rounded-card border p-4 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus ${
            accepted
              ? "border-accent bg-accent-soft"
              : error
                ? "border-danger/60 bg-surface"
                : "border-hairline bg-surface hover:border-accent/55"
          }`}
        >
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => {
              setAccepted(e.target.checked);
              setError("");
            }}
            className="sr-only"
          />
          <span
            aria-hidden="true"
            className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-[5px] border-2 transition-colors ${
              accepted ? "border-accent bg-accent text-on-fill" : "border-hairline-strong"
            }`}
          >
            {accepted && <Check size={13} strokeWidth={3} />}
          </span>
          <span className="text-[15px] text-ink">
            I have read the reviewer agreement and I accept its terms.
          </span>
        </label>

        {error && <FieldError>{error}</FieldError>}

        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row">
          <Button size="lg" variant="secondary" onClick={() => router.push("/dashboard")}>
            Not now
          </Button>
          <Button size="lg" loading={loading} onClick={handleAccept} className="sm:ml-auto">
            Accept and continue
          </Button>
        </div>
    </OnboardingShell>
  );
}
