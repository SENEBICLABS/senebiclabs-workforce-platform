"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
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
        const { created } = await api.verifyMagicLink(token, invite);
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
    <Card className="p-8 text-center">
      {verifying ? (
        <>
          <span
            aria-hidden="true"
            className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent"
          />
          <h1 className="mt-5 text-section text-ink">Signing you in</h1>
          <p className="mt-1 text-body text-muted" role="status">
            One moment while we confirm your email.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-section text-ink">That link did not work</h1>
          <p className="mt-2 text-body text-muted">{error}</p>
          <Link
            href="/"
            className="focusable mt-5 inline-flex h-9 items-center justify-center rounded-btn bg-accent px-4 text-[14px] font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            Request a new link
          </Link>
        </>
      )}
    </Card>
  );
}

export default function VerifyPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-5 py-12">
      <div className="w-full max-w-[420px]">
        <Suspense
          fallback={
            <Card className="p-8">
              <div className="mx-auto h-8 w-8 animate-pulse-soft rounded-full bg-hairline" />
            </Card>
          }
        >
          <Verify />
        </Suspense>
      </div>
    </div>
  );
}
