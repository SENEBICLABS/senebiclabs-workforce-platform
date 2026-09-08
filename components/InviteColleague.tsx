"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ApiError, api } from "@/lib/api";

/**
 * Invite a colleague.
 *
 * Rendered only for a clinician whose `can_invite` is set, so the whole feature
 * is dormant until that flag is granted — no deploy needed to open invites up
 * to members later.
 */
export function InviteColleague() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api.createInvite(email);
      setSentTo(result.invited_email);
      setEmail("");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "We could not send that invite."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5">
      <h2 className="text-section text-ink">Invite a colleague</h2>
      <p className="mt-1 text-body text-muted">
        Senebiclabs is invite-only. An invitation is for one address, is good
        once, and expires after seven days.
      </p>

      {sentTo ? (
        <div className="mt-4 rounded-card border border-hairline bg-canvas px-4 py-3">
          <p className="text-body text-ink">
            Invitation sent to{" "}
            <span className="font-semibold">{sentTo}</span>.
          </p>
          <button
            onClick={() => setSentTo(null)}
            className="focusable mt-2 rounded-btn text-[13px] font-semibold text-accent underline-offset-2 hover:underline"
          >
            Invite someone else
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-4">
          <label
            htmlFor="invite-email"
            className="mb-1.5 block text-label uppercase text-muted"
          >
            Their email address
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id="invite-email"
              type="email"
              required
              placeholder="colleague@hospital.org"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError("");
              }}
              aria-invalid={Boolean(error)}
              className={`focusable h-10 min-w-[220px] flex-1 rounded-card border bg-surface px-3 text-body text-ink placeholder:text-muted ${
                error ? "border-danger" : "border-hairline"
              }`}
            />
            <Button type="submit" loading={busy}>
              Send invitation
            </Button>
          </div>
          {error && (
            <p role="alert" className="mt-2 text-[13px] text-danger">
              {error}
            </p>
          )}
        </form>
      )}
    </Card>
  );
}
