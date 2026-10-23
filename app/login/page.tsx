"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MailCheck, MailX } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { buttonClass } from "@/components/ui/button-class";
import { Card, IconBadge } from "@/components/ui/Card";
import { FieldError, Input, Label } from "@/components/ui/Field";
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
  unavailable:
    "We could not complete your sign-in just now. Please try again in a moment.",
  lookup_mismatch: "We could not verify this account. Please contact support.",
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
        <Card elevated className="p-7 text-center sm:p-8">
          <div className="flex justify-center">
            <IconBadge size="lg">
              <MailX size={22} strokeWidth={1.75} />
            </IconBadge>
          </div>
          <h1 className="mt-5 text-title text-ink">You need an invite to join</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">{ERRORS.no_invite}</p>
          <a
            href="/login"
            className={buttonClass({ variant: "secondary", className: "mt-6" })}
          >
            Back to sign in
          </a>
        </Card>
      </AuthShell>
    );
  }

  return (
    <AuthShell footer="Senebiclabs is invite-only. Accounts are created from an invitation.">
      <Card elevated className="p-7 sm:p-8">
        {sent ? (
          <div className="text-center">
            <div className="flex justify-center">
              <IconBadge size="lg">
                <MailCheck size={22} strokeWidth={1.75} />
              </IconBadge>
            </div>
            <h1 className="mt-5 text-title text-ink">Check your email</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">
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
              className="focusable mt-4 w-full rounded-btn text-[15px] font-semibold text-accent underline-offset-2 hover:underline"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <>
            <h1 className="text-title text-ink">Sign in</h1>
            <p className="mt-1.5 text-[15px] text-muted">
              Welcome back. Use whichever you joined with.
            </p>

            {notice && (
              <Alert tone="warning" role="alert" className="mt-5">
                {notice}
              </Alert>
            )}

            <div className="mt-6">
              <GoogleButton href="/api/auth/google" />
            </div>

            <OrDivider />

            <form onSubmit={submit}>
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@hospital.org"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                invalid={Boolean(error)}
              />
              {error && <FieldError>{error}</FieldError>}
              {/* This one genuinely does send mail, unlike the invitation page
                  where the link in hand already proved the address. The label
                  says so rather than borrowing "Continue with email" and
                  leaving someone waiting on a screen that will not move. */}
              <Button
                type="submit"
                variant="secondary"
                loading={loading}
                size="lg"
                className="mt-4 w-full"
              >
                Send me a sign-in link
              </Button>
              <p className="mt-3 text-center text-[13px] leading-relaxed text-subtle">
                We will email a link that signs you in. No password to
                remember, and nothing to set up.
              </p>
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
          <Card className="p-7 sm:p-8">
            <div className="h-64 animate-pulse-soft rounded-btn bg-surface-raised" />
          </Card>
        </AuthShell>
      }
    >
      <SignIn />
    </Suspense>
  );
}
