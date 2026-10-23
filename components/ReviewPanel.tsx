"use client";

import { useState } from "react";
import { Check, PenLine, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { Label, Textarea } from "@/components/ui/Field";
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
      <Card className="p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-hairline-soft pb-5">
          <div>
            <h2 className="text-section text-ink">Review this answer</h2>
            <p className="mt-1 text-[15px] text-muted">
              Approve it as written, edit it and approve, or send it back.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Pill tone="warning" dot>Awaiting review</Pill>
            {revision > 0 && (
              <Pill tone="neutral">Revision {revision + 1}</Pill>
            )}
          </div>
        </div>

        {/* Non-written answers, for context — not editable in a review pass. */}
        {fields.filter((f) => f.type !== "text").length > 0 && (
          <dl className="mb-5 grid grid-cols-1 gap-4 rounded-btn border border-hairline-soft bg-canvas-top p-4 sm:grid-cols-2">
            {fields
              .filter((f) => f.type !== "text")
              .map((f) => (
                <div key={f.name}>
                  <dt className="text-label uppercase text-subtle">{f.title}</dt>
                  <dd className="mt-1 text-[15px] font-semibold text-ink">
                    {String(authored[f.name] ?? "—")}
                  </dd>
                </div>
              ))}
          </dl>
        )}

        <div className="space-y-5">
          {written.map((f) => (
            <div key={f.name}>
              <Label htmlFor={`review-${f.name}`}>{f.title}</Label>

              {mode === "editing" ? (
                <Textarea
                  id={`review-${f.name}`}
                  rows={8}
                  value={draft[f.name] ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [f.name]: e.target.value }))
                  }
                  autoFocus={f === written[0]}
                />
              ) : (
                <div className="whitespace-pre-wrap rounded-btn border border-hairline-soft border-l-2 border-l-accent/60 bg-canvas-top px-4 py-3.5 text-[16px] leading-[1.7] text-ink">
                  {String(authored[f.name] ?? "") || (
                    <span className="text-subtle">(left blank)</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {mode === "rejecting" && (
          <div className="animate-rise mt-5 rounded-btn border border-warning/30 bg-warning-soft/30 p-4">
            <Label htmlFor="reject-reason">Why is this going back?</Label>
            <Textarea
              id="reject-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="What needs to change, and why."
            />
          </div>
        )}

        {error && (
          <Alert tone="danger" role="alert" className="mt-4">
            {error}
          </Alert>
        )}
      </Card>

      {/*
        Clear of the fixed bottom tab bar on a phone, which is at z-30 and would
        otherwise swallow taps meant for these buttons. Only below md, since
        that bar exists nowhere else.
      */}
      <div className="sticky bottom-16 z-10 -mx-4 border-t border-hairline bg-surface/95 px-4 py-3 shadow-[0_-6px_16px_-10px_rgb(16_24_40/0.18)] backdrop-blur-md sm:-mx-6 sm:px-6 md:bottom-0 lg:-mx-8 lg:px-8">
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
