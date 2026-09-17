"use client";

import { useState } from "react";
import { Check, PenLine, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import type { Field } from "@/lib/api";

/**
 * The approval pass on a colleague's written answer.
 *
 * The author is deliberately not named. A reviewer should judge the text
 * against the prompt, not against who wrote it.
 */
export function ReviewPanel({
  fields,
  authored,
  revision,
  busy,
  error,
  onApprove,
  onEdit,
  onReject,
}: {
  fields: Field[];
  authored: Record<string, unknown>;
  revision: number;
  busy: boolean;
  error: string | null;
  onApprove: () => void;
  onEdit: (answers: Record<string, unknown>) => void;
  onReject: (reason: string) => void;
}) {
  const written = fields.filter((f) => f.type === "text");
  const [mode, setMode] = useState<"idle" | "editing" | "rejecting">("idle");
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(written.map((f) => [f.name, String(authored[f.name] ?? "")]))
  );
  const [reason, setReason] = useState("");

  const changed = written.some(
    (f) => draft[f.name] !== String(authored[f.name] ?? "")
  );

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-section text-ink">Review this answer</h2>
            <p className="mt-1 text-body text-muted">
              Approve it as written, edit it and approve, or send it back.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Pill tone="warning">Awaiting review</Pill>
            {revision > 0 && (
              <Pill tone="neutral">Revision {revision + 1}</Pill>
            )}
          </div>
        </div>

        {/* Non-written answers, for context — not editable in a review pass. */}
        {fields.filter((f) => f.type !== "text").length > 0 && (
          <dl className="mb-5 grid grid-cols-1 gap-3 rounded-card bg-canvas p-4 sm:grid-cols-2">
            {fields
              .filter((f) => f.type !== "text")
              .map((f) => (
                <div key={f.name}>
                  <dt className="text-label uppercase text-muted">{f.title}</dt>
                  <dd className="mt-0.5 text-body text-ink">
                    {String(authored[f.name] ?? "—")}
                  </dd>
                </div>
              ))}
          </dl>
        )}

        <div className="space-y-4">
          {written.map((f) => (
            <div key={f.name}>
              <label
                htmlFor={`review-${f.name}`}
                className="mb-1.5 block text-label uppercase text-muted"
              >
                {f.title}
              </label>

              {mode === "editing" ? (
                <textarea
                  id={`review-${f.name}`}
                  rows={8}
                  value={draft[f.name] ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [f.name]: e.target.value }))
                  }
                  className="focusable w-full resize-y rounded-card border border-accent bg-surface px-3 py-2.5 text-body leading-relaxed text-ink"
                />
              ) : (
                <div className="whitespace-pre-wrap rounded-card border border-hairline bg-surface px-4 py-3 text-body leading-relaxed text-ink">
                  {String(authored[f.name] ?? "") || (
                    <span className="text-muted">(left blank)</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {mode === "rejecting" && (
          <div className="mt-5">
            <label
              htmlFor="reject-reason"
              className="mb-1.5 block text-label uppercase text-muted"
            >
              Why is this going back?
            </label>
            <textarea
              id="reject-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="What needs to change, so the next author can fix it."
              className="focusable w-full resize-y rounded-card border border-hairline bg-surface px-3 py-2.5 text-body text-ink placeholder:text-placeholder"
            />
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 text-[15px] text-danger">
            {error}
          </p>
        )}
      </Card>

      <div className="sticky bottom-0 z-10 -mx-5 border-t border-hairline bg-surface/95 px-5 py-3 backdrop-blur lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {mode === "idle" && (
            <>
              <Button
                variant="ghost"
                onClick={() => setMode("rejecting")}
                disabled={busy}
              >
                <Undo2 size={14} aria-hidden="true" />
                Send back
              </Button>
              <Button
                variant="secondary"
                onClick={() => setMode("editing")}
                disabled={busy}
              >
                <PenLine size={14} aria-hidden="true" />
                Edit
              </Button>
              <Button onClick={onApprove} loading={busy}>
                <Check size={14} aria-hidden="true" />
                Approve as written
              </Button>
            </>
          )}

          {mode === "editing" && (
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setMode("idle");
                  setDraft(
                    Object.fromEntries(
                      written.map((f) => [f.name, String(authored[f.name] ?? "")])
                    )
                  );
                }}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                onClick={() => onEdit(draft)}
                loading={busy}
                disabled={!changed}
              >
                Approve my edit
              </Button>
            </>
          )}

          {mode === "rejecting" && (
            <>
              <Button variant="ghost" onClick={() => setMode("idle")} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => onReject(reason)}
                loading={busy}
                disabled={reason.trim().length < 3}
              >
                Send back to be rewritten
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
