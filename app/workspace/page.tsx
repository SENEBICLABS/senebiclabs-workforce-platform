"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  Flag,
  ListChecks,
  PartyPopper,
  Send,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useAppState } from "@/components/AppState";
import { ReviewField, isVisible, type Answers } from "@/components/ReviewField";
import { Alert } from "@/components/ui/Alert";
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

/**
 * The rubric for this pool, or a plain statement that there isn't one.
 *
 * We tell clinicians the rubric sits beside the case. When a pool's config
 * carries no instructions the panel used not to render at all, so the promise
 * quietly became untrue and the clinician had no way to tell whether the rubric
 * was missing or whether they had missed it. Saying so is the honest version,
 * and it tells them what to do instead.
 */
function Guidelines({ instructions }: { instructions: string | null }) {
  const [open, setOpen] = useState(false);

  const body = instructions ? (
    <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-strong">
      {instructions}
    </p>
  ) : (
    <div className="space-y-2">
      <p className="text-[15px] font-semibold leading-relaxed text-ink">
        No rubric has been supplied for this pool.
      </p>
      <p className="text-[15px] leading-relaxed text-muted">
        Judge the case against your own standard of care, and flag anything you
        cannot judge on that basis rather than guessing.
      </p>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block">
        <Card className="sticky top-24 overflow-hidden">
          <div className="flex items-center gap-2.5 border-b border-hairline-soft bg-canvas-top px-5 py-3.5">
            <BookOpen size={16} aria-hidden="true" className="text-accent-ink" />
            <h2 className="text-[14px] font-semibold text-ink">Review guidelines</h2>
          </div>
          <div className="max-h-[calc(100vh-12rem)] overflow-y-auto px-5 py-4">{body}</div>
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
            <span className="flex items-center gap-2.5 text-[14px] font-semibold text-ink">
              <BookOpen size={16} aria-hidden="true" className="text-accent-ink" />
              Review guidelines
            </span>
            <ChevronDown
              size={16}
              aria-hidden="true"
              className={`text-muted transition-transform duration-150 ${open ? "rotate-180" : ""}`}
            />
          </button>
          {open && (
            <div className="border-t border-hairline-soft px-5 py-4">{body}</div>
          )}
        </Card>
      </div>
    </>
  );
}

/** How far through the form they are. Counts what is on screen, nothing more. */
function AnsweredMeter({ answered, total }: { answered: number; total: number }) {
  const share = total === 0 ? 0 : Math.round((answered / total) * 100);
  return (
    <div className="flex items-center gap-3" aria-label={`${answered} of ${total} answered`}>
      <span className="tnum text-[13px] font-medium text-muted">
        {answered} of {total} answered
      </span>
      <span aria-hidden="true" className="h-1.5 w-20 overflow-hidden rounded-full bg-track">
        <span
          className="block h-full rounded-full bg-accent transition-[width] duration-300"
          style={{ width: `${share}%` }}
        />
      </span>
    </div>
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
  // Flagging hands the case to someone else and throws away what they typed.
  // It sits next to Submit, so it asks once before doing that.
  const [confirmFlag, setConfirmFlag] = useState(false);

  // A different pool resets the page, during render rather than in an effect,
  // so a task from the old pool is never shown under the new one's heading.
  const [loadedFor, setLoadedFor] = useState(poolId);
  if (loadedFor !== poolId) {
    setLoadedFor(poolId);
    setLoading(true);
    setLoadError(null);
    setDrained(false);
  }

  /** Adopt a task and restore whatever was typed against it before. */
  const adopt = useCallback((next: Task | null) => {
    setMissing([]);
    setSubmitError(null);
    setConfirmFlag(false);
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

  // The first task for this pool. State is set only when the request settles:
  // calling load() here set loading and cleared errors synchronously in the
  // effect body, which renders twice. `live` drops a response that arrives
  // after the pool has changed. load() itself stays, for retry and for moving
  // on after a submit or a flag, which are event handlers.
  useEffect(() => {
    if (!poolId) return;
    let live = true;
    api
      .nextTask(poolId)
      .then((result) => {
        if (live) adopt(result === NO_CONTENT ? null : (result as Task));
      })
      .catch((err: unknown) => {
        if (live) setLoadError(err instanceof ApiError ? err.message : "Something went wrong.");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [poolId, adopt]);

  // Persist as they type, so nothing is lost to a refresh or a stray back.
  //
  // An untouched case is not a draft. This used to write "{}" the moment a case
  // was adopted, which left one dead key behind for every case ever opened and
  // never removed it, so a clinician working daily accumulated them for ever.
  // Nothing to keep now means the key goes.
  useEffect(() => {
    if (!task) return;
    try {
      if (Object.keys(answers).length === 0) {
        window.localStorage.removeItem(draftKey(task.task_id));
      } else {
        window.localStorage.setItem(draftKey(task.task_id), JSON.stringify(answers));
      }
    } catch {
      /* storage unavailable; the in-memory answers still stand */
    }
  }, [answers, task]);

  // Clear out the empty drafts left by the older behaviour, once per visit.
  useEffect(() => {
    try {
      const dead: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (!key?.startsWith("senebiclabs:draft:")) continue;
        const raw = window.localStorage.getItem(key);
        if (raw === "{}" || raw === "" || raw === null) dead.push(key);
      }
      dead.forEach((key) => window.localStorage.removeItem(key));
    } catch {
      /* storage unavailable; nothing to tidy */
    }
  }, []);

  // A failed submit must never be silent. The message renders at the top of the
  // assessment card, and someone who submitted with the keyboard is at the
  // bottom of a long form, where they would never see it.
  useEffect(() => {
    if (!submitError) return;
    document
      .getElementById("submit-error")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [submitError]);

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

  // Steps down again on its own, so a stray click does not leave the button
  // armed for the rest of the sitting.
  useEffect(() => {
    if (!confirmFlag) return;
    const timer = window.setTimeout(() => setConfirmFlag(false), 6000);
    return () => window.clearTimeout(timer);
  }, [confirmFlag]);

  const flag = useCallback(async () => {
    if (!task || busy) return;
    setConfirmFlag(false);
    setBusy(true);
    setSubmitError(null);
    const flaggedId = task.task_id;

    try {
      await api.flag(flaggedId, "Unclear or outside my area");
      clearDraft(flaggedId);
      showToast("Flagged. You will not be offered this case again.");
      await load();
    } catch (err) {
      setSubmitError(
        err instanceof ApiError ? err.message : "We could not record that flag."
      );
    } finally {
      setBusy(false);
    }
  }, [task, busy, showToast, load]);

  // The submit shortcut works with either modifier; the hint has to name the
  // one this keyboard actually has. Subscribing to nothing is the point: the
  // server renders the Ctrl form, the client reads the real platform, and
  // neither needs a setState in an effect to do it.
  const isMac = useSyncExternalStore(
    () => () => {},
    () => /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent),
    () => false
  );

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
        icon={ListChecks}
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
        icon={PartyPopper}
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
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <PurposeBadge purpose={task.pool.purpose} />
          <span className="truncate text-[17px] font-semibold tracking-[-0.01em] text-ink">
            {task.pool.name}
          </span>
        </div>
        <span className="tnum text-[14px] text-muted">
          {task.case_id && (
            <span className="mr-2 rounded-full border border-hairline bg-surface px-2.5 py-1 font-mono text-[12px] text-strong">
              Case {task.case_id}
            </span>
          )}
          {/*
            "3 reviewed in this pool" could be read as three reviewed by
            anyone. It is their own count, and says so.
          */}
          you have reviewed {task.already_reviewed_count.toLocaleString()} here
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-5">
          <div className="lg:hidden">
            <Guidelines instructions={instructions} />
          </div>

          {/* The case as one document, its parts in the order the pool gives
              them, rather than a stack of separate boxes. */}
          {task.context.length > 0 && (
            <Card className="overflow-hidden">
              {task.context.map((block, i) => (
                <section
                  key={`${block.label}-${i}`}
                  className="border-b border-hairline-soft px-5 py-5 last:border-b-0 sm:px-6"
                >
                  <h2 className="mb-2.5 flex items-center gap-2 text-label uppercase text-accent-ink">
                    <span aria-hidden="true" className="h-1 w-1 rounded-full bg-accent" />
                    {block.label}
                  </h2>
                  <p className="whitespace-pre-wrap text-[16px] leading-[1.7] text-ink">
                    {block.value}
                  </p>
                </section>
              ))}
            </Card>
          )}

          {task.phase === "review" ? (
            // Keyed by case. The panel keeps the edited text, the send-back
            // reason and which mode it is in inside its own state, and it sits
            // in the same place in the tree from one case to the next, so
            // without a key React reuses all of it: send one case back, and the
            // next opened in rejecting mode with the previous reason still in
            // the box, one click from going back under someone else's words. An
            // edit carried over the same way. A new case gets a new panel.
            <ReviewPanel
              key={task.task_id}
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
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline-soft px-5 py-4 sm:px-6">
              <div>
                <h2 className="text-section text-ink">Your assessment</h2>
                <p className="mt-1 text-[15px] text-muted">
                  {visibleFields.length}{" "}
                  {visibleFields.length === 1 ? "field" : "fields"}. Your answers are
                  kept if you step away.
                </p>
              </div>
              <AnsweredMeter
                answered={visibleFields.filter((f) => {
                  const v = answers[f.name];
                  return v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);
                }).length}
                total={visibleFields.length}
              />
            </div>

            {(missing.length > 0 || submitError) && (
              <div className="space-y-3 px-5 pt-5 sm:px-6">
                {missing.length > 0 && (
                  <Alert tone="danger" role="alert">
                    {missing.length === 1
                      ? "One required field is still empty."
                      : `${missing.length} required fields are still empty.`}{" "}
                    Complete them to submit this review.
                  </Alert>
                )}

                {submitError && (
                  <Alert
                    id="submit-error"
                    tone="danger"
                    role="alert"
                    title={submitError}
                  >
                    Nothing was lost — your answers are still below.
                  </Alert>
                )}
              </div>
            )}

            <ol className="divide-y divide-hairline-soft">
              {visibleFields.map((field, i) => (
                <li
                  key={field.name}
                  id={`field-${field.name}`}
                  className="flex gap-4 px-5 py-6 sm:px-6"
                >
                  <span
                    aria-hidden="true"
                    className="tnum mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-hairline-strong font-mono text-[11px] text-muted"
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
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
                </li>
              ))}
            </ol>
          </Card>
          )}
        </div>

        <div className="hidden lg:block">
          <Guidelines instructions={instructions} />
        </div>
      </div>

      {/*
        The action bar sits clear of the bottom tab bar on a phone. That bar is
        fixed at z-30 and this one was resting underneath it, so a tap aimed at
        Submit review landed on Account: the main action of the product was
        unreachable on a phone. bottom-16 is the height of the tab bar, and it
        applies only below md, which is the only place that bar exists.
      */}
      {task.phase !== "review" && (
      <div className="sticky bottom-16 z-10 -mx-4 mt-6 border-t border-hairline bg-surface/95 px-4 py-3 shadow-[0_-6px_16px_-10px_rgb(16_24_40/0.18)] backdrop-blur-md sm:-mx-6 sm:px-6 md:bottom-0 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {confirmFlag ? (
            <p role="status" className="flex items-start gap-2 text-[14px] text-strong">
              <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-warning" />
              This case stops being offered to you, and anything you have
              entered on it is discarded.
            </p>
          ) : (
            // No keyboard to press it on, and on a phone it was crowding the
            // buttons off the bar.
            <p className="hidden text-[14px] text-subtle sm:block">
              Press{" "}
              <kbd className="rounded-[5px] border border-hairline-strong border-b-2 bg-surface px-1.5 py-0.5 font-mono text-[12px] text-ink">
                {isMac ? "⌘" : "Ctrl"}
              </kbd>{" "}
              +{" "}
              <kbd className="rounded-[5px] border border-hairline-strong border-b-2 bg-surface px-1.5 py-0.5 font-mono text-[12px] text-ink">
                Enter
              </kbd>{" "}
              to submit
            </p>
          )}
          <div className="ml-auto flex items-center gap-2">
            {confirmFlag ? (
              <>
                <Button
                  variant="ghost"
                  onClick={() => setConfirmFlag(false)}
                  disabled={busy}
                >
                  Keep it
                </Button>
                <Button variant="danger" onClick={flag} loading={busy}>
                  <Flag size={14} aria-hidden="true" />
                  Yes, flag it
                </Button>
              </>
            ) : (
              <Button
                variant="secondary"
                onClick={() => setConfirmFlag(true)}
                disabled={busy}
              >
                <Flag size={14} aria-hidden="true" />
                Flag — unclear
              </Button>
            )}
            <Button onClick={submit} loading={busy}>
              {!busy && <Send size={15} aria-hidden="true" />}
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
