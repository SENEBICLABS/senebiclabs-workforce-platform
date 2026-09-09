"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
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
        <Card className="p-6">
          <div className="h-44 animate-pulse-soft rounded-card bg-hairline" />
        </Card>
      </AuthShell>
    );
  }

  if (!state.valid) {
    const copy = DEAD[state.problem ?? "not_found"] ?? DEAD.not_found;
    return (
      <AuthShell>
        <Card className="p-6 text-center">
          <div
            aria-hidden="true"
            className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-canvas text-[20px]"
          >
            ⌛
          </div>
          <h1 className="text-section text-ink">{copy.title}</h1>
          <p className="mt-2 text-body text-muted">{copy.body}</p>
          <a
            href="/login"
            className="focusable mt-5 inline-flex h-10 items-center justify-center rounded-btn border border-hairline bg-surface px-4 text-[14px] font-semibold text-ink transition-colors hover:bg-canvas"
          >
            Go to sign in
          </a>
        </Card>
      </AuthShell>
    );
  }

  return (
    <AuthShell footer="By joining you agree to review case material in confidence.">
      <Card className="p-6">
        <>
            <p className="text-label uppercase text-muted">
              You have been invited
            </p>
            <h1 className="mt-1.5 text-section text-ink">
              Join Senebiclabs
            </h1>
            <p className="mt-2 text-body text-muted">
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

            <div className="mt-4 rounded-card border border-hairline bg-canvas px-4 py-3">
              <p className="text-label uppercase text-muted">
                This invitation is for
              </p>
              <p className="mt-0.5 text-body font-semibold text-ink">
                {state.invited_email}
              </p>
            </div>

            {bounced && (
              <div
                role="alert"
                className="mt-4 rounded-card border border-danger bg-danger-soft px-4 py-3"
              >
                <p className="text-[13px] text-ink">
                  {GATE_ERRORS[bounced] ?? GATE_ERRORS.google_failed}
                </p>
              </div>
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
              className="h-11 w-full"
            >
              Continue with email
            </Button>

            {error && (
              <p role="alert" className="mt-3 text-[13px] text-danger">
                {error}
              </p>
            )}

            <p className="mt-4 text-center text-[12px] text-muted">
              Either way your account is created on this address. Google just
              gives you a password-free way back in next time.
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
          <Card className="p-6">
            <div className="h-44 animate-pulse-soft rounded-card bg-hairline" />
          </Card>
        </AuthShell>
      }
    >
      <Join />
    </Suspense>
  );
}
