"use client";

import { AppLayout } from "@/components/AppLayout";
import { Card, SectionHeading } from "@/components/ui/Card";
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
  review: "Colleagues' work reviewed",
};

const KIND_NOTE: Record<PassKind, string> = {
  judgement: "You read the case and assessed the answer it was given.",
  flag: "You read the case and said you could not judge it. That is a pass, and it is recorded as one.",
  authoring: "You wrote the answer a clinician should receive.",
  review: "You read a colleague's draft and approved, edited or sent it back.",
};

const ORDER: PassKind[] = ["judgement", "flag", "authoring", "review"];

const when = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

function Tally({ record }: { record: WorkRecord }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {ORDER.filter((k) => record.by_kind[k] > 0).map((kind) => (
        <Card key={kind} className="p-5">
          <p className="tnum text-title text-ink">{record.by_kind[kind].toLocaleString()}</p>
          <p className="mt-1 text-body font-semibold text-ink">{KIND_LABEL[kind]}</p>
          <p className="mt-1.5 text-[15px] leading-relaxed text-muted">
            {KIND_NOTE[kind]}
          </p>
        </Card>
      ))}
    </div>
  );
}

function ByPool({ record }: { record: WorkRecord }) {
  return (
    <Card className="overflow-hidden">
      {record.by_pool.map((pool) => (
        <div key={pool.pool_id} className="border-b border-hairline px-5 py-4 last:border-b-0">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="text-body font-semibold text-ink">{pool.pool}</span>
            <span className="tnum text-body text-ink">
              {pool.total.toLocaleString()} {pool.total === 1 ? "pass" : "passes"}
            </span>
          </div>
          <p className="mt-1 text-[15px] text-muted">
            {ORDER.filter((k) => pool.kinds[k] > 0)
              .map((k) => `${pool.kinds[k]} ${KIND_LABEL[k].toLowerCase()}`)
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
      {record.recent.map((pass) => (
        <div
          key={pass.id}
          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-hairline px-5 py-3.5 last:border-b-0"
        >
          <span className="text-body text-ink">{KIND_LABEL[pass.kind]}</span>
          <span className="min-w-0 flex-1 truncate text-[15px] text-muted">
            {pass.pool}
          </span>
          <span className="tnum text-[15px] text-muted">{when(pass.at)}</span>
        </div>
      ))}
    </Card>
  );
}

function WorkRecordBody() {
  const record = useAsync(() => api.passes(), []);

  if (record.loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-28" />
        <Skeleton className="h-40" />
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
        title="No passes recorded yet"
        body="Every case you judge, flag, write or review is recorded here, with the date it happened."
      />
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-body text-ink">
          {data.total.toLocaleString()} {data.total === 1 ? "pass" : "passes"}{" "}
          recorded.
        </p>
        <p className="mt-1.5 text-body text-muted">
          During the pilot, payment is arranged with you directly, outside the
          platform. This page is the record of the work, not a statement of what
          you are owed, and it shows no amounts because the platform holds none.
        </p>
      </div>

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
          <p className="mt-2 text-[15px] text-muted">
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
