"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * Requesting access.
 *
 * Membership is by invitation. This is how someone who found the site tells us
 * who they are, so that we can assess them and reach out. It asks only what a
 * stranger can reasonably be asked, says plainly that it is a request and not
 * an account, and promises no reply: most requests will arrive when there is no
 * work in that specialty, and silence has to be an acceptable outcome rather
 * than a broken one.
 */

interface Field {
  name: string;
  label: string;
  type: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete: string;
  placeholder: string;
  optional?: boolean;
  hint?: string;
}

const FIELDS: Field[] = [
  { name: "full_name", label: "Full name", type: "text", autoComplete: "name", placeholder: "Dr Amara Osei" },
  {
    name: "email",
    label: "Email",
    type: "email",
    autoComplete: "email",
    placeholder: "you@example.com",
    hint: "A personal address is fine. Use one you check.",
  },
  { name: "specialty", label: "Specialty", type: "text", autoComplete: "off", placeholder: "Internal medicine" },
  { name: "country", label: "Country of practice", type: "text", autoComplete: "country-name", placeholder: "Ghana" },
  {
    name: "linkedin_url",
    label: "LinkedIn",
    // Text rather than url: people paste "linkedin.com/in/name" without a
    // scheme, which a url input would refuse. The server adds the scheme.
    type: "text",
    inputMode: "url",
    autoComplete: "url",
    placeholder: "linkedin.com/in/your-name",
    optional: true,
    hint: "It helps us assess your request quickly.",
  },
];

const empty = Object.fromEntries(FIELDS.map((f) => [f.name, ""])) as Record<string, string>;

/**
 * The dialog shell.
 *
 * Rendered into document.body through a portal, not where it is used. The nav
 * that opens it carries backdrop-filter, and backdrop-filter makes any
 * position: fixed descendant position against the nav rather than the
 * viewport — the form would otherwise open trapped inside the pill.
 *
 * onClose is read through a ref so the effects depend on `open` alone. The
 * callers pass a fresh function every render, and depending on it directly
 * re-ran the focus effect on each keystroke, pulling focus back to the first
 * field while someone was typing into another.
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
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);

    // Into the first field, so a keyboard user is not left behind the dialog.
    panel.current?.querySelector<HTMLElement>("input")?.focus();

    // The page underneath should not scroll while the form is open.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <div className="fixed inset-0 bg-black/70" onClick={onClose} aria-hidden="true" />
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
    </div>,
    document.body
  );
}

export function RequestAccessDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [values, setValues] = useState(empty);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const close = () => {
    onClose();
    // A finished request resets once the dialog is out of view. An unfinished
    // one keeps its draft, so an accidental click outside does not throw away
    // what someone has typed.
    if (done) {
      window.setTimeout(() => {
        setDone(false);
        setError("");
        setValues(empty);
        setWebsite("");
      }, 200);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, website }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error ?? "We could not send your request just now. Please try again.");
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
    <Dialog open={open} onClose={close} title={done ? "Request received" : "Request access"}>
      {done ? (
        <div>
          <p className="text-body text-muted">
            Thank you. Every request is reviewed by hand. If there is work that
            fits your specialty, we will get in touch at{" "}
            <span className="font-semibold text-ink">{values.email}</span>.
          </p>
          <p className="mt-3 text-[13px] text-muted">
            There is nothing more you need to do, and no account has been
            created. You will hear from us if we can offer you work.
          </p>
          <Button className="mt-5 w-full" onClick={close}>
            Close
          </Button>
        </div>
      ) : (
        <form onSubmit={submit}>
          <p className="text-body text-muted">
            Senebiclabs is invite-only. Tell us who you are, and we will reach
            out with an invitation when there is work that fits your specialty.
          </p>

          <div className="mt-5 space-y-4">
            {FIELDS.map((f) => (
              <div key={f.name}>
                <label
                  htmlFor={`ra-${f.name}`}
                  className="mb-1.5 flex items-baseline justify-between text-label uppercase text-muted"
                >
                  <span>{f.label}</span>
                  {f.optional && <span className="normal-case tracking-normal">Optional</span>}
                </label>
                <input
                  id={`ra-${f.name}`}
                  name={f.name}
                  type={f.type}
                  inputMode={f.inputMode}
                  required={!f.optional}
                  autoComplete={f.autoComplete}
                  placeholder={f.placeholder}
                  value={values[f.name]}
                  aria-describedby={f.hint ? `ra-${f.name}-hint` : undefined}
                  onChange={(e) => {
                    setValues({ ...values, [f.name]: e.target.value });
                    setError("");
                  }}
                  className="focusable h-10 w-full rounded-card border border-hairline bg-surface px-3 text-body text-ink placeholder:text-muted"
                />
                {f.hint && (
                  <p id={`ra-${f.name}-hint`} className="mt-1.5 text-[12px] text-muted">
                    {f.hint}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Honeypot. Hidden from people and from assistive technology; bots
              that fill every field they find tend to complete it. */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
            <label htmlFor="ra-website">Website</label>
            <input
              id="ra-website"
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </div>

          {error && (
            <p role="alert" className="mt-4 text-[13px] text-danger">
              {error}
            </p>
          )}

          <Button type="submit" loading={busy} className="mt-5 h-11 w-full">
            Request access
          </Button>
          <p className="mt-3 text-center text-[12px] text-muted">
            This is a request, not an account. Nothing is created until we invite you.
          </p>
        </form>
      )}
    </Dialog>
  );
}
