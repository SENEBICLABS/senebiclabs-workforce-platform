"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { UserPlus } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Card, IconBadge } from "@/components/ui/Card";
import { FieldError, Input, Label } from "@/components/ui/Field";
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
    <Card className="p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <IconBadge>
          <UserPlus size={17} />
        </IconBadge>
        <div className="min-w-0">
          <h2 className="text-section text-ink">Invite a colleague</h2>
          <p className="mt-1 text-[15px] text-muted">
            Senebiclabs is invite-only. An invitation is for one address, is good
            once, and expires after seven days.
          </p>
        </div>
      </div>

      {sentTo ? (
        <div className="mt-5">
          <Alert tone="success" role="status">
            Invitation sent to <span className="font-semibold text-ink">{sentTo}</span>.
          </Alert>
          <button
            onClick={() => setSentTo(null)}
            className="focusable mt-3 rounded-btn text-[15px] font-semibold text-accent underline-offset-4 hover:underline"
          >
            Invite someone else
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-5">
          <Label htmlFor="invite-email">Their email address</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="invite-email"
              type="email"
              required
              placeholder="colleague@hospital.org"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError("");
              }}
              invalid={Boolean(error)}
              className="sm:flex-1"
            />
            <Button type="submit" size="lg" loading={busy} className="sm:h-11">
              Send invitation
            </Button>
          </div>
          {error && <FieldError>{error}</FieldError>}
        </form>
      )}
    </Card>
  );
}
