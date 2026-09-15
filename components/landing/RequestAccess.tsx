"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Script from "next/script";
import { Button } from "@/components/ui/Button";
import { Arrow } from "./Arrow";

/**
 * The Request access form, rendered on its own page at /request-access.
 *
 * Joining a list, not applying. Requests are kept until Senebiclabs opens to
 * clinicians, so the form promises exactly one thing: an email when that
 * happens. It asks only what a stranger can reasonably be asked, and says what
 * the email address will be used for, since that is the one use we make of it.
 *
 * A Cloudflare Turnstile check sits above the button. The API refuses a
 * submission without a valid token, so the widget is what keeps a flood of
 * bots from filling the list with invented people. When no site key is
 * configured (local development) the widget is left out and the server skips
 * the check to match; in production the server refuses without its key.
 *
 * The site key arrives as a prop, read on the server by the page from
 * NEXT_TURNSTILE_SITE_KEY, rather than from a NEXT_PUBLIC_ variable. It is
 * public either way: Cloudflare's widget puts it in the page by design, and
 * only the secret key, which never leaves the server, can verify a token.
 *
 * On success the form is replaced in place by the confirmation, so the page
 * keeps its heading and the reader is not sent anywhere new. The browser also
 * remembers it, so a refresh or a return visit says "already on the list"
 * rather than offering a blank form, with a link to send another. That memory
 * is this visitor's own browser only; the request itself lives on the server.
 */

interface TurnstileApi {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

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
    hint: "It helps us know who you are.",
  },
];

const empty = Object.fromEntries(FIELDS.map((f) => [f.name, ""])) as Record<string, string>;

/* ── remembering a sent request, in this browser only ─────────────── */

const STORAGE_KEY = "senebiclabs.request-access.email";
/** Same-tab signal: the storage event only fires in other tabs. */
const CHANGE_EVENT = "senebiclabs:request-access";

/**
 * Storage can be unavailable (private windows, blocked site data) and then
 * throws. Every access is guarded, and the page works without it: the
 * confirmation still shows for the visit that sent the request.
 */
function readRemembered(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function remember(email: string | null) {
  try {
    if (email) window.localStorage.setItem(STORAGE_KEY, email);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do: the in-memory confirmation covers this visit.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** The page is prerendered, where there is no storage: nothing remembered. */
const rememberedOnServer = () => null;

export function RequestAccessForm({ siteKey }: { siteKey?: string }) {
  const SITE_KEY = siteKey;
  const [values, setValues] = useState(empty);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  // Read after hydration, so the prerendered form and the first client render
  // agree, then swap to the confirmation if this browser has already sent one.
  const rememberedEmail = useSyncExternalStore(subscribe, readRemembered, rememberedOnServer);
  const confirmed = done || rememberedEmail !== null;

  const [token, setToken] = useState("");
  const [checkError, setCheckError] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  /**
   * Renders the widget once, into the box, if everything it needs is present.
   * Called when the script becomes ready and on every mount, because either
   * can happen first: on a first visit the script loads after the form mounts,
   * and on a return visit it is already there when the form mounts again.
   */
  const renderWidget = useCallback(() => {
    if (!SITE_KEY || !window.turnstile || !box.current || widgetId.current) return;
    widgetId.current = window.turnstile.render(box.current, {
      sitekey: SITE_KEY,
      theme: "dark",
      action: "request-access",
      callback: (t: string) => {
        setToken(t);
        setCheckError("");
      },
      "expired-callback": () => setToken(""),
      "error-callback": () => {
        setToken("");
        setCheckError(
          "The security check could not load. Please refresh the page, or allow challenges.cloudflare.com if you use a blocker."
        );
      },
    });
  }, [SITE_KEY]);

  const removeWidget = useCallback(() => {
    try {
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
    } catch {
      // Already gone with its box; forgetting the id is all that matters.
    }
    widgetId.current = null;
  }, []);

  // The widget follows the form: rendered while the form is showing, removed
  // when the confirmation replaces it, and rendered afresh on the way back.
  useEffect(() => {
    if (confirmed) removeWidget();
    else renderWidget();
  }, [confirmed, renderWidget, removeWidget]);

  useEffect(() => removeWidget, [removeWidget]);

  /** A token is good once. After any failed attempt, get a fresh one. */
  const resetWidget = () => {
    if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
    setToken("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // The button stays enabled while the check runs, rather than greyed out,
    // so the page does not open on a dimmed call to action. Pressing it early
    // just asks for a moment; the server refuses a missing token regardless.
    if (SITE_KEY && !token) {
      if (!checkError) setError("One moment: the security check is still finishing. Please try again.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, website, turnstile_token: token }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error ?? "We could not send your request just now. Please try again.");
        if (SITE_KEY) resetWidget();
        return;
      }
      remember(values.email);
      setDone(true);
    } catch {
      setError("We could not reach the server. Please check your connection.");
      if (SITE_KEY) resetWidget();
    } finally {
      setBusy(false);
    }
  };

  /** Forgets the remembered request and brings back an empty form. */
  const sendAnother = () => {
    remember(null);
    setDone(false);
    setValues(empty);
    setWebsite("");
    setError("");
    setToken("");
  };

  if (confirmed) {
    // Sent in this visit, or remembered from an earlier one.
    const email = done ? values.email : rememberedEmail;
    return (
      // Announced when it replaces the form, so a screen reader hears the
      // outcome rather than silence after pressing the button.
      <div role="status" className="text-center">
        <h2 className="text-[24px] leading-tight text-ink">
          {done ? "You are on the list" : "You are already on the list"}
        </h2>
        <p className="mt-4 text-body leading-relaxed text-muted">
          {done ? "Thank you. " : ""}We will email{" "}
          <span className="font-semibold text-ink">{email}</span> when
          Senebiclabs opens to clinicians.
        </p>
        <p className="mt-3 text-[13px] text-muted">
          There is nothing more you need to do, and no account has been created.
        </p>
        <button
          type="button"
          onClick={sendAnother}
          className="focusable mt-6 rounded-btn text-[13px] text-muted underline underline-offset-4 transition-colors hover:text-ink"
        >
          Send another request
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="text-left">
      {SITE_KEY && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
          onReady={renderWidget}
          onError={() =>
            setCheckError(
              "The security check could not load. Please refresh the page, or allow challenges.cloudflare.com if you use a blocker."
            )
          }
        />
      )}

      <div className="space-y-5">
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
              className="focusable h-11 w-full rounded-card border border-hairline bg-surface px-3 text-body text-ink placeholder:text-muted"
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

      {/* The widget's own height, reserved so the button does not jump when
          it appears. */}
      {SITE_KEY && <div ref={box} className="mt-7 flex min-h-[65px] justify-center" />}

      {(checkError || error) && (
        <p role="alert" className="mt-5 text-[13px] text-danger">
          {checkError || error}
        </p>
      )}

      <Button
        type="submit"
        variant="light"
        loading={busy}
        className="group mt-6 h-11 w-full"
      >
        Request access
        {/* Hidden while sending, so the spinner is not flanked by an arrow. */}
        {!busy && <Arrow />}
      </Button>
      <p className="mt-3 text-center text-[12px] text-muted">
        Joining the list does not create an account. We will only use your
        email to tell you when we open.
      </p>
    </form>
  );
}
