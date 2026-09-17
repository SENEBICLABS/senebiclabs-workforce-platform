"use client";

import { useRouter } from "next/navigation";
import { Card } from "./ui/Card";
import { Button } from "./ui/Button";
import { PurposeBadge, StatusPill } from "./ui/Pill";
import { useAppState } from "./AppState";
import type { Pool } from "@/lib/api";

export function PoolCard({ pool }: { pool: Pool }) {
  const router = useRouter();
  const { available } = useAppState();

  const complete = pool.status === "complete";
  const started = pool.reviewed_by_me > 0;
  const progress =
    pool.items && pool.items > 0
      ? Math.min((pool.reviewed_by_me / pool.items) * 100, 100)
      : null;

  return (
    <Card interactive={available && !complete} className="relative flex flex-col p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <PurposeBadge purpose={pool.purpose} />
        <StatusPill status={pool.status} />
      </div>

      <h3 className="text-section text-ink">{pool.name}</h3>
      {pool.description && (
        <p className="mt-1.5 text-body text-muted">{pool.description}</p>
      )}

      <div className="mt-auto pt-4">
        {progress !== null && started && (
          <div
            className="mb-3 h-1 w-full overflow-hidden rounded-full bg-hairline"
            role="progressbar"
            aria-valuenow={pool.reviewed_by_me}
            aria-valuemin={0}
            aria-valuemax={pool.items ?? undefined}
            aria-label={`${pool.reviewed_by_me} of ${pool.items} reviewed`}
          >
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-hairline pt-4">
          <span className="tnum text-[15px] text-muted">
            {pool.reviewed_by_me.toLocaleString()} reviewed
            {pool.items !== null && ` of ${pool.items.toLocaleString()}`}
          </span>
          <Button
            size="sm"
            disabled={!available || complete}
            onClick={() => router.push(`/workspace?pool=${pool.id}`)}
          >
            {complete
              ? "Fully reviewed"
              : started
                ? "Resume reviewing"
                : "Start reviewing"}
          </Button>
        </div>
      </div>

      {!available && !complete && (
        <div className="absolute inset-0 flex items-center justify-center rounded-card bg-surface/85 px-4 text-center">
          <p className="text-[15px] font-semibold text-muted">
            Turn on availability to start reviewing.
          </p>
        </div>
      )}
    </Card>
  );
}
