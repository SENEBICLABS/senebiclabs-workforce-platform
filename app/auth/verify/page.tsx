"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Link as LinkIcon } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { buttonClass } from "@/components/ui/button-class";
import { Card, IconBadge } from "@/components/ui/Card";
import { ApiError, api } from "@/lib/api";

function Verify() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [verifying, setVerifying] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const verifyToken = async () => {
      const token = searchParams.get("token");

      if (!token) {
        setError("This link is missing its sign-in token.");
        setVerifying(false);
        return;
      }

      try {
        const invite = searchParams.get("invite");
        const { created } = await api.consumeSignInLink(token, invite);
        router.push(created ? "/welcome" : "/dashboard");
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : "This link has expired or has already been used. Request a new one."
        );
        setVerifying(false);
      }
    };

    verifyToken();
  }, [searchParams, router]);

  return (
    <Card elevated className="p-8 text-center">
      {verifying ? (
        <>
          <span
            aria-hidden="true"
            className="mx-auto block h-10 w-10 animate-spin rounded-full border-[3px] border-accent/20 border-t-accent"
          />
          <h1 className="mt-6 text-title text-ink">Signing you in</h1>
          <p className="mt-2 text-[15px] text-muted" role="status">
            One moment while we confirm your email.
          </p>
        </>
      ) : (
        <>
          <div className="flex justify-center">
            <IconBadge size="lg" tone="danger">
              <LinkIcon size={22} strokeWidth={1.75} />
            </IconBadge>
          </div>
          <h1 className="mt-5 text-title text-ink">That link did not work</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">{error}</p>
          <Link href="/" className={buttonClass({ className: "mt-6" })}>
            Request a new link
          </Link>
        </>
      )}
    </Card>
  );
}

export default function VerifyPage() {
  return (
    <AuthShell>
      <Suspense
        fallback={
          <Card className="p-8">
            <div className="mx-auto h-10 w-10 animate-pulse-soft rounded-full bg-track" />
          </Card>
        }
      >
        <Verify />
      </Suspense>
    </AuthShell>
  );
}
