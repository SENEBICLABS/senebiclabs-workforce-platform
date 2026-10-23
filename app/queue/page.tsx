"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/AppLayout";
import { useAppState } from "@/components/AppState";
import { Button } from "@/components/ui/Button";
import { SearchX } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Field";
import { PurposeBadge, StatusPill } from "@/components/ui/Pill";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import {
  api,
  poolIsWorkable,
  poolLine,
  poolStatus,
  type Pool,
  type PoolStatus,
  type Purpose,
} from "@/lib/api";
import { useAsync } from "@/lib/use-async";

type PurposeFilter = Purpose | "all";
type StatusFilter = PoolStatus | "all";
// No "most remaining" or "largest pool": both ranked pools by a total that is
// not work this clinician can claim, and both would put a pool of a thousand
// cases already at their ceiling above one with a contested case waiting.
type SortKey = "available" | "reviewed" | "name";

const SORT_LABEL: Record<SortKey, string> = {
  available: "Most available to me",
  reviewed: "Most reviewed by me",
  name: "Name (A–Z)",
};


const CALIBRATION_ENABLED =
  process.env.NEXT_PUBLIC_CALIBRATION_ENABLED === "true";

function StartButton({ pool, available }: { pool: Pool; available: boolean }) {
  const router = useRouter();
  return (
    <Button
      size="sm"
      variant="secondary"
      className="shrink-0"
      disabled={!available}
      onClick={() => router.push(`/workspace?pool=${pool.id}`)}
    >
      {pool.completed_by_you > 0 ? "Resume reviewing" : "Start reviewing"}
    </Button>
  );
}

export default function QueuePage() {
  const router = useRouter();
  const { available } = useAppState();
  const pools = useAsync(() => api.pools(), []);

  const [purpose, setPurpose] = useState<PurposeFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("name");

  const rows = useMemo(() => {
    const filtered = (pools.data ?? []).filter(
      (p) =>
        (purpose === "all" || p.purpose === purpose) &&
        (status === "all" || poolStatus(p) === status)
    );

    // Closed pools sink whatever the sort, because they are a record of work
    // done rather than work to do.
    return [...filtered].sort((a, b) => {
      if (a.closed !== b.closed) return a.closed ? 1 : -1;
      switch (sort) {
        case "name":
          return a.name.localeCompare(b.name);
        case "reviewed":
          return b.completed_by_you - a.completed_by_you;
        case "available":
          return (b.available_to_you ?? -1) - (a.available_to_you ?? -1);
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
          <Skeleton className="h-10 w-full max-w-md" />
          <Skeleton className="mt-4 h-80 w-full" />
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
          <div className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <label className="sr-only" htmlFor="purpose-filter">
              Filter by purpose
            </label>
            <Select
              id="purpose-filter"
              controlSize="sm"
              wrapperClassName="sm:w-44"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value as PurposeFilter)}
            >
              <option value="all">All purposes</option>
              <option value="evaluate">Evaluate</option>
              <option value="label">Label</option>
              <option value="create">Create</option>
            </Select>

            <label className="sr-only" htmlFor="status-filter">
              Filter by status
            </label>
            <Select
              id="status-filter"
              controlSize="sm"
              wrapperClassName="sm:w-48"
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
            >
              <option value="all">All statuses</option>
              <option value="available">Open to me</option>
              <option value="up_to_date">Up to date</option>
              <option value="none_available">Nothing available</option>
              <option value="closed">Closed</option>
            </Select>

            <label className="sr-only" htmlFor="sort-order">
              Sort by
            </label>
            <Select
              id="sort-order"
              controlSize="sm"
              wrapperClassName="col-span-2 sm:ml-auto sm:w-64"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
            >
              {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
                <option key={key} value={key}>
                  Sort: {SORT_LABEL[key]}
                </option>
              ))}
            </Select>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="No pools match these filters"
              body="Nothing in your queue fits that combination. Clear the filters to see everything open to you."
              action={<Button onClick={clearFilters}>Clear filters</Button>}
            />
          ) : (
            <>
              {/* A table where there is room for one. Below md it becomes a
                  list of rows that stack, with the same facts in the same
                  order, rather than a table to scroll sideways. */}
              <Card className="hidden overflow-hidden md:block">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse text-left">
                    <caption className="sr-only">Pools you are eligible for</caption>
                    <thead>
                      <tr className="border-b border-hairline bg-canvas-top">
                        <th scope="col" className="px-6 py-3 text-label uppercase text-subtle">
                          Pool
                        </th>
                        <th scope="col" className="px-4 py-3 text-label uppercase text-subtle">
                          Purpose
                        </th>
                        <th scope="col" className="px-4 py-3 text-right text-label uppercase text-subtle">
                          Reviewed by me
                        </th>
                        <th scope="col" className="px-4 py-3 text-label uppercase text-subtle">
                          Status
                        </th>
                        <th scope="col" className="px-6 py-3">
                          <span className="sr-only">Action</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((pool) => (
                        <tr
                          key={pool.id}
                          className={`border-b border-hairline-soft transition-colors last:border-b-0 hover:bg-accent-soft/50 ${
                            pool.closed ? "opacity-60" : ""
                          }`}
                        >
                          <th scope="row" className="max-w-[360px] px-6 py-4 font-normal">
                            <span className="block text-[15px] font-semibold text-ink">
                              {pool.name}
                            </span>
                            {pool.description && (
                              <span className="mt-0.5 line-clamp-2 block text-[14px] text-muted">
                                {pool.description}
                              </span>
                            )}
                          </th>
                          <td className="px-4 py-4">
                            <PurposeBadge purpose={pool.purpose} />
                          </td>
                          <td className="tnum px-4 py-4 text-right text-[15px] font-semibold text-ink">
                            {pool.completed_by_you.toLocaleString()}
                          </td>
                          <td className="px-4 py-4">
                            <StatusPill status={poolStatus(pool)} />
                            <span className="tnum mt-1.5 block text-[14px] text-muted">
                              {poolLine(pool)}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {poolIsWorkable(pool) && (
                              <StartButton pool={pool} available={available} />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <ul className="space-y-3 md:hidden" aria-label="Pools you are eligible for">
                {rows.map((pool) => (
                  <li key={pool.id}>
                    <Card className={`p-4 ${pool.closed ? "opacity-60" : ""}`}>
                      <div className="flex items-center justify-between gap-3">
                        <PurposeBadge purpose={pool.purpose} />
                        <StatusPill status={poolStatus(pool)} />
                      </div>
                      <p className="mt-3 text-[16px] font-semibold leading-snug text-ink">
                        {pool.name}
                      </p>
                      {pool.description && (
                        <p className="mt-1 line-clamp-2 text-[14px] text-muted">
                          {pool.description}
                        </p>
                      )}
                      <div className="mt-4 flex items-center justify-between gap-3 border-t border-hairline-soft pt-3">
                        <span className="tnum min-w-0 text-[14px] text-muted">
                          <span className="block truncate text-ink">{poolLine(pool)}</span>
                          {pool.completed_by_you.toLocaleString()} reviewed by me
                        </span>
                        {poolIsWorkable(pool) && (
                          <StartButton pool={pool} available={available} />
                        )}
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            </>
          )}

          {!available && rows.length > 0 && (
            <Alert tone="info" className="mt-4">
              Turn on availability to start reviewing.
            </Alert>
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
