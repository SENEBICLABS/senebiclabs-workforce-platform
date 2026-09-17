"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Flag } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useAppState } from "@/components/AppState";
import { ReviewField, isVisible, type Answers } from "@/components/ReviewField";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PurposeBadge } from "@/components/ui/Pill";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { ApiError, NO_CONTENT, api, type ReviewAction, type Task } from "@/lib/api";
import { ReviewPanel } from "@/components/ReviewPanel";

/** Answers survive a refresh. Only answers — never the session. */
const draftKey = (taskId: number) => `senebiclabs:draft:${taskId}`;

function readDraft(taskId: number): Answers {
  try {
    const raw = window.localStorage.getItem(draftKey(taskId));
    return raw ? (JSON.parse(raw) as Answers) : {};
  } catch {
    return {};
  }
}

function Guidelines({ instructions }: { instructions: string }) {
  const [open, setOpen] = useState(false);

  const body = (
    <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-muted">
      {instructions}
    </p>
  );

  return (
    <>
      <aside className="hidden lg:block">
        <Card className="sticky top-24 p-5">
          <h2 className="mb-3 text-label uppercase text-muted">
            Review guidelines
          </h2>
          {body}
        </Card>
      </aside>

      <div className="lg:hidden">
        <Card className="overflow-hidden">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="focusable flex w-full items-center justify-between px-5 py-3.5 text-left"
          >
            <span className="text-label uppercase text-muted">
              Review guidelines
            </span>
            <ChevronDown
              size={16}
              aria-hidden="true"
              className={`text-muted transition-transform duration-150 ${open ? "rotate-180" : ""}`}
            />
          </button>
          {open && (
            <div className="border-t border-hairline px-5 py-4">{body}</div>
          )}
        </Card>
      </div>
    </>
  );
}

function Workspace() {
  const router = useRouter();
  const params = useSearchParams();
  const poolId = params.get("pool");
  const { countReview, showToast } = useAppState();

  const [task, setTask] = useState<Task | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [loading, setLoading] = useState(true);
  const [drained, setDrained] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  /** Adopt a task and restore whatever was typed against it before. */
  const adopt = useCallback((next: Task | null) => {
    setMissing([]);
    setSubmitError(null);
    if (!next) {
      setTask(null);
      setAnswers({});
      setDrained(true);
      return;
    }
    setTask(next);
    setAnswers(readDraft(next.task_id));
  }, []);

  const load = useCallback(async () => {
    if (!poolId) return;
    setLoading(true);
    setLoadError(null);
    setDrained(false);
    try {
      const result = await api.nextTask(poolId);
      adopt(result === NO_CONTENT ? null : (result as Task));
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }, [poolId, adopt]);

  useEffect(() => {
    void load();
  }, [load]);

  // Persist as they type, so nothing is lost to a refresh or a stray back.
  useEffect(() => {
    if (!task) return;
    try {
      window.localStorage.setItem(draftKey(task.task_id), JSON.stringify(answers));
    } catch {
      /* storage unavailable; the in-memory answers still stand */
    }
  }, [answers, task]);

  const clearDraft = (taskId: number) => {
    try {
      window.localStorage.removeItem(draftKey(taskId));
    } catch {
      /* nothing to clean up */
    }
  };

  const update = useCallback((key: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    setMissing((prev) => prev.filter((m) => m !== key && m !== `${key}_finding`));
  }, []);

  const visibleFields = useMemo(
    () => (task?.eval_config.fields ?? []).filter((f) => isVisible(f, answers)),
    [task, answers]
  );

  const submit = useCallback(async () => {
    if (!task || busy) return;

    const gaps: string[] = [];
    for (const field of visibleFields) {
      const value = answers[field.name];
      if (field.required && (value === undefined || value === "")) {
        gaps.push(field.name);
      }
      if (field.type === "structured" && value === "Yes") {
        if (!answers[`${field.name}_finding`]) gaps.push(`${field.name}_finding`);
      }
    }

    if (gaps.length > 0) {
      setMissing(gaps);
      setSubmitError(null);
      document
        .getElementById(`field-${gaps[0].replace(/_finding$/, "")}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setBusy(true);
    setSubmitError(null);
    const submittedId = task.task_id;

    try {
      const { next } = await api.submit(submittedId, answers);
      clearDraft(submittedId);
      countReview();
      showToast("Review submitted");
      adopt(next);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      // Answers stay exactly where they are — the draft is untouched.
      setSubmitError(
        err instanceof ApiError ? err.message : "We could not save your review."
      );
    } finally {
      setBusy(false);
    }
  }, [task, busy, visibleFields, answers, countReview, showToast, adopt]);

  /** Approve, edit-and-approve, or send back. Advances like a submit does. */
  const decide = useCallback(
    async (action: ReviewAction, payload: { answers?: Record<string, unknown>; reason?: string } = {}) => {
      if (!task || busy) return;
      setBusy(true);
      setSubmitError(null);
      const reviewedId = task.task_id;

      try {
        const outcome = await api.review(reviewedId, action, payload);
        clearDraft(reviewedId);
        if (outcome.action !== "rejected") countReview();
        showToast(
          outcome.action === "rejected"
            ? "Sent back to be rewritten"
            : outcome.action === "edited"
              ? "Your edit approved and delivered"
              : "Approved and delivered"
        );
        await load();
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (err) {
        setSubmitError(
          err instanceof ApiError ? err.message : "We could not record that decision."
        );
      } finally {
        setBusy(false);
      }
    },
    [task, busy, countReview, showToast, load]
  );

  const flag = useCallback(async () => {
    if (!task || busy) return;
    setBusy(true);
    setSubmitError(null);
    const flaggedId = task.task_id;

    try {
      await api.flag(flaggedId, "Unclear or outside my area");
      clearDraft(flaggedId);
      showToast("Flagged for another clinician");
      await load();
    } catch (err) {
      setSubmitError(
        err instanceof ApiError ? err.message : "We could not record that flag."
      );
    } finally {
      setBusy(false);
    }
  }, [task, busy, showToast, load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void submit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submit]);

  if (!poolId) {
    return (
      <EmptyState
        title="No pool selected"
        body="Open a pool from your review queue to start working through it."
        action={
          <Button onClick={() => router.push("/queue")}>
            Go to review queue
          </Button>
        }
      />
    );
  }

  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]"
      >
        <span className="sr-only">Loading the next case</span>
        <div className="space-y-5">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-72" />
        </div>
        <Skeleton className="hidden h-80 lg:block" />
      </div>
    );
  }

  if (loadError) {
    return <ErrorState message={loadError} onRetry={load} />;
  }

  if (drained || !task) {
    return (
      <EmptyState
        title="You're all caught up"
        body="Every case open to you in this pool has been reviewed. More arrive as they are added."
        action={
          <Button onClick={() => router.push("/queue")}>
            Back to review queue
          </Button>
        }
      />
    );
  }

  const { instructions, classes } = task.eval_config;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <PurposeBadge purpose={task.pool.purpose} />
          <span className="text-body font-semibold text-ink">{task.pool.name}</span>
        </div>
        <span className="tnum text-[15px] text-muted">
          {task.case_id ? `Case ${task.case_id} · ` : ""}
          {task.already_reviewed_count.toLocaleString()} reviewed in this pool
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-5">
          {instructions && (
            <div className="lg:hidden">
              <Guidelines instructions={instructions} />
            </div>
          )}

          {task.context.map((block, i) => (
            <Card key={`${block.label}-${i}`} className="p-5">
              <h2 className="mb-2 text-label uppercase text-muted">
                {block.label}
              </h2>
              <p className="whitespace-pre-wrap text-body leading-relaxed text-ink">
                {block.value}
              </p>
            </Card>
          ))}

          {task.phase === "review" ? (
            <ReviewPanel
              fields={task.eval_config.fields}
              authored={task.authored ?? {}}
              revision={task.revision ?? 0}
              busy={busy}
              error={submitError}
              onApprove={() => decide("approve")}
              onEdit={(edited) => decide("edit", { answers: edited })}
              onReject={(reason) => decide("reject", { reason })}
            />
          ) : (
          <Card className="p-5">
            <h2 className="text-section text-ink">Your assessment</h2>
            <p className="mt-1 text-body text-muted">
              {visibleFields.length}{" "}
              {visibleFields.length === 1 ? "field" : "fields"}. Your answers are
              kept if you step away.
            </p>

            {missing.length > 0 && (
              <div
                role="alert"
                className="mt-4 rounded-card border border-danger bg-danger-soft px-4 py-3"
              >
                <p className="text-[15px] font-semibold text-danger">
                  {missing.length === 1
                    ? "One required field is still empty."
                    : `${missing.length} required fields are still empty.`}{" "}
                  Complete them to submit this review.
                </p>
              </div>
            )}

            {submitError && (
              <div
                role="alert"
                className="mt-4 rounded-card border border-danger bg-danger-soft px-4 py-3"
              >
                <p className="text-[15px] font-semibold text-danger">
                  {submitError}
                </p>
                <p className="mt-1 text-[14px] text-danger">
                  Nothing was lost — your answers are still below.
                </p>
              </div>
            )}

            <div className="mt-6 space-y-8">
              {visibleFields.map((field) => (
                <div key={field.name} id={`field-${field.name}`}>
                  <ReviewField
                    field={field}
                    answers={answers}
                    poolClasses={classes}
                    onChange={update}
                    invalid={
                      missing.includes(field.name) ||
                      missing.includes(`${field.name}_finding`)
                    }
                  />
                </div>
              ))}
            </div>
          </Card>
          )}
        </div>

        {instructions && (
          <div className="hidden lg:block">
            <Guidelines instructions={instructions} />
          </div>
        )}
      </div>

      {task.phase !== "review" && (
      <div className="sticky bottom-0 z-10 -mx-5 mt-6 border-t border-hairline bg-surface/95 px-5 py-3 backdrop-blur lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[14px] text-muted">
            Press{" "}
            <kbd className="rounded border border-hairline bg-canvas px-1.5 py-0.5 font-sans text-[12px] text-ink">
              ⌘
            </kbd>{" "}
            +{" "}
            <kbd className="rounded border border-hairline bg-canvas px-1.5 py-0.5 font-sans text-[12px] text-ink">
              Enter
            </kbd>{" "}
            to submit
          </p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={flag} disabled={busy}>
              <Flag size={14} aria-hidden="true" />
              Flag — unclear
            </Button>
            <Button onClick={submit} loading={busy}>
              Submit review
            </Button>
          </div>
        </div>
      </div>
      )}
    </>
  );
}

export default function WorkspacePage() {
  return (
    <AppLayout title="Task workspace">
      <Suspense
        fallback={
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
            <div className="space-y-5">
              <Skeleton className="h-28" />
              <Skeleton className="h-72" />
            </div>
            <Skeleton className="hidden h-80 lg:block" />
          </div>
        }
      >
        <Workspace />
      </Suspense>
    </AppLayout>
  );
}
