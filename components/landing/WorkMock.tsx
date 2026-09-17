import type { WorkTask } from "@/lib/marketing-content";

/**
 * A small picture of the workspace, beside each task on the landing page.
 *
 * Drawn in markup rather than shipped as a screenshot: it stays sharp, stays
 * in the site's palette, and cannot go stale in the way an exported image of a
 * product does. What it shows is deliberately the real controls, named the way
 * the workspace names them, so it teaches rather than decorates.
 *
 * Entirely decorative to assistive technology. The Why and How beside it say
 * everything this shows, and a screen reader reading out a fake interface,
 * with radio buttons and a scale that do nothing, would be worse than silence.
 */

/** A line of case text nobody is meant to read. */
function Line({ w = "w-full" }: { w?: string }) {
  return <div className={`h-2 rounded-full bg-white/[0.09] ${w}`} />;
}

function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className="select-none rounded-card border border-hairline bg-canvas-top p-4 shadow-[0_12px_32px_rgba(0,0,0,0.35)] sm:p-5"
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{label}</p>
      <div className="mt-4 space-y-2">
        <Line />
        <Line />
        <Line w="w-11/12" />
        <Line w="w-8/12" />
      </div>
      <div className="mt-5 rounded-[10px] border border-accent/35 bg-accent-soft/30 p-4">
        {children}
      </div>
    </div>
  );
}

/** A radio row: the chosen one filled, the rest empty. */
function Choice({ label, chosen = false }: { label: string; chosen?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
          chosen ? "border-accent" : "border-white/25"
        }`}
      >
        {chosen && <span className="h-2 w-2 rounded-full bg-accent" />}
      </span>
      <span className={`text-[13px] ${chosen ? "text-ink" : "text-muted"}`}>{label}</span>
    </div>
  );
}

function Chip({ label, on = false }: { label: string; on?: boolean }) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[11px] ${
        on ? "border-accent bg-accent-soft text-ink" : "border-hairline text-muted"
      }`}
    >
      {label}
    </span>
  );
}

function FieldBox({ label, lines = 2 }: { label: string; lines?: number }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{label}</p>
      <div className="mt-1.5 space-y-2 rounded-[8px] border border-hairline bg-surface p-3">
        {Array.from({ length: lines }).map((_, i) => (
          <Line key={i} w={i === lines - 1 ? "w-7/12" : "w-full"} />
        ))}
      </div>
    </div>
  );
}

export function WorkMock({ kind }: { kind: WorkTask["mock"] }) {
  if (kind === "judge") {
    return (
      <Frame label="Case 4 of 12">
        <p className="text-[13px] font-semibold text-ink">Does this answer hold up?</p>
        <div className="mt-3 space-y-2">
          <Choice label="Holds up clinically" />
          <Choice label="Has errors" chosen />
        </div>

        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          What went wrong
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Chip label="Dosage" on />
          <Chip label="Contraindication" />
          <Chip label="Omission" />
        </div>

        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          Passage at fault
        </p>
        <div className="mt-2 space-y-2">
          <Line w="w-10/12" />
          <div className="h-2 w-7/12 rounded-full bg-accent/45" />
        </div>

        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          Your confidence
        </p>
        <div className="mt-2 flex gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <span
              key={n}
              className={`grid h-6 w-6 place-items-center rounded-[6px] border text-[11px] ${
                n === 4
                  ? "border-accent bg-accent text-on-fill"
                  : "border-hairline text-muted"
              }`}
            >
              {n}
            </span>
          ))}
        </div>
      </Frame>
    );
  }

  if (kind === "write") {
    return (
      <Frame label="Write the answer">
        <div className="space-y-3.5">
          <FieldBox label="Assessment" />
          <FieldBox label="Plan" lines={3} />
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
              In your own words
            </p>
            <div className="mt-1.5 space-y-2 rounded-[8px] border border-accent/45 bg-surface p-3">
              <Line />
              <Line w="w-9/12" />
              <span className="inline-block h-3 w-px animate-pulse bg-accent align-middle" />
            </div>
          </div>
        </div>
      </Frame>
    );
  }

  return (
    <Frame label="Written by another clinician">
      <div className="space-y-2 rounded-[8px] border border-hairline bg-surface p-3">
        <Line />
        <Line w="w-10/12" />
        <Line w="w-6/12" />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-full bg-ink px-3 py-1.5 text-[11px] font-semibold text-canvas">
          Approve
        </span>
        <span className="rounded-full border border-hairline px-3 py-1.5 text-[11px] text-muted">
          Edit
        </span>
        <span className="rounded-full border border-accent px-3 py-1.5 text-[11px] text-ink">
          Send back
        </span>
      </div>

      <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
        What has to change
      </p>
      <div className="mt-1.5 space-y-2 rounded-[8px] border border-hairline bg-surface p-3">
        <Line w="w-11/12" />
        <Line w="w-5/12" />
      </div>
    </Frame>
  );
}
