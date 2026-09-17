"use client";

import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/Button";
import { Card, SectionHeading } from "@/components/ui/Card";
import { Pill, PurposeBadge } from "@/components/ui/Pill";
import {
  EmptyState,
  ErrorState,
  LoadingBlock,
} from "@/components/ui/States";
import { api, type CalibrationPool } from "@/lib/api";
import { useAsync } from "@/lib/use-async";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function CalibrationCard({ pool }: { pool: CalibrationPool }) {
  const router = useRouter();
  const passed = pool.status === "passed";

  return (
    <Card className="flex flex-col p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <PurposeBadge purpose={pool.purpose} />
        {passed && (
          <Pill tone="success">
            <CheckCircle2 size={12} aria-hidden="true" />
            Eligible
          </Pill>
        )}
      </div>

      <h3 className="text-section text-ink">{pool.name}</h3>
      {pool.description && (
        <p className="mt-1.5 flex-1 text-body text-muted">{pool.description}</p>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-hairline pt-4">
        {passed ? (
          <>
            <span className="text-[15px] text-muted">
              {pool.passed_at ? `Passed ${formatDate(pool.passed_at)}` : "Passed"}
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => router.push(`/workspace?pool=${pool.id}`)}
            >
              Start reviewing
            </Button>
          </>
        ) : (
          <>
            <span className="tnum text-[15px] text-muted">
              {pool.item_count} {pool.item_count === 1 ? "item" : "items"}
              {pool.attempts > 0 &&
                ` · ${pool.attempts} ${pool.attempts === 1 ? "attempt" : "attempts"}`}
            </span>
            <Button
              size="sm"
              onClick={() => router.push(`/calibration/${pool.id}`)}
            >
              {pool.attempts > 0 ? "Try again" : "Start calibration"}
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}

const CALIBRATION_ENABLED =
  process.env.NEXT_PUBLIC_CALIBRATION_ENABLED === "true";

export default function CalibrationPage() {
  // Access comes with the invitation while this is off; the page would only
  // offer assessments that unlock nothing.
  if (!CALIBRATION_ENABLED) {
    return (
      <AppLayout title="Calibration">
        <EmptyState
          title="Calibration is not required"
          body="Your invitation already gives you access to the pools open to you. Head to your dashboard to start reviewing."
          action={<Button onClick={() => (window.location.href = "/dashboard")}>Go to dashboard</Button>}
        />
      </AppLayout>
    );
  }

  const calibrations = useAsync(() => api.calibrations(), []);

  const passed = (calibrations.data ?? []).filter((p) => p.status === "passed");
  const open = (calibrations.data ?? []).filter((p) => p.status !== "passed");

  return (
    <AppLayout title="Calibration">
      <Card className="mb-6 p-5">
        <h2 className="text-section text-ink">How calibration works</h2>
        <p className="mt-1.5 max-w-2xl text-body text-muted">
          Each calibration is a short set of cases with known answers, written by
          the clinical leads for that pool. Pass it and you are eligible to
          review that pool — there is nothing else to unlock.
        </p>
      </Card>

      {calibrations.loading && <LoadingBlock label="Loading calibrations" />}

      {!calibrations.loading && calibrations.error && (
        <ErrorState
          message={calibrations.error}
          onRetry={calibrations.reload}
        />
      )}

      {!calibrations.loading && !calibrations.error && (
        <>
          <SectionHeading>Calibrations you can take</SectionHeading>
          {open.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {open.map((pool) => (
                <CalibrationCard key={pool.id} pool={pool} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Nothing waiting for you"
              body="There is no calibration open to you right now. New pools appear here as they open."
            />
          )}

          {passed.length > 0 && (
            <div className="mt-8">
              <SectionHeading>Pools you are eligible for</SectionHeading>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {passed.map((pool) => (
                  <CalibrationCard key={pool.id} pool={pool} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </AppLayout>
  );
}
