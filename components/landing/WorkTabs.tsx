"use client";

import { useRef, useState } from "react";
import type { WorkTask } from "@/lib/marketing-content";
import { WorkMock } from "./WorkMock";

/**
 * The work, as tabs a visitor can look through.
 *
 * A pill bar over one panel: the task on the left, said as why it exists and
 * what you actually do, and a picture of the workspace on the right. Someone
 * deciding whether this is for them wants to see the thing, not read three
 * paragraphs of prose.
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
      {/* Scrolls sideways rather than wrapping when the labels outgrow a phone,
          so the bar stays one row at every width. */}
      <div className="-mx-5 overflow-x-auto px-5 scrollbar-none [&::-webkit-scrollbar]:hidden">
        <div
          role="tablist"
          aria-label="What a clinician does here"
          className="mx-auto flex w-max gap-1 rounded-full border border-hairline bg-surface p-1.5"
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
              className={`focusable whitespace-nowrap rounded-full px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors sm:px-6 ${
                i === active ? "bg-ink text-canvas" : "text-muted hover:text-ink"
              }`}
            >
              {task.tab}
            </button>
          ))}
        </div>
      </div>

      {tasks.map((task, i) => (
        <div
          key={task.tab}
          id={`work-panel-${i}`}
          role="tabpanel"
          aria-labelledby={`work-tab-${i}`}
          hidden={i !== active}
          className="mt-8 rounded-card border border-hairline bg-linear-to-br from-accent-soft/40 via-transparent to-transparent p-6 text-left sm:p-10"
        >
          <div className="grid items-center gap-10 md:grid-cols-2">
            <div>
              <h3 className="text-[24px] leading-tight text-ink sm:text-[30px]">{task.title}</h3>

              <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.12em] text-accent">
                Why
              </p>
              <p className="mt-2 text-body leading-relaxed text-muted">{task.why}</p>

              <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.12em] text-accent">
                How
              </p>
              <p className="mt-2 text-body leading-relaxed text-muted">{task.how}</p>
            </div>

            <WorkMock kind={task.mock} />
          </div>
        </div>
      ))}
    </div>
  );
}
