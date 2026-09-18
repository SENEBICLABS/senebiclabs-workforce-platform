import type { WorkTask } from "@/lib/marketing-content";

/**
 * A small picture of the workspace, beside each task on the landing page.
 *
 * Drawn in markup rather than shipped as a screenshot: it stays sharp, stays
 * in the site's palette, and cannot go stale in the way an exported image of a
 * product does. What it shows is deliberately the real controls, named the way
 * the workspace names them, so it teaches rather than decorates.
 *
 * The evaluate preview mirrors the live evaluate pool's config exactly: its
 * four fields, in its field_order, with its own labels and options.
 *
 *   verdict        single      correct | incorrect | partially correct
 *   confidence     scale       1 to 5
 *   critical_miss  structured  yes or no, then which finding, over the pool's
 *                              classes, shown only after yes as visible_when does
 *   correction     text        "Corrected assessment"
 *
 * Nothing else belongs there. An earlier version showed a span highlighter and
 * an error-category chip row: no evaluate config has either, and chips implied
 * choosing several where the field would be single-select. The span highlighter
 * lives in the label preview, where the only spans field actually is.
 *
 * Each preview is left mid-task, because a finished form says less about the
 * work than one somebody is halfway through.
 *
 * Entirely decorative to assistive technology. The Why and How beside it say
 * everything this shows, and a screen reader reading out a fake interface,
 * with radio buttons and a scale that do nothing, would be worse than silence.
 */

/** A line of case text nobody is meant to read. */
function Line({ w = "w-full" }: { w?: string }) {
  return <div className={`h-1.5 rounded-full bg-accent/25 ${w}`} />;
}

function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className="select-none rounded-card border border-hairline bg-canvas-top p-3.5 shadow-[0_12px_32px_rgba(0,0,0,0.35)]"
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{label}</p>
      <div className="mt-3 space-y-1.5">
        <Line />
        <Line w="w-11/12" />
        <Line w="w-8/12" />
      </div>
      <div className="mt-4 rounded-[10px] border border-accent/35 bg-accent-soft/30 p-3.5">
        {children}
      </div>
    </div>
  );
}

/** The mono caption over a group of controls, as a field label reads. */
function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{children}</p>
  );
}

/** A radio row, as a single or from_classes field renders with few options. */
function Choice({ label, chosen = false }: { label: string; chosen?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border ${
          chosen ? "border-accent" : "border-white/25"
        }`}
      >
        {chosen && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
      </span>
      <span className={`text-[13px] ${chosen ? "text-ink" : "text-muted"}`}>{label}</span>
    </div>
  );
}

function Chip({ label, on = false }: { label: string; on?: boolean }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[11px] ${
        on ? "border-accent bg-accent-soft text-ink" : "border-hairline text-muted"
      }`}
    >
      {label}
    </span>
  );
}

/** The side-by-side pair a structured field opens with, before it branches. */
function YesNo({ chosen }: { chosen?: "Yes" | "No" }) {
  return (
    <div className="mt-2 flex gap-2">
      {(["Yes", "No"] as const).map((option) => (
        <span
          key={option}
          className={`flex-1 rounded-[8px] border py-1.5 text-center text-[13px] ${
            chosen === option
              ? "border-accent bg-accent-soft font-semibold text-ink"
              : "border-hairline text-muted"
          }`}
        >
          {option}
        </span>
      ))}
    </div>
  );
}

/** A text field, mid-typing. */
function TextBox({ lines = 1, active = false }: { lines?: number; active?: boolean }) {
  return (
    <div
      className={`mt-1.5 space-y-1.5 rounded-[8px] border bg-surface p-2.5 ${
        active ? "border-accent/45" : "border-hairline"
      }`}
    >
      {Array.from({ length: lines }).map((_, i) => (
        <Line key={i} w={i === lines - 1 ? "w-8/12" : "w-full"} />
      ))}
      {active && <span className="inline-block h-3 w-px animate-pulse bg-accent align-middle" />}
    </div>
  );
}

function FieldBox({ label, lines = 2 }: { label: string; lines?: number }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{label}</p>
      <div className="mt-1.5 space-y-1.5 rounded-[8px] border border-hairline bg-surface p-2.5">
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
        {/* verdict: the friendly question, the config's three options. */}
        <p className="text-[13px] font-semibold text-ink">Does this answer hold up?</p>
        <div className="mt-3 space-y-2">
          <Choice label="correct" />
          <Choice label="incorrect" />
          <Choice label="partially correct" chosen />
        </div>

        <GroupLabel>Confidence</GroupLabel>
        <div className="mt-2 flex gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <span
              key={n}
              className={`grid h-5 w-5 place-items-center rounded-[6px] border text-[11px] ${
                n === 4
                  ? "border-accent bg-accent text-on-fill"
                  : "border-hairline text-muted"
              }`}
            >
              {n}
            </span>
          ))}
        </div>

        <GroupLabel>Critical miss?</GroupLabel>
        <YesNo chosen="Yes" />
        {/* The follow-up appears only once Yes is chosen, the way visible_when
            behaves in the workspace, and picks from the pool's classes. */}
        <div className="mt-3 border-l-2 border-accent-soft pl-4">
          <p className="text-[13px] font-semibold text-ink">Which finding?</p>
          <div className="mt-2 overflow-hidden rounded-[8px] border border-hairline bg-surface">
            {["Airway", "Parenchyma", "Vascular", "Pleural"].map((option) => (
              <p
                key={option}
                className={`px-2.5 py-0.5 text-[12px] ${
                  option === "Parenchyma" ? "bg-accent-soft text-ink" : "text-muted"
                }`}
              >
                {option}
              </p>
            ))}
          </div>
        </div>

        <GroupLabel>Corrected assessment</GroupLabel>
        <TextBox lines={3} active />
      </Frame>
    );
  }

  if (kind === "label") {
    // category, findings, a claim, and the span highlighter with its correction.
    return (
      <Frame label="Case 4 of 12">
        <p className="text-[13px] font-semibold text-ink">What does this case show?</p>

        <GroupLabel>Category</GroupLabel>
        <div className="mt-2 space-y-2">
          <Choice label="Diagnostic imaging" chosen />
          <Choice label="Discharge summary" />
          <Choice label="Laboratory report" />
        </div>

        <GroupLabel>Findings present</GroupLabel>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Chip label="Effusion" on />
          <Chip label="Consolidation" on />
          <Chip label="Pneumothorax" />
          <Chip label="Cardiomegaly" />
        </div>

        <GroupLabel>Does the claim hold up against the evidence?</GroupLabel>
        <YesNo chosen="No" />

        <GroupLabel>The words that are wrong</GroupLabel>
        <div className="mt-2 space-y-2">
          <Line w="w-10/12" />
          <div className="flex gap-1.5">
            <div className="h-2 w-4/12 rounded-full bg-accent/25" />
            <div className="h-2 w-5/12 rounded-full bg-accent/70" />
          </div>
        </div>

        <GroupLabel>Your correction</GroupLabel>
        <TextBox active />
      </Frame>
    );
  }

  return (
    <Frame label="Write the answer">
      <div className="space-y-3.5">
        <FieldBox label="Assessment" />
        <FieldBox label="Plan" lines={3} />
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
            In your own words
          </p>
          <div className="mt-1.5 space-y-1.5 rounded-[8px] border border-accent/45 bg-surface p-2.5">
            <Line />
            <Line w="w-9/12" />
            <span className="inline-block h-3 w-px animate-pulse bg-accent align-middle" />
          </div>
        </div>
      </div>
    </Frame>
  );
}
