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
import { api, poolLine, poolStatus } from "@/lib/api";
import { useAsync } from "@/lib/use-async";

function StatTile({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  /** One line saying what the number is, where the label alone could mislead. */
  note?: string;
}) {
  return (
    <Card className="p-5">
      <p className="text-label uppercase text-muted">{label}</p>
      <p className="tnum mt-2 text-[28px] font-bold leading-none text-ink">
        {value}
      </p>
      {note && <p className="mt-2 text-[14px] leading-snug text-muted">{note}</p>}
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

  // Somewhere to pick up, which means a pool with work in it and a history of
  // their own. A pool they have worked through is not somewhere to continue,
  // and offering it here was the same lie the card told: a button that led
  // only to "you're all caught up".
  const resume = pools.data?.find(
    (p) => poolStatus(p) === "available" && p.completed_by_you > 0
  );

  return (
    <AppLayout title="Dashboard">
      {/*
        Stats. Only figures with a real source are rendered.

        Flags are shown, and shown apart. A flag is recorded work, so a
        clinician who flags honestly should see it rather than wonder where it
        went; but a flag is not a review, and adding it to the reviewed figure
        would overstate how many cases they judged.
      */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.loading ? (
          <>
            <Skeleton className="h-[104px]" />
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
            <StatTile
              label="Flagged in total"
              value={stats.data.flagged_total.toLocaleString()}
              note={
                stats.data.flagged_total > 0
                  ? "Cases you could not judge. Recorded as work on your work record."
                  : "If you cannot judge a case, flag it rather than guess."
              }
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
                  {poolLine(resume)} · you have reviewed{" "}
                  {resume.completed_by_you.toLocaleString()}{" "}
                  {resume.completed_by_you === 1 ? "case" : "cases"} here
                </p>
              </div>
              <Button
                onClick={() => router.push(`/workspace?pool=${resume.id}`)}
              >
                Resume reviewing
              </Button>
            </div>

            {/*
              No progress bar. A bar needs a total to fill, and the only total
              available was the pool's task count, which is not a thing this
              clinician can work through: other clinicians take cases from the
              same pool. A bar drawn against it showed them falling behind a
              finish line that was never theirs.
            */}
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
