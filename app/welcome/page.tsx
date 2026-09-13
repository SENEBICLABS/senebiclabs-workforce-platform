"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const POINTS = [
  {
    title: "How the work runs",
    body: "You review cases one at a time. Each pool carries its own rubric, shown beside every case, and your place is saved between sessions.",
  },
  {
    title: "How you are paid",
    body: "Professional rates, set per pool and shown before you start. Payments clear every Friday for the week prior.",
  },
  {
    title: "When something is unclear",
    body: "Flag the case. It goes to a second clinician rather than forcing a guess — flagging is expected, not penalised.",
  },
];

export default function WelcomePage() {
  const router = useRouter();

  useEffect(() => {
    localStorage.setItem("senebiclabs:seen-welcome", "true");
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-5 py-12">
      <div className="w-full max-w-[560px]">
        <div className="mb-6 flex items-center gap-2" aria-label="Step 3 of 3">
          <span className="h-1 flex-1 rounded-full bg-accent" />
          <span className="h-1 flex-1 rounded-full bg-accent" />
          <span className="h-1 flex-1 rounded-full bg-accent" />
          <span className="ml-2 text-label uppercase text-muted">
            Step 3 of 3
          </span>
        </div>

        <h1 className="text-title text-ink">Welcome to Senebiclabs</h1>
        <p className="mt-1.5 text-body text-muted">
          You are set up and eligible to begin reviewing.
        </p>

        <Card className="mt-6 divide-y divide-hairline">
          {POINTS.map((point, i) => (
            <div key={point.title} className="flex gap-4 p-5">
              <span
                aria-hidden="true"
                className="tnum flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[13px] font-bold text-accent"
              >
                {i + 1}
              </span>
              <div>
                <h2 className="text-body font-semibold text-ink">{point.title}</h2>
                <p className="mt-1 text-body text-muted">{point.body}</p>
              </div>
            </div>
          ))}
        </Card>

        <Button
          size="lg"
          className="mt-6 w-full"
          onClick={() => router.push("/dashboard")}
        >
          Go to your dashboard
        </Button>

        {/* The public site has no sign-in button, by design: membership is by
            invitation and those pages are written for people who do not have
            an account. So this is the one moment to tell a new member how to
            get back. Any signed-in page redirects to sign-in when a session
            has lapsed, which is what makes the bookmark enough. */}
        <p className="mt-4 text-center text-[13px] text-muted">
          Bookmark your dashboard to come back. If you are signed out, it will
          take you straight to sign in.
        </p>
      </div>
    </div>
  );
}
