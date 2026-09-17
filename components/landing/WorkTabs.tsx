"use client";

import { useRef, useState } from "react";
import type { WorkTask } from "@/lib/marketing-content";

/**
 * The work, as three tabs a visitor can look through.
 *
 * The section used to lay all three tasks out at once, which asked someone to
 * read three paragraphs before learning anything. Here they pick the one they
 * want and see what it actually involves.
 *
 * Built to the tabs pattern rather than as three buttons: one stop in the tab
 * order, arrow keys move between tabs, and each panel is tied to its tab, so a
 * screen reader announces "tab 2 of 3" instead of a list of unlabelled buttons.
 * Inactive panels stay in the DOM and are hidden, so the ids the tabs point at
 * always resolve.
 */
export function WorkTabs({ tasks }: { tasks: WorkTask[] }) {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  const focus = (index: number) => {
    const next = (index + tasks.length) % tasks.length;
    setActive(next);
    tabs.current[next]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const keys: Record<string, number> = {
      ArrowRight: active + 1,
      ArrowLeft: active - 1,
      Home: 0,
      End: tasks.length - 1,
    };
    const next = keys[e.key];
    if (next === undefined) return;
    e.preventDefault();
    focus(next);
  };

  return (
    <div className="mt-12">
      <div
        role="tablist"
        aria-label="What a clinician does here"
        className="flex flex-wrap justify-center gap-x-8 gap-y-2 border-b border-hairline"
      >
        {tasks.map((task, i) => (
          <button
            key={task.tab}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            id={`work-tab-${i}`}
            role="tab"
            type="button"
            aria-selected={i === active}
            aria-controls={`work-panel-${i}`}
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            onKeyDown={onKeyDown}
            className={`focusable -mb-px border-b-2 px-1 pb-3 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors ${
              i === active
                ? "border-accent text-ink"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {task.tab}
          </button>
        ))}
      </div>

      {tasks.map((task, i) => (
        <div
          key={task.tab}
          id={`work-panel-${i}`}
          role="tabpanel"
          aria-labelledby={`work-tab-${i}`}
          hidden={i !== active}
          // A minimum height, so switching tabs does not move the page under
          // the reader's cursor.
          className="mx-auto mt-10 min-h-[260px] max-w-[640px] text-center sm:min-h-[220px]"
        >
          <h3 className="text-[22px] leading-snug text-ink sm:text-[26px]">{task.title}</h3>
          <p className="mt-3 text-body leading-relaxed text-muted">{task.summary}</p>
          <ul className="mt-6 space-y-2.5">
            {task.points.map((point) => (
              <li key={point} className="text-body text-muted">
                {point}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
