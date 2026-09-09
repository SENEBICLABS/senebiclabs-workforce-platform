"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  AuthShell,
  GoogleButton,
  OrDivider,
} from "@/components/auth/AuthShell";
import { ApiError, api } from "@/lib/api";

/** Reasons the gate or Google can bounce someone back here. */
const ERRORS: Record<string, string> = {
  no_invite:
    "Senebiclabs is invite-only. Ask the colleague who told you about us to send an invite to this address.",
  email_mismatch:
    "That invite was sent to a different address. Sign in with the address it was sent to.",
  invite_used: "That invite has already been used.",
  invite_expired: "That invite has expired. Ask for a new one.",
  inactive:
    "This account is not active. Contact support if you think that is wrong.",
  email_unverified:
    "That Google account has no verified email address. Verify it with Google, or use the email option below.",
  google_cancelled: "Google sign-in was cancelled.",
  google_failed: "Google sign-in did not complete. Try again.",
  google_unavailable:
    "Google sign-in is not available right now. Use the email option below.",
};

function SignIn() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [expiresIn, setExpiresIn] = useState(15);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState("");

  const bounced = params.get("error");
  const notice = bounced ? (ERRORS[bounced] ?? ERRORS.google_failed) : null;
  const blocked = bounced === "no_invite";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await api.requestSignInLink(email);
      setExpiresIn(data.expiresInMinutes);
      setSent(true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "We could not send your sign-in link."
      );
    } finally {
      setLoading(false);
    }
  };

  // Turned away for lack of an invite: explain, and do not offer a form that
  // cannot succeed.
  if (blocked) {
    return (
      <AuthShell footer="Already a member? Sign in with the address your invite was sent to.">
        <Card className="p-6 text-center">
          <div
            aria-hidden="true"
            className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-[20px]"
          >
            ✉︎
          </div>
          <h1 className="text-section text-ink">You need an invite to join</h1>
          <p className="mt-2 text-body text-muted">{ERRORS.no_invite}</p>
          <a
            href="/login"
            className="focusable mt-5 inline-flex h-10 items-center justify-center rounded-btn border border-hairline bg-surface px-4 text-[14px] font-semibold text-ink transition-colors hover:bg-canvas"
          >
            Back to sign in
          </a>
        </Card>
      </AuthShell>
    );
  }

  return (
    <AuthShell footer="Senebiclabs is invite-only. Accounts are created from an invitation.">
      <Card className="p-6">
        {sent ? (
          <>
            <h1 className="text-section text-ink">Check your email</h1>
            <p className="mt-2 text-body text-muted">
              We sent a sign-in link to{" "}
              <span className="font-semibold text-ink">{email}</span>. It works
              once and expires in {expiresIn} minutes.
            </p>
            {devLink && (
              <Button
                className="mt-5 w-full"
                onClick={() => (window.location.href = devLink)}
              >
                Open sign-in link
              </Button>
            )}
            <button
              onClick={() => {
                setSent(false);
                setDevLink("");
              }}
              className="focusable mt-4 w-full rounded-btn text-[13px] font-semibold text-accent underline-offset-2 hover:underline"
            >
              Use a different email
            </button>
          </>
        ) : (
          <>
            <h1 className="text-section text-ink">Sign in</h1>
            <p className="mt-1 text-body text-muted">
              Welcome back. Use whichever you signed up with.
            </p>

            {notice && (
              <div
                role="alert"
                className="mt-4 rounded-card border border-warning bg-warning-soft px-4 py-3"
              >
                <p className="text-[13px] text-ink">{notice}</p>
              </div>
            )}

            <div className="mt-5">
              <GoogleButton href="/api/auth/google" />
            </div>

            <OrDivider />

            <form onSubmit={submit}>
              <label
                htmlFor="email"
                className="mb-1.5 block text-label uppercase text-muted"
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@hospital.org"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={Boolean(error)}
                className={`focusable h-11 w-full rounded-card border bg-surface px-3 text-body text-ink placeholder:text-muted ${
                  error ? "border-danger" : "border-hairline"
                }`}
              />
              {error && (
                <p role="alert" className="mt-2 text-[13px] text-danger">
                  {error}
                </p>
              )}
              <Button type="submit" loading={loading} className="mt-4 h-11 w-full">
                Email me a sign-in link
              </Button>
            </form>
          </>
        )}
      </Card>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <AuthShell>
          <Card className="p-6">
            <div className="h-40 animate-pulse-soft rounded-card bg-hairline" />
          </Card>
        </AuthShell>
      }
    >
      <SignIn />
    </Suspense>
  );
}
