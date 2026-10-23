"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FieldError, Input, Label } from "@/components/ui/Field";

export default function Unlock() {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/ops/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      if (!res.ok) {
        setError("That key is not valid.");
        return;
      }
      // The API set the operator cookie on this response. push() navigates and
      // refresh() re-fetches the console with that cookie attached, so the
      // edge guard sees it rather than serving a payload from before unlock.
      router.push("/ops");
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ground-blend flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="animate-rise w-full max-w-[380px] rounded-card border border-hairline bg-surface p-7 shadow-pop">
        <span className="grid h-11 w-11 place-items-center rounded-btn bg-warning-soft text-warning ring-1 ring-inset ring-warning/25">
          <KeyRound size={20} aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-title text-ink">
          Operator console
        </h1>
        <p className="mt-1.5 text-[15px] text-muted">
          This area is not part of the clinician platform.
        </p>

        <div className="mt-6">
          <Label htmlFor="key">Operator key</Label>
          <Input
            id="key"
            type="password"
            autoFocus
            autoComplete="off"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            invalid={Boolean(error)}
            className="font-mono"
          />
          {error && <FieldError>{error}</FieldError>}
        </div>

        <Button
          type="submit"
          disabled={!key}
          loading={busy}
          size="lg"
          className="mt-5 w-full"
        >
          {busy ? "Checking…" : "Unlock"}
        </Button>
      </form>
    </div>
  );
}
