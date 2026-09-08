"use client";

import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/AppLayout";
import { PoolCard } from "@/components/PoolCard";
import { useAppState } from "@/components/AppState";
import { Button } from "@/components/ui/Button";
import { Card, SectionHeading } from "@/components/ui/Card";
import {
  EmptyState,
  ErrorState,
  LoadingBlock,
  Skeleton,
} from "@/components/ui/States";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/use-async";

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5">
      <p className="text-label uppercase text-muted">{label}</p>
      <p className="tnum mt-2 text-[28px] font-bold leading-none text-ink">
        {value}
      </p>
    </Card>
  );
}

const CALIBRATION_ENABLED =
  process.env.NEXT_PUBLIC_CALIBRATION_ENABLED === "true";

export default function DashboardPage() {
  const router = useRouter();
  const { reviewedThisSession } = useAppState();

  const pools = useAsync(() => api.pools(), []);
  const stats = useAsync(() => api.stats(), []);

  const resume = pools.data?.find((p) => p.status === "in_progress");

  return (
    <AppLayout title="Dashboard">
      {/* Stats. Only figures with a real source are rendered. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.loading ? (
          <>
            <Skeleton className="h-[104px]" />
            <Skeleton className="h-[104px]" />
            <Skeleton className="h-[104px]" />
          </>
        ) : stats.data ? (
          <>
            <StatTile
              label="Reviewed this session"
              value={reviewedThisSession.toLocaleString()}
            />
            <StatTile
              label="Reviewed this week"
              value={stats.data.reviewed_this_week.toLocaleString()}
            />
            <StatTile
              label="Reviewed in total"
              value={stats.data.reviewed_total.toLocaleString()}
            />
          </>
        ) : null}
      </div>

      {/* Continue where you left off */}
      {resume && (
        <div className="mt-8">
          <SectionHeading>Continue where you left off</SectionHeading>
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-section text-ink">{resume.name}</h3>
                <p className="tnum mt-1 text-body text-muted">
                  {resume.reviewed_by_me.toLocaleString()} reviewed
                  {resume.items !== null &&
                    ` of ${resume.items.toLocaleString()}`}
                </p>
              </div>
              <Button
                onClick={() => router.push(`/workspace?pool=${resume.id}`)}
              >
                Resume reviewing
              </Button>
            </div>

            {resume.items !== null && resume.items > 0 && (
              <div
                className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-hairline"
                role="progressbar"
                aria-valuenow={resume.reviewed_by_me}
                aria-valuemin={0}
                aria-valuemax={resume.items}
                aria-label={`${resume.reviewed_by_me} of ${resume.items} reviewed`}
              >
                <div
                  className="h-full rounded-full bg-accent"
                  style={{
                    width: `${Math.min((resume.reviewed_by_me / resume.items) * 100, 100)}%`,
                  }}
                />
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Pools */}
      <div className="mt-8">
        <SectionHeading>Your pools</SectionHeading>

        {pools.loading && <LoadingBlock label="Loading your pools" />}

        {!pools.loading && pools.error && (
          <ErrorState message={pools.error} onRetry={pools.reload} />
        )}

        {!pools.loading && !pools.error && pools.data?.length === 0 && (
          <EmptyState
            title="No pools yet"
            body={CALIBRATION_ENABLED
              ? "You become eligible for a pool by passing its calibration. Anything open to you will be listed there."
              : "No review pools are open to you yet. They appear here as soon as one is assigned — nothing else is needed from you."}
            action={
              CALIBRATION_ENABLED ? (
                <Button onClick={() => router.push("/calibration")}>
                  Go to calibration
                </Button>
              ) : undefined
            }
          />
        )}

        {!pools.loading && !pools.error && (pools.data?.length ?? 0) > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pools.data!.map((pool) => (
              <PoolCard key={pool.id} pool={pool} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
