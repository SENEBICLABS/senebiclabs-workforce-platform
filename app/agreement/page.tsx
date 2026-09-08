"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
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
    body: "You are paid at the rate published for each pool, for reviews you complete and submit. Payments clear weekly. Flagged cases are paid at the same rate as completed reviews.",
  },
  {
    heading: "6. Liability",
    body: "Your reviews inform system evaluation. They are not clinical advice to any patient and create no clinician–patient relationship.",
  },
];

export default function AgreementPage() {
  const router = useRouter();
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
    <div className="min-h-screen bg-canvas px-5 py-12">
      <div className="mx-auto w-full max-w-[680px]">
        <div className="mb-6 flex items-center gap-2" aria-label="Step 2 of 3">
          <span className="h-1 flex-1 rounded-full bg-accent" />
          <span className="h-1 flex-1 rounded-full bg-accent" />
          <span className="h-1 flex-1 rounded-full bg-hairline" />
          <span className="ml-2 text-label uppercase text-muted">
            Step 2 of 3
          </span>
        </div>

        <h1 className="text-title text-ink">Reviewer agreement</h1>
        <p className="mt-1.5 text-body text-muted">
          Read this through before you begin. It covers what the work is, how
          you are paid, and how case material must be handled.
        </p>

        <Card className="mt-6">
          <div className="max-h-[420px] divide-y divide-hairline overflow-y-auto">
            {CLAUSES.map((clause) => (
              <section key={clause.heading} className="px-5 py-4">
                <h2 className="text-body font-semibold text-ink">
                  {clause.heading}
                </h2>
                <p className="mt-1 text-body leading-relaxed text-muted">
                  {clause.body}
                </p>
              </section>
            ))}
          </div>
        </Card>

        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-card border border-hairline bg-surface p-4 transition-colors hover:bg-canvas">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => {
              setAccepted(e.target.checked);
              setError("");
            }}
            className="focusable mt-0.5 h-4 w-4 shrink-0 accent-accent"
          />
          <span className="text-body text-ink">
            I have read the reviewer agreement and I accept its terms.
          </span>
        </label>

        {error && (
          <p role="alert" className="mt-3 text-[13px] text-danger">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <Button size="lg" loading={loading} onClick={handleAccept}>
            Accept and continue
          </Button>
          <Button size="lg" variant="secondary" onClick={() => router.push("/")}>
            Back to sign in
          </Button>
        </div>
      </div>
    </div>
  );
}
