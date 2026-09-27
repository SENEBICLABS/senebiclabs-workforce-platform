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

  return (
    <Card interactive={available} className="relative flex flex-col p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <PurposeBadge purpose={pool.purpose} />
        <StatusPill status={pool.status} />
      </div>

      <h3 className="text-section text-ink">{pool.name}</h3>
      {pool.description && (
        <p className="mt-1.5 text-body text-muted">{pool.description}</p>
      )}

      {/*
        No progress bar, and no denominator. The only total available was the
        pool's task count, and that is not a queue this clinician works
        through: cases at their reviewer ceiling are gone, cases they judged or
        flagged are gone, and a senior may have one contested case waiting
        while the total says ten. Their own count is theirs and is always true.
      */}
      <div className="mt-auto pt-4">
        <div className="flex items-center justify-between gap-3 border-t border-hairline pt-4">
          <span className="tnum whitespace-nowrap text-[15px] text-muted">
            {pool.reviewed_by_me.toLocaleString()} reviewed by you
          </span>
          <Button
            size="sm"
            className="shrink-0"
            disabled={!available}
            onClick={() => router.push(`/workspace?pool=${pool.id}`)}
          >
            {pool.reviewed_by_me > 0 ? "Resume reviewing" : "Start reviewing"}
          </Button>
        </div>
      </div>

      {!available && (
        <div className="absolute inset-0 flex items-center justify-center rounded-card bg-surface/85 px-4 text-center">
          <p className="text-[15px] font-semibold text-muted">
            Turn on availability to start reviewing.
          </p>
        </div>
      )}
    </Card>
  );
}
