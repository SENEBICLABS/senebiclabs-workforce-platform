"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, PauseCircle } from "lucide-react";
import { Card } from "./ui/Card";
import { Button } from "./ui/Button";
import { PurposeBadge, StatusPill } from "./ui/Pill";
import { useAppState } from "./AppState";
import { poolIsWorkable, poolLine, poolStatus, type Pool } from "@/lib/api";

/**
 * A pool, as one clinician sees it.
 *
 * Every word on this card comes from the same computation the queue uses to
 * decide what to serve. It used to come from the project's task count instead,
 * which is why a pool worked to the end still showed "in progress" over a
 * button that led straight to "you're all caught up": the card and the
 * workspace were answering different questions.
 *
 * So the button is offered only where there is something behind it. A pool with
 * nothing left says so and gives nothing to press, which is the honest version
 * of the same screen.
 */
export function PoolCard({ pool }: { pool: Pool }) {
  const router = useRouter();
  const { available } = useAppState();

  const status = poolStatus(pool);
  const workable = poolIsWorkable(pool);
  const closed = status === "closed";

  return (
    <Card
      interactive={available && workable}
      className={`relative flex flex-col p-5 sm:p-6 ${closed ? "opacity-60" : ""}`}
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <PurposeBadge purpose={pool.purpose} />
        <StatusPill status={status} />
      </div>

      <h3 className="text-[18px] font-bold leading-snug tracking-[-0.015em] text-ink">
        {pool.name}
      </h3>
      {pool.description && (
        <p className="mt-2 line-clamp-3 text-[15px] leading-relaxed text-muted">
          {pool.description}
        </p>
      )}

      <div className="mt-auto pt-5">
        <div className="flex items-end justify-between gap-3 border-t border-hairline-soft pt-4">
          <span className="min-w-0">
            <span className="tnum block truncate text-[15px] font-semibold text-ink">
              {poolLine(pool)}
            </span>
            {pool.completed_by_you > 0 && (
              <span className="tnum mt-0.5 block text-[13px] text-subtle">
                {pool.completed_by_you.toLocaleString()} reviewed by you
              </span>
            )}
          </span>
          {workable && (
            <Button
              size="sm"
              className="group shrink-0"
              disabled={!available}
              onClick={() => router.push(`/workspace?pool=${pool.id}`)}
            >
              {pool.completed_by_you > 0 ? "Resume reviewing" : "Start reviewing"}
              <ArrowRight
                size={15}
                aria-hidden="true"
                className="transition-transform duration-150 group-hover:translate-x-0.5"
              />
            </Button>
          )}
        </div>
      </div>

      {available || !workable ? null : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-card bg-surface/85 px-6 text-center backdrop-blur-[2px]">
          <PauseCircle size={22} aria-hidden="true" className="text-subtle" />
          <p className="text-[15px] font-semibold text-muted">
            Turn on availability to start reviewing.
          </p>
        </div>
      )}
    </Card>
  );
}
