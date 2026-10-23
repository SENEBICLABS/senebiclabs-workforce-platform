"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  CheckCheck,
  Flag,
  PlayCircle,
  Timer,
  type LucideIcon,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { PoolCard } from "@/components/PoolCard";
import { useAppState } from "@/components/AppState";
import { Button } from "@/components/ui/Button";
import { Card, IconBadge, SectionHeading } from "@/components/ui/Card";
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
  icon: Icon,
}: {
  label: string;
  value: string;
  /** One line saying what the number is, where the label alone could mislead. */
  note?: string;
  icon: LucideIcon;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[14px] font-medium text-muted">{label}</p>
        <Icon size={17} aria-hidden="true" className="shrink-0 text-accent-ink" />
      </div>
      <p className="tnum mt-3 text-[32px] font-bold leading-none tracking-[-0.03em] text-ink">
        {value}
      </p>
      {note && <p className="mt-3 text-[13px] leading-snug text-subtle">{note}</p>}
    </Card>
  );
}

const CALIBRATION_ENABLED =
  process.env.NEXT_PUBLIC_CALIBRATION_ENABLED === "true";

export default function DashboardPage() {
  const router = useRouter();
  const { me, reviewedThisSession } = useAppState();

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
      <div className="mb-6 sm:mb-8">
        <h2 className="text-[26px] font-bold leading-tight tracking-[-0.03em] text-ink sm:text-[30px]">
          {me?.name ? `Welcome back, ${me.name}` : "Welcome back"}
        </h2>
        <p className="mt-1.5 text-body text-muted">
          Your pools and your recent work, in one place.
        </p>
      </div>

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
            <Skeleton className="h-[120px]" />
            <Skeleton className="h-[120px]" />
            <Skeleton className="h-[120px]" />
            <Skeleton className="h-[120px]" />
          </>
        ) : stats.data ? (
          <>
            <StatTile
              label="Reviewed this session"
              icon={Timer}
              value={reviewedThisSession.toLocaleString()}
            />
            <StatTile
              label="Reviewed this week"
              icon={CalendarDays}
              value={stats.data.reviewed_this_week.toLocaleString()}
            />
            <StatTile
              label="Reviewed in total"
              icon={CheckCheck}
              value={stats.data.reviewed_total.toLocaleString()}
            />
            <StatTile
              label="Flagged in total"
              icon={Flag}
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
        <div className="mt-10">
          <SectionHeading>Continue where you left off</SectionHeading>
          <Card className="relative overflow-hidden bg-linear-to-br from-accent-soft via-surface to-surface p-5 ring-1 ring-inset ring-accent/30 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 items-start gap-4">
                <IconBadge>
                  <PlayCircle size={18} />
                </IconBadge>
                <div className="min-w-0">
                  <h3 className="text-[18px] font-bold leading-snug tracking-[-0.015em] text-ink">
                    {resume.name}
                  </h3>
                  <p className="tnum mt-1 text-[15px] text-muted">
                    {poolLine(resume)} · you have reviewed{" "}
                    {resume.completed_by_you.toLocaleString()}{" "}
                    {resume.completed_by_you === 1 ? "case" : "cases"} here
                  </p>
                </div>
              </div>
              <Button
                className="group"
                onClick={() => router.push(`/workspace?pool=${resume.id}`)}
              >
                Resume reviewing
                <ArrowRight
                  size={16}
                  aria-hidden="true"
                  className="transition-transform duration-150 group-hover:translate-x-0.5"
                />
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
      <div className="mt-10">
        <SectionHeading
          description="Every pool open to you, and what is waiting in each."
          action={
            (pools.data?.length ?? 0) > 0 ? (
              <Link
                href="/queue"
                className="focusable rounded-btn text-[14px] font-semibold text-accent-ink underline-offset-4 hover:underline"
              >
                Open review queue
              </Link>
            ) : undefined
          }
        >
          Your pools
        </SectionHeading>

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
