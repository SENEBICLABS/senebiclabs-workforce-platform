"use client";

import { useState } from "react";

export default function Unlock() {
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
      window.location.href = "/ops";
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <form onSubmit={submit} className="w-full max-w-[360px]">
        <h1 className="text-[15px] font-semibold tracking-tight text-white">
          Operator console
        </h1>
        <p className="mt-1 text-[13px] text-white">
          This area is not part of the clinician platform.
        </p>

        <label htmlFor="key" className="mt-6 mb-1.5 block text-[11px] uppercase tracking-wider text-white">
          Operator key
        </label>
        <input
          id="key"
          type="password"
          autoFocus
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className="h-10 w-full rounded-md border border-white/15 bg-black/20 px-3 font-mono text-[13px] text-white outline-none focus:border-[#0E7C74]"
        />
        {error && <p role="alert" className="mt-2 text-[13px] text-[#F2A9A9]">{error}</p>}

        <button
          type="submit"
          disabled={busy || !key}
          className="mt-4 h-10 w-full rounded-md bg-[#0E7C74] text-[14px] font-medium text-white disabled:opacity-40"
        >
          {busy ? "Checking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}
