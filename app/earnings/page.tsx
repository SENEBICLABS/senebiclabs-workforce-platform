"use client";

import {
  CheckCheck,
  Flag,
  Gavel,
  Info,
  NotebookText,
  PenLine,
  Scale,
  type LucideIcon,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Card, IconBadge, SectionHeading } from "@/components/ui/Card";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { api, type PassKind, type WorkRecord } from "@/lib/api";
import { useAsync } from "@/lib/use-async";

/**
 * The work record.
 *
 * Deliberately not an earnings page. There is no rate in this platform and no
 * ledger behind it, so showing a figure would mean inventing one. What it shows
 * instead is the thing that cannot be reconstructed later: every pass this
 * clinician made, what kind it was, which pool it was in and when it happened,
 * while it is recent enough for them to say if it is wrong.
 */

const KIND_LABEL: Record<PassKind, string> = {
  judgement: "Cases judged",
  flag: "Cases flagged",
  authoring: "Answers written",
  review: "Drafts reviewed",
  adjudication: "Cases decided",
};

const KIND_NOTE: Record<PassKind, string> = {
  judgement: "You read the case and assessed the answer it was given.",
  flag: "You read the case and said you could not judge it. That is a pass, and it is recorded as one.",
  authoring: "You wrote the answer a clinician should receive.",
  review: "You read a draft answer and approved, edited or sent it back.",
  adjudication:
    "You read the case and decided it. Your answer is the one recorded.",
};

const ORDER: PassKind[] = ["judgement", "flag", "authoring", "review", "adjudication"];

/** "1 case judged", "3 cases judged" — the per-pool line reads as a sentence. */
const COUNTED: Record<PassKind, [string, string]> = {
  judgement: ["case judged", "cases judged"],
  flag: ["case flagged", "cases flagged"],
  authoring: ["answer written", "answers written"],
  review: ["draft reviewed", "drafts reviewed"],
  adjudication: ["case decided", "cases decided"],
};

const counted = (kind: PassKind, n: number) =>
  `${n} ${COUNTED[kind][n === 1 ? 0 : 1]}`;

const when = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const KIND_ICON: Record<PassKind, LucideIcon> = {
  judgement: Scale,
  flag: Flag,
  authoring: PenLine,
  review: CheckCheck,
  adjudication: Gavel,
};

function Tally({ record }: { record: WorkRecord }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {ORDER.filter((k) => record.by_kind[k] > 0).map((kind) => {
        const Icon = KIND_ICON[kind];
        return (
          <Card key={kind} className="flex flex-col p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[14px] font-semibold text-strong">{KIND_LABEL[kind]}</p>
              <IconBadge>
                <Icon size={16} />
              </IconBadge>
            </div>
            <p className="tnum mt-2 text-[32px] font-bold leading-none tracking-[-0.03em] text-ink">
              {record.by_kind[kind].toLocaleString()}
            </p>
            <p className="mt-3 text-[14px] leading-relaxed text-muted">
              {KIND_NOTE[kind]}
            </p>
          </Card>
        );
      })}
    </div>
  );
}

function ByPool({ record }: { record: WorkRecord }) {
  // Bars are drawn against the busiest pool, so the longest is full width.
  // They compare pools with each other and claim nothing about a total.
  const most = Math.max(1, ...record.by_pool.map((p) => p.total));
  return (
    <Card className="overflow-hidden">
      {record.by_pool.map((pool) => (
        <div key={pool.pool_id} className="border-b border-hairline-soft px-5 py-4 last:border-b-0 sm:px-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="text-[15px] font-semibold text-ink">{pool.pool}</span>
            <span className="tnum text-[15px] font-semibold text-ink">
              {pool.total.toLocaleString()}{" "}
              <span className="font-normal text-subtle">
                {pool.total === 1 ? "pass" : "passes"}
              </span>
            </span>
          </div>
          <div aria-hidden="true" className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-track">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${(pool.total / most) * 100}%` }}
            />
          </div>
          <p className="mt-2 text-[14px] text-muted">
            {ORDER.filter((k) => pool.kinds[k] > 0)
              .map((k) => counted(k, pool.kinds[k]))
              .join(" · ")}
          </p>
        </div>
      ))}
    </Card>
  );
}

function Recent({ record }: { record: WorkRecord }) {
  return (
    <Card className="overflow-hidden">
      <ul>
        {record.recent.map((pass) => {
          const Icon = KIND_ICON[pass.kind];
          return (
            <li
              key={pass.id}
              className="flex items-center gap-3 border-b border-hairline-soft px-5 py-3.5 last:border-b-0 sm:px-6"
            >
              <Icon size={16} aria-hidden="true" className="shrink-0 text-accent-ink" />
              <div className="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-4">
                <span className="block shrink-0 text-[15px] text-ink sm:w-44">
                  {KIND_LABEL[pass.kind]}
                </span>
                <span className="block truncate text-[14px] text-muted">{pass.pool}</span>
              </div>
              <span className="tnum shrink-0 text-[14px] text-subtle">{when(pass.at)}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function WorkRecordBody() {
  const record = useAsync(() => api.passes(), []);

  if (record.loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-32" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (record.error || !record.data) {
    return (
      <ErrorState
        message={record.error ?? "We could not load your work record."}
        onRetry={record.reload}
      />
    );
  }

  const data = record.data;

  if (data.total === 0) {
    return (
      <EmptyState
        icon={NotebookText}
        title="No passes recorded yet"
        body="Every case you judge, flag, write or review is recorded here, with the date it happened."
      />
    );
  }

  return (
    <div className="space-y-10">
      <Card className="flex flex-col gap-5 bg-linear-to-br from-accent-soft/70 via-surface to-surface p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="shrink-0 sm:w-48">
          <p className="text-[14px] font-medium text-muted">Passes recorded</p>
          <p className="tnum mt-1 text-[44px] font-bold leading-none tracking-[-0.04em] text-ink">
            {data.total.toLocaleString()}
          </p>
        </div>
        <div className="flex gap-3 border-t border-hairline-soft pt-5 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
          <Info size={17} aria-hidden="true" className="mt-0.5 shrink-0 text-accent-ink" />
          <p className="text-[15px] leading-relaxed text-muted">
            This is the record of your work: every pass you have made, by kind, pool
            and date. Payment is arranged with you directly, on the terms agreed in
            writing. The platform holds no rates or amounts, so this page shows no
            balance, and it does not yet show the outcome of each review.
          </p>
        </div>
      </Card>

      <Tally record={data} />

      <div>
        <SectionHeading>By pool</SectionHeading>
        <ByPool record={data} />
      </div>

      <div>
        <SectionHeading>
          {data.recent.length < data.total
            ? `Most recent ${data.recent.length.toLocaleString()}`
            : "Every pass"}
        </SectionHeading>
        <Recent record={data} />
        {data.recent.length < data.total && (
          <p className="mt-3 text-[14px] text-subtle">
            Showing the most recent {data.recent_limit.toLocaleString()}. Ask us
            if you need the full record.
          </p>
        )}
      </div>
    </div>
  );
}

export default function WorkRecordPage() {
  return (
    <AppLayout title="Work record">
      <WorkRecordBody />
    </AppLayout>
  );
}
