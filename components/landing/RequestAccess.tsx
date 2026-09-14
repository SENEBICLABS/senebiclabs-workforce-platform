"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

/**
 * The Request access form, rendered on its own page at /request-access.
 *
 * Membership is by invitation. This is how someone who found the site tells us
 * who they are. It asks only what a stranger can reasonably be asked, says
 * plainly that it is a request and not an account, and promises no reply:
 * silence has to be an acceptable outcome rather than a broken one.
 *
 * On success the form is replaced in place by the confirmation, so the page
 * keeps its heading and the reader is not sent anywhere new.
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

export function RequestAccessForm() {
  const [values, setValues] = useState(empty);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

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

  if (done) {
    return (
      // Announced when it replaces the form, so a screen reader hears the
      // outcome rather than silence after pressing the button.
      <div role="status" className="text-center">
        <h2 className="text-[24px] leading-tight text-ink">Request received</h2>
        <p className="mt-4 text-body leading-relaxed text-muted">
          Thank you. Every request is reviewed by hand. If there is work that
          fits your specialty, we will get in touch at{" "}
          <span className="font-semibold text-ink">{values.email}</span>.
        </p>
        <p className="mt-3 text-[13px] text-muted">
          There is nothing more you need to do, and no account has been
          created. You will hear from us if we can offer you work.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="text-left">
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

      {error && (
        <p role="alert" className="mt-5 text-[13px] text-danger">
          {error}
        </p>
      )}

      <Button type="submit" loading={busy} className="mt-7 h-11 w-full">
        Request access
      </Button>
      <p className="mt-3 text-center text-[12px] text-muted">
        This is a request, not an account. Nothing is created until we invite you.
      </p>
    </form>
  );
}
