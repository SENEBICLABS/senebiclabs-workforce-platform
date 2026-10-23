"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ArrowRight, Sparkles } from "lucide-react";
import { OnboardingShell } from "@/components/auth/AuthShell";
import { AgreementNotice } from "@/components/AgreementNotice";
import { Card, IconBadge } from "@/components/ui/Card";

const POINTS = [
  {
    title: "Where your work appears",
    body: "Your dashboard lists the pools you have been given access to and what is waiting in each. Work depends on the projects running, so there may be times when nothing is open to you.",
  },
  {
    title: "How the work runs",
    body: "You review cases one at a time. Each pool carries its own rubric, shown beside every case, and your answers are saved as you go.",
  },
  {
    title: "When something is unclear",
    body: "If you cannot judge a case, flag it rather than guess. It stops being offered to you, and the flag is recorded as work on your work record.",
  },
  {
    title: "How you are paid",
    body: "Your rate and payment schedule are the ones agreed with you in writing. The platform does not show rates or statements yet; your work record lists every pass you make.",
  },
];

export default function WelcomePage() {
  const router = useRouter();

  useEffect(() => {
    localStorage.setItem("senebiclabs:seen-welcome", "true");
  }, []);

  return (
    <OnboardingShell width="sm">
        <IconBadge size="lg">
          <Sparkles size={22} strokeWidth={1.75} />
        </IconBadge>
        <h1 className="mt-5 text-[28px] font-bold leading-tight tracking-[-0.03em] text-ink sm:text-[32px]">
          Welcome to Senebiclabs
        </h1>
        <p className="mt-2 text-body text-muted">
          Your account is set up. Here is what happens from here.
        </p>

        <AgreementNotice className="mt-8" />

        <Card className="mt-8 divide-y divide-hairline-soft">
          {POINTS.map((point, i) => (
            <div key={point.title} className="flex gap-4 p-5 sm:p-6">
              <span
                aria-hidden="true"
                className="tnum flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft font-mono text-[13px] font-semibold text-accent-ink ring-1 ring-inset ring-accent/25"
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h2 className="text-[16px] font-semibold text-ink">{point.title}</h2>
                <p className="mt-1 text-[15px] leading-relaxed text-muted">{point.body}</p>
              </div>
            </div>
          ))}
        </Card>

        <Button
          size="lg"
          className="group mt-8 w-full"
          onClick={() => router.push("/dashboard")}
        >
          Go to your dashboard
          <ArrowRight
            size={16}
            aria-hidden="true"
            className="transition-transform duration-150 group-hover:translate-x-0.5"
          />
        </Button>

        {/* The public site has no sign-in button, by design: membership is by
            invitation and those pages are written for people who do not have
            an account. So this is the one moment to tell a new member how to
            get back. Any signed-in page redirects to sign-in when a session
            has lapsed, which is what makes the bookmark enough. */}
        <p className="mt-4 text-center text-[14px] text-subtle">
          Bookmark your dashboard to come back. If you are signed out, it will
          take you straight to sign in.
        </p>
    </OnboardingShell>
  );
}
