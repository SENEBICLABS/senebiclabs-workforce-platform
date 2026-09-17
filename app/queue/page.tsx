"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/AppLayout";
import { useAppState } from "@/components/AppState";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PurposeBadge, StatusPill } from "@/components/ui/Pill";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { api, type PoolStatus, type Purpose } from "@/lib/api";
import { useAsync } from "@/lib/use-async";

type PurposeFilter = Purpose | "all";
type StatusFilter = PoolStatus | "all";
type SortKey = "remaining" | "reviewed" | "items" | "name";

const SORT_LABEL: Record<SortKey, string> = {
  remaining: "Most remaining",
  reviewed: "Most reviewed by me",
  items: "Largest pool",
  name: "Name (A–Z)",
};

const SELECT =
  "focusable h-9 rounded-btn border border-hairline bg-surface px-3 text-[15px] text-ink transition-colors hover:bg-accent-soft";

const CALIBRATION_ENABLED =
  process.env.NEXT_PUBLIC_CALIBRATION_ENABLED === "true";

export default function QueuePage() {
  const router = useRouter();
  const { available } = useAppState();
  const pools = useAsync(() => api.pools(), []);

  const [purpose, setPurpose] = useState<PurposeFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("remaining");

  const rows = useMemo(() => {
    const filtered = (pools.data ?? []).filter(
      (p) =>
        (purpose === "all" || p.purpose === purpose) &&
        (status === "all" || p.status === status)
    );

    const remaining = (p: (typeof filtered)[number]) =>
      p.items === null ? -1 : p.items - p.reviewed_by_me;

    return [...filtered].sort((a, b) => {
      switch (sort) {
        case "name":
          return a.name.localeCompare(b.name);
        case "items":
          return (b.items ?? 0) - (a.items ?? 0);
        case "reviewed":
          return b.reviewed_by_me - a.reviewed_by_me;
        case "remaining":
          return remaining(b) - remaining(a);
      }
    });
  }, [pools.data, purpose, status, sort]);

  const total = pools.data?.length ?? 0;
  const filtersActive = purpose !== "all" || status !== "all";
  const clearFilters = () => {
    setPurpose("all");
    setStatus("all");
  };

  return (
    <AppLayout title="Review queue">
      {pools.loading && (
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading your pools</span>
          <Skeleton className="h-11 w-full max-w-md" />
          <Skeleton className="mt-4 h-72 w-full" />
        </div>
      )}

      {!pools.loading && pools.error && (
        <ErrorState message={pools.error} onRetry={pools.reload} />
      )}

      {!pools.loading && !pools.error && total === 0 && (
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

      {!pools.loading && !pools.error && total > 0 && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="purpose-filter">
              Filter by purpose
            </label>
            <select
              id="purpose-filter"
              className={SELECT}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value as PurposeFilter)}
            >
              <option value="all">All purposes</option>
              <option value="evaluate">Evaluate</option>
              <option value="label">Label</option>
              <option value="create">Create</option>
            </select>

            <label className="sr-only" htmlFor="status-filter">
              Filter by status
            </label>
            <select
              id="status-filter"
              className={SELECT}
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
            >
              <option value="all">All statuses</option>
              <option value="not_started">Not started</option>
              <option value="in_progress">In progress</option>
              <option value="complete">Complete</option>
            </select>

            <label className="sr-only" htmlFor="sort-order">
              Sort by
            </label>
            <select
              id="sort-order"
              className={`${SELECT} ml-auto`}
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
            >
              {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
                <option key={key} value={key}>
                  Sort: {SORT_LABEL[key]}
                </option>
              ))}
            </select>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              title="No pools match these filters"
              body="Nothing in your queue fits that combination. Clear the filters to see everything open to you."
              action={<Button onClick={clearFilters}>Clear filters</Button>}
            />
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left">
                  <caption className="sr-only">Pools you are eligible for</caption>
                  <thead>
                    <tr className="border-b border-hairline bg-canvas">
                      <th scope="col" className="px-5 py-3 text-label uppercase text-muted">
                        Pool
                      </th>
                      <th scope="col" className="px-4 py-3 text-label uppercase text-muted">
                        Purpose
                      </th>
                      <th scope="col" className="px-4 py-3 text-right text-label uppercase text-muted">
                        Items
                      </th>
                      <th scope="col" className="px-4 py-3 text-right text-label uppercase text-muted">
                        Reviewed by me
                      </th>
                      <th scope="col" className="px-4 py-3 text-label uppercase text-muted">
                        Status
                      </th>
                      <th scope="col" className="px-5 py-3">
                        <span className="sr-only">Action</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((pool) => {
                      const complete = pool.status === "complete";
                      return (
                        <tr
                          key={pool.id}
                          className="border-b border-hairline transition-colors last:border-b-0 hover:bg-accent-soft"
                        >
                          <th scope="row" className="max-w-[320px] px-5 py-4 font-normal">
                            <span className="block text-body font-semibold text-ink">
                              {pool.name}
                            </span>
                            {pool.description && (
                              <span className="mt-0.5 block text-[14px] text-muted">
                                {pool.description}
                              </span>
                            )}
                          </th>
                          <td className="px-4 py-4">
                            <PurposeBadge purpose={pool.purpose} />
                          </td>
                          <td className="tnum px-4 py-4 text-right text-body text-ink">
                            {pool.items === null ? "—" : pool.items.toLocaleString()}
                          </td>
                          <td className="tnum px-4 py-4 text-right text-body text-ink">
                            {pool.reviewed_by_me.toLocaleString()}
                          </td>
                          <td className="px-4 py-4">
                            <StatusPill status={pool.status} />
                          </td>
                          <td className="px-5 py-4 text-right">
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={!available || complete}
                              onClick={() =>
                                router.push(`/workspace?pool=${pool.id}`)
                              }
                            >
                              {complete
                                ? "Fully reviewed"
                                : pool.reviewed_by_me > 0
                                  ? "Resume reviewing"
                                  : "Start reviewing"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {!available && rows.length > 0 && (
            <p className="mt-4 text-[15px] text-muted">
              Turn on availability to start reviewing.
            </p>
          )}

          {filtersActive && rows.length > 0 && (
            <p className="tnum mt-4 text-[15px] text-muted">
              Showing {rows.length} of {total} pools.{" "}
              <button
                onClick={clearFilters}
                className="focusable rounded-btn font-semibold text-accent underline-offset-2 hover:underline"
              >
                Clear filters
              </button>
            </p>
          )}
        </>
      )}
    </AppLayout>
  );
}
