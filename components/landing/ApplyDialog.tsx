"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * The application form.
 *
 * It collects what an operator needs to decide, and says plainly that it is a
 * request rather than an account. Nothing here signs anyone in.
 */

const FIELDS = [
  { name: "full_name", label: "Full name", type: "text", autoComplete: "name", placeholder: "Dr Amara Osei" },
  { name: "email", label: "Email", type: "email", autoComplete: "email", placeholder: "you@hospital.org" },
  { name: "specialty", label: "Specialty", type: "text", autoComplete: "off", placeholder: "Internal medicine" },
  { name: "credential", label: "Credential or licence type", type: "text", autoComplete: "off", placeholder: "MD, MBBS, NP" },
  { name: "country", label: "Country of practice", type: "text", autoComplete: "country-name", placeholder: "Ghana" },
] as const;

const empty = Object.fromEntries(FIELDS.map((f) => [f.name, ""])) as Record<string, string>;

/**
 * A dialog scoped to this page.
 *
 * The application has no shared modal, and one component used in a single place
 * does not earn a home in the shared set.
 */
function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Move focus into the dialog so a keyboard user is not left behind it.
    panel.current?.querySelector<HTMLElement>("input, button")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative my-8 w-full max-w-md rounded-card border border-hairline bg-surface text-left shadow-[0_16px_48px_rgba(0,0,0,0.6)]"
      >
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <h2 className="text-section text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="focusable rounded-btn p-1 text-muted transition-colors hover:bg-accent-soft hover:text-ink"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function ApplyDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [values, setValues] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const close = () => {
    onClose();
    // Reset only once the dialog is out of view, so nothing flickers on the way.
    window.setTimeout(() => {
      setDone(false);
      setError("");
      setValues(empty);
    }, 200);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error ?? "We could not send that just now. Please try again.");
        return;
      }
      setDone(true);
    } catch {
      setError("We could not reach the server. Please check your connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={close} title={done ? "Application received" : "Apply to join"}>
      {done ? (
        <div>
          <p className="text-body text-muted">
            Thank you. We have your application and will review your credentials.
            If you are a fit for the work we have, we will email an invitation to{" "}
            <span className="font-semibold text-ink">{values.email}</span>.
          </p>
          <p className="mt-3 text-[13px] text-muted">
            Membership is vetted, so this can take a little time. There is nothing
            further you need to do.
          </p>
          <Button className="mt-5 w-full" onClick={close}>
            Close
          </Button>
        </div>
      ) : (
        <form onSubmit={submit}>
          <p className="text-body text-muted">
            Tell us about your practice. We review every application and email an
            invitation to the clinicians we can offer work to.
          </p>

          <div className="mt-5 space-y-4">
            {FIELDS.map((f) => (
              <div key={f.name}>
                <label
                  htmlFor={`apply-${f.name}`}
                  className="mb-1.5 block text-label uppercase text-muted"
                >
                  {f.label}
                </label>
                <input
                  id={`apply-${f.name}`}
                  name={f.name}
                  type={f.type}
                  required
                  autoComplete={f.autoComplete}
                  placeholder={f.placeholder}
                  value={values[f.name]}
                  onChange={(e) => {
                    setValues({ ...values, [f.name]: e.target.value });
                    setError("");
                  }}
                  className="focusable h-10 w-full rounded-card border border-hairline bg-surface px-3 text-body text-ink placeholder:text-muted"
                />
              </div>
            ))}
          </div>

          {error && (
            <p role="alert" className="mt-4 text-[13px] text-danger">
              {error}
            </p>
          )}

          <Button type="submit" loading={busy} className="mt-5 h-11 w-full">
            Send application
          </Button>
          <p className="mt-3 text-center text-[12px] text-muted">
            This is an application, not an account. Access begins with an invitation.
          </p>
        </form>
      )}
    </Dialog>
  );
}

/** The page's calls to action, which need the dialog's state. */
export function ApplyActions() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button size="lg" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
          Apply to join
        </Button>
        <a
          href="/login"
          // Hovers to the teal tint rather than to canvas: canvas is now the
          // ground the button sits on, so that hover made it vanish.
          className="focusable inline-flex h-11 w-full items-center justify-center rounded-btn border border-hairline bg-surface px-5 text-body font-semibold text-ink transition-colors hover:bg-accent-soft sm:w-auto"
        >
          Sign in
        </a>
      </div>
      <ApplyDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
