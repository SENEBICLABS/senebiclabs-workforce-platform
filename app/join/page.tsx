"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Hourglass, Mail } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { buttonClass } from "@/components/ui/button-class";
import { Card, IconBadge } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import {
  AuthShell,
  GoogleButton,
  OrDivider,
} from "@/components/auth/AuthShell";
import { ApiError, api } from "@/lib/api";

interface Validation {
  valid: boolean;
  invited_email?: string;
  inviter?: string | null;
  problem?: string;
}

const DEAD: Record<string, { title: string; body: string }> = {
  not_found: {
    title: "This invitation link is not valid",
    body: "Check you copied the whole link from the email. If it still does not work, ask for a new invitation.",
  },
  used: {
    title: "This invitation has already been used",
    body: "An account was already created from it. Sign in with the address it was sent to.",
  },
  expired: {
    title: "This invitation has expired",
    body: "Invitations last seven days. Ask the colleague who invited you to send a new one.",
  },
  revoked: {
    title: "This invitation is no longer active",
    body: "It was withdrawn before it was used. Ask for a new invitation if you still need access.",
  },
};

const GATE_ERRORS: Record<string, string> = {
  email_mismatch:
    "That is not the address this invitation was sent to. Use the invited address.",
  invite_used: "This invitation has already been used.",
  invite_expired: "This invitation has expired.",
  no_invite: "This invitation is no longer valid.",
  unavailable:
    "We could not complete your registration just now. Your invitation is still valid, so please try again in a moment.",
  email_unverified:
    "That Google account has no verified email. Verify it with Google, or use the email option.",
  lookup_mismatch: "We could not verify this account. Please contact support.",
  google_failed: "Google sign-in did not complete. Try again.",
  google_cancelled: "Google sign-in was cancelled.",
};

function Join() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const bounced = params.get("error");

  const [state, setState] = useState<Validation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/invites/validate?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d: Validation) => {
        if (cancelled) return;
        setState(d);
      })
      .catch(() => !cancelled && setState({ valid: false, problem: "not_found" }));
    return () => {
      cancelled = true;
    };
  }, [token]);

  /**
   * Accepts the invitation and goes straight into the platform.
   *
   * No second email. The invite arrived at one mailbox and opening it already
   * proves control of that address, which is the same thing a sign-in link
   * proves. Asking for another round trip to establish it twice is where
   * people give up.
   */
  const accept = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.acceptInvite(token);
      // replace, not push: the invite token should not sit in history behind
      // a back button on a shared machine.
      window.location.replace(data.created ? "/welcome" : "/dashboard");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "We could not complete your registration. Try again in a moment."
      );
      setLoading(false);
    }
  };

  if (!state) {
    return (
      <AuthShell>
        <Card className="p-7 sm:p-8">
          <div className="h-64 animate-pulse-soft rounded-btn bg-track" />
        </Card>
      </AuthShell>
    );
  }

  if (!state.valid) {
    const copy = DEAD[state.problem ?? "not_found"] ?? DEAD.not_found;
    return (
      <AuthShell>
        <Card elevated className="p-7 text-center sm:p-8">
          <div className="flex justify-center">
            <IconBadge size="lg" tone="neutral">
              <Hourglass size={22} strokeWidth={1.75} />
            </IconBadge>
          </div>
          <h1 className="mt-5 text-title text-ink">{copy.title}</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">{copy.body}</p>
          <a
            href="/login"
            className={buttonClass({ variant: "secondary", className: "mt-6" })}
          >
            Go to sign in
          </a>
        </Card>
      </AuthShell>
    );
  }

  return (
    <AuthShell footer="By joining you agree to review case material in confidence.">
      <Card elevated className="p-7 sm:p-8">
        <>
            <Pill tone="accent" dot>
              You have been invited
            </Pill>
            <h1 className="mt-4 text-title text-ink">
              Join Senebiclabs
            </h1>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">
              {state.inviter ? (
                <>
                  <span className="font-semibold text-ink">{state.inviter}</span>{" "}
                  invited you to review medical-AI output as a licensed
                  clinician.
                </>
              ) : (
                <>
                  You have been invited to review medical-AI output as a
                  licensed clinician.
                </>
              )}
            </p>

            <div className="mt-5 flex items-center gap-3 rounded-btn border border-hairline-soft bg-canvas-top px-4 py-3">
              <Mail size={17} aria-hidden="true" className="shrink-0 text-accent-ink" />
              <div className="min-w-0">
                <p className="text-[13px] text-subtle">This invitation is for</p>
                <p className="truncate text-[15px] font-semibold text-ink">
                  {state.invited_email}
                </p>
              </div>
            </div>

            {bounced && (
              <Alert tone="danger" role="alert" className="mt-4">
                {GATE_ERRORS[bounced] ?? GATE_ERRORS.google_failed}
              </Alert>
            )}

            {/* Two ways in, and neither sends another email. The invitation
                already proved this address, so the email option is a single
                click rather than a second link to wait for. */}
            <div className="mt-6">
              <GoogleButton
                href={`/api/auth/google?invite=${encodeURIComponent(token)}`}
                label="Continue with Google"
              />
            </div>

            <OrDivider />

            <Button
              variant="secondary"
              onClick={accept}
              loading={loading}
              size="lg"
              className="w-full"
            >
              Continue with email
            </Button>

            {error && (
              <Alert tone="danger" role="alert" className="mt-4">
                {error}
              </Alert>
            )}

            <p className="mt-4 text-center text-[13px] leading-relaxed text-subtle">
              Either way your account is created on this address. Google just
              gives you a password-free way back in next time. Once you are in,
              you will be asked to read and accept the reviewer agreement.
            </p>
          </>
      </Card>
    </AuthShell>
  );
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <AuthShell>
          <Card className="p-7 sm:p-8">
            <div className="h-64 animate-pulse-soft rounded-btn bg-track" />
          </Card>
        </AuthShell>
      }
    >
      <Join />
    </Suspense>
  );
}
