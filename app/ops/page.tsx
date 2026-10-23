"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Search } from "lucide-react";
import { BrandMark } from "@/components/landing/BrandMark";
import { Alert } from "@/components/ui/Alert";
import { buttonClass, DISABLED } from "@/components/ui/button-class";
import { Input } from "@/components/ui/Field";
import { formatFlagRate } from "@/lib/flag-rate";

/* ── shared plumbing ─────────────────────────────────────────────── */

/** Announced when the console's operator session has lapsed. */
const OPS_LOCKED_EVENT = "senebiclabs:ops-locked";

/**
 * Every call carries the ops cookie; a 403 means the session lapsed. This sits
 * outside React, so it announces the lapse and the console, which has the
 * router, returns to the unlock screen.
 */
async function ops<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/ops${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  if (res.status === 403) {
    window.dispatchEvent(new Event(OPS_LOCKED_EVENT));
    throw new Error("locked");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? "That did not work.");
  return body as T;
}

// No colour on the cell: it inherits text-strong from the table's frame, so a
// cell that needs its own (a name, an expired date) can set one without two
// colour utilities competing on the same element.
const cell = "px-3 py-3 text-[14px] align-middle first:pl-4 last:pr-4";
const head =
  "whitespace-nowrap bg-canvas-top px-3 py-2.5 first:pl-4 last:pr-4 text-left text-label font-medium uppercase text-subtle";
const rowLine = "border-t border-hairline-soft transition-colors hover:bg-accent-soft/30";
const btn = `${buttonClass({ variant: "secondary", size: "sm" })} ${DISABLED}`;
const btnPrimary = `${buttonClass({ size: "sm" })} ${DISABLED}`;
const fmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

function Section({ title, count, action, children }: { title: string; count?: number; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-section text-ink">
          {title}
          {count !== undefined && count > 0 && (
            <span className="tnum rounded-full bg-accent-soft px-2 py-0.5 text-[12px] font-semibold text-accent ring-1 ring-inset ring-accent/25">
              {count}
            </span>
          )}
        </h2>
        {action}
      </div>
      <div className="overflow-x-auto rounded-card border border-hairline bg-surface text-strong shadow-card">{children}</div>
    </section>
  );
}

function Toggle({ on, onClick, busy, labels = ["On", "Off"] }: { on: boolean; onClick: () => void; busy: boolean; labels?: [string, string] | string[] }) {
  return (
    <button onClick={onClick} disabled={busy}
      className={`focusable inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[13px] font-semibold ring-1 ring-inset transition-colors disabled:opacity-40 ${
        on
          ? "bg-accent-soft text-accent ring-accent/35 hover:bg-accent-soft/70"
          : "bg-surface-raised text-muted ring-hairline hover:text-ink"
      }`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${on ? "bg-accent" : "bg-subtle"}`} />
      {on ? labels[0] : labels[1]}
    </button>
  );
}

/* ── types ───────────────────────────────────────────────────────── */

interface Overview {
  clinicians: { total: number; active: number; can_invite: number };
  invites: { pending: number };
  pools: { total: number; open: number; closed: number };
  reviews: { total: number; this_week: number };
}
interface Clinician {
  id: string; email: string; name: string | null; active: boolean;
  can_invite: boolean; joined: string; invited_by: string | null;
  reviews: number; flags: number; flag_rate: number | null; pools: number;
}
interface Pool {
  id: string; name: string; ls_project_id: number; purpose: string;
  review_required: boolean; open_access: boolean; closed_at: string | null; items: number | null;
  reviewed: number; eligible_clinicians: number; senior_clinicians: number;
}
interface Invite {
  id: string; email: string; invited_by: string; sent: string; expires: string | null; expired: boolean;
}
interface AccessRequest {
  id: string; full_name: string; email: string; specialty: string;
  country: string; linkedin_url: string | null; created_at: string;
}

/** The profile path alone, e.g. /in/dr-ama — enough to recognise it at a glance. */
const linkedinPath = (url: string) => {
  try { return new URL(url).pathname.replace(/\/$/, "") || "profile"; } catch { return "profile"; }
};

/* ── access picker ───────────────────────────────────────────────── */

type Access = { id: string; email: string; eligible: boolean; senior: boolean };

function AccessPicker({ pool, onClose, onSaved }: { pool: Pool; onClose: () => void; onSaved: () => void }) {
  const [rows, setRows] = useState<Access[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    ops<{ clinicians: Access[] }>(`/pools/${pool.id}/eligibility`)
      .then((d) => setRows(d.clinicians))
      .catch((e) => setError(String(e.message)));
  }, [pool.id]);

  // Seniority without access is a state the server refuses, so the two move
  // together here: taking a pool away takes the seniority with it.
  const setRow = (id: string, patch: Partial<Access>) =>
    setRows((current) =>
      (current ?? []).map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...patch };
        return next.eligible ? next : { ...next, senior: false };
      })
    );

  const seniorCount = rows?.filter((r) => r.eligible && r.senior).length ?? 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async () => {
    if (!rows) return;
    setBusy(true);
    setError("");
    try {
      await ops(`/pools/${pool.id}/eligibility`, {
        method: "POST",
        body: JSON.stringify({
          clinician_ids: rows.filter((r) => r.eligible).map((r) => r.id),
          senior_ids: rows.filter((r) => r.eligible && r.senior).map((r) => r.id),
        }),
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="access-title"
        className="animate-rise relative w-full max-w-md rounded-card bg-surface-raised p-6 shadow-pop"
      >
        <h3 id="access-title" className="text-section text-ink">Manage access</h3>
        <p className="mt-1 text-[14px] text-strong">
          {pool.name} — only the clinicians ticked here can see this pool.
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          A senior is offered cases where other clinicians disagreed, ahead of
          ordinary work, and never a case they read themselves. Seniority
          applies to this pool only.
        </p>

        <div className="mt-4 max-h-[46vh] space-y-0.5 overflow-y-auto rounded-btn border border-hairline-soft bg-canvas-top p-1.5">
          {!rows && <p className="px-2 py-1.5 text-[14px] text-muted">Loading…</p>}
          {rows?.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 rounded-[6px] px-2.5 py-2 hover:bg-accent-soft/50">
              <label className="flex min-w-0 cursor-pointer items-center gap-2.5">
                <input type="checkbox" checked={r.eligible}
                  onChange={(e) => setRow(r.id, { eligible: e.target.checked })}
                  className="focusable h-4 w-4 accent-accent" />
                <span className="truncate text-[14px] text-ink">{r.email}</span>
              </label>
              <label
                className={`flex shrink-0 items-center gap-1.5 text-[13px] ${
                  r.eligible ? "cursor-pointer text-strong" : "cursor-not-allowed text-subtle"
                }`}
                title={r.eligible ? "Settles disagreements in this pool" : "Give them the pool first"}
              >
                <input type="checkbox" checked={r.senior} disabled={!r.eligible}
                  onChange={(e) => setRow(r.id, { senior: e.target.checked })}
                  className="focusable h-4 w-4 accent-accent" />
                Senior
              </label>
            </div>
          ))}
          {rows?.length === 0 && <p className="px-2 py-1.5 text-[14px] text-muted">No clinicians yet.</p>}
        </div>

        {error && <p role="alert" className="mt-2 text-[14px] text-danger">{error}</p>}

        {rows && seniorCount === 0 && rows.some((r) => r.eligible) && (
          <Alert tone="warning" className="mt-3">
            Nobody is senior here. Every disagreement in this pool will wait for
            an operator to resolve by hand.
          </Alert>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <span className="tnum text-[13px] text-muted">
            {rows?.filter((r) => r.eligible).length ?? 0} of {rows?.length ?? 0} selected
            {seniorCount > 0 && `, ${seniorCount} senior`}
          </span>
          <div className="flex gap-2">
            <button className={btn} onClick={onClose}>Cancel</button>
            <button className={btnPrimary} onClick={save} disabled={busy || !rows}>
              {busy ? "Saving…" : "Save access"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── console ─────────────────────────────────────────────────────── */

export default function OpsConsole() {
  const router = useRouter();

  useEffect(() => {
    const onLocked = () => router.replace("/ops/unlock");
    window.addEventListener(OPS_LOCKED_EVENT, onLocked);
    return () => window.removeEventListener(OPS_LOCKED_EVENT, onLocked);
  }, [router]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [clinicians, setClinicians] = useState<Clinician[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [picker, setPicker] = useState<Pool | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");

  /**
   * Bumped whenever something has changed the data. The effect below owns
   * every fetch, so nothing else has to know how the console is loaded.
   */
  const [reloads, setReloads] = useState(0);
  const refresh = () => setReloads((n) => n + 1);

  /**
   * The one place data is loaded, keyed on the search box and on the reload
   * counter.
   *
   * `cancelled` is what makes the search box safe: typing fires a request per
   * keystroke, and without it a slow response for "sm" can land after a fast
   * one for "smith" and put the wrong rows on screen.
   */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [o, c, p, i, r] = await Promise.all([
          ops<Overview>("/overview"),
          ops<{ clinicians: Clinician[] }>(`/clinicians${search ? `?q=${encodeURIComponent(search)}` : ""}`),
          ops<{ pools: Pool[] }>("/pools"),
          ops<{ invites: Invite[] }>("/invites"),
          ops<{ requests: AccessRequest[] }>("/access-requests"),
        ]);
        if (cancelled) return;
        setOverview(o); setClinicians(c.clinicians); setPools(p.pools); setInvites(i.invites); setRequests(r.requests);
      } catch {
        // A lapsed session has already been sent to the unlock screen by ops().
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [search, reloads]);

  const act = async (
    key: string,
    fn: () => Promise<unknown>,
    message?: string | ((result: unknown) => string)
  ) => {
    setBusy(key); setNotice(null);
    try {
      const result = await fn();
      refresh();
      if (message) setNotice(typeof message === "function" ? message(result) : message);
    } catch (e) {
      setNotice(String((e as Error).message));
    } finally {
      setBusy(null);
    }
  };

  const stats: [string, string][] = overview
    ? [
        ["Contributors", `${overview.clinicians.total}`],
        ["Active", `${overview.clinicians.active}`],
        ["Can invite", `${overview.clinicians.can_invite}`],
        ["Invites pending", `${overview.invites.pending}`],
        ["Pools", `${overview.pools.total} (${overview.pools.open} open / ${overview.pools.closed} closed)`],
        ["Reviews", `${overview.reviews.total}`],
        ["Reviews this week", `${overview.reviews.this_week}`],
      ]
    : [];

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex items-center justify-between gap-4 border-b border-hairline-soft pb-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-btn bg-accent-soft text-accent ring-1 ring-inset ring-accent/30">
            <BrandMark size={19} />
          </span>
          <div>
            <h1 className="flex items-center gap-2 text-[18px] font-bold tracking-[-0.015em] text-ink">
              Operator console
              <span className="rounded-full bg-warning-soft px-2 py-0.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.1em] text-warning ring-1 ring-inset ring-warning/25">
                Internal
              </span>
            </h1>
            <p className="text-[13px] text-subtle">Not part of the clinician platform.</p>
          </div>
        </div>
        <button className={btn}
          onClick={async () => {
            await fetch("/api/ops/session", { method: "DELETE" });
            router.push("/ops/unlock");
            router.refresh();
          }}>
          <Lock size={14} aria-hidden="true" />
          Lock
        </button>
      </header>

      {notice && (
        <Alert role="status" tone="info" className="mt-5">
          {notice}
        </Alert>
      )}

      {/* Overview */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-card border border-hairline bg-surface px-4 py-3.5 shadow-card">
            <p className="text-[12.5px] font-medium text-muted">{label}</p>
            <p className="tnum mt-1.5 text-[20px] font-bold leading-tight tracking-[-0.02em] text-ink">{value}</p>
          </div>
        ))}
        {!overview &&
          Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="h-[78px] animate-pulse-soft rounded-card border border-hairline-soft bg-surface" />
          ))}
      </div>

      {/* Clinicians */}
      <Section title="Clinicians"
        action={
          <div className="relative w-full sm:w-64">
            <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search email or name"
              aria-label="Search clinicians" controlSize="sm" className="pl-9" />
          </div>
        }>
        <table className="w-full min-w-[1120px]">
          <thead><tr>
            <th className={head}>Email</th><th className={head}>Name</th><th className={head}>Joined</th>
            <th className={head}>Invited by</th><th className={head}>Reviews</th>
            <th className={head}>Flags</th>
            <th className={head} title="Flags as a share of the cases they acted on. Flagging is expected; flagging everything is not.">Flag rate</th>
            <th className={head}>Pools</th>
            <th className={head}>Can invite</th><th className={head}>Sessions</th>
          </tr></thead>
          <tbody>
            {clinicians.map((c) => (
              <tr key={c.id} className={rowLine}>
                <td className={`${cell} font-medium text-ink`}>{c.email}</td>
                <td className={`${cell} min-w-[140px]`}>{c.name ?? "—"}</td>
                <td className={`${cell} whitespace-nowrap`}>{fmt(c.joined)}</td>
                <td className={`${cell}`}>{c.invited_by ?? "—"}</td>
                <td className={`${cell} tnum`}>{c.reviews}</td>
                {/* The count and the share, in separate columns. Either alone
                    misleads: 40 flags is unreadable without knowing it is out
                    of 2,000, and 50% is unreadable when it is one flag out of
                    two. */}
                <td className={`${cell} tnum`}>{c.flags}</td>
                <td className={`${cell} tnum`}>{formatFlagRate(c.flag_rate)}</td>
                <td className={`${cell} tnum`}>{c.pools}</td>
                <td className={cell}>
                  <Toggle on={c.can_invite} busy={busy === c.id} labels={["Yes", "No"]}
                    onClick={() => act(c.id,
                      () => ops(`/clinicians/${c.id}/can-invite`, { method: "POST", body: JSON.stringify({ value: !c.can_invite }) }),
                      `${c.email} can ${c.can_invite ? "no longer" : "now"} invite colleagues.`)} />
                </td>
                <td className={cell}>
                  {/* Signs them out everywhere on their next request. Their
                      account, history and pool access are untouched. */}
                  <button className={`${btn} whitespace-nowrap`} disabled={busy === `s-${c.id}`}
                    onClick={() => {
                      if (!confirm(`End every session ${c.email} is signed in with? They are signed out on every device on their next request, and can sign in again.`)) return;
                      act(`s-${c.id}`,
                        () => ops<{ revoked: number }>(`/clinicians/${c.id}/revoke-sessions`, { method: "POST" }),
                        (result) => {
                          const n = (result as { revoked: number }).revoked;
                          return n === 0
                            ? `${c.email} had no live sessions.`
                            : `Ended ${n} session${n === 1 ? "" : "s"} for ${c.email}.`;
                        });
                    }}>
                    End sessions
                  </button>
                </td>
              </tr>
            ))}
            {clinicians.length === 0 && (
              <tr><td colSpan={10} className={`${cell} py-8 text-center text-muted`}>No clinicians match.</td></tr>
            )}
          </tbody>
        </table>
      </Section>

      {/* Pools */}
      <Section title="Pools">
        <table className="w-full min-w-[1120px]">
          <thead><tr>
            <th className={head}>Pool</th><th className={head}>Project</th><th className={head}>Purpose</th>
            <th className={head}>Review</th><th className={head}>Items</th><th className={head}>Reviewed</th>
            <th className={head}>Eligible</th><th className={head}>Seniors</th>
            <th className={head} title="Whether clinicians are still offered this pool. Closed refuses submissions too.">Taking work</th>
            <th className={head}>Access</th><th className={head} />
          </tr></thead>
          <tbody>
            {pools.map((p) => (
              <tr key={p.id} className={rowLine}>
                <td className={`${cell} min-w-[190px] font-medium text-ink`}>{p.name}</td>
                <td className={`${cell} tnum`}>{p.ls_project_id}</td>
                <td className={`${cell} capitalize`}>{p.purpose}</td>
                <td className={`${cell}`}>{p.review_required ? "two-phase" : "—"}</td>
                <td className={`${cell} tnum`}>{p.items ?? "—"}</td>
                <td className={`${cell} tnum`}>{p.reviewed}</td>
                <td className={`${cell} tnum`}>{p.eligible_clinicians}</td>
                {/*
                  Worth seeing before work starts, not when a case sticks: a
                  pool with nobody senior has no way to settle a disagreement
                  except an operator doing it by hand.
                */}
                <td className={cell}>
                  {p.senior_clinicians > 0 ? (
                    <span className="tnum">{p.senior_clinicians}</span>
                  ) : (
                    <span
                      className="font-semibold text-danger"
                      title="No senior clinician: every disagreement here falls back to an operator"
                    >
                      none
                    </span>
                  )}
                </td>
                {/*
                  Not the same control as access. That one decides who is
                  granted the pool; this decides whether the pool is still being
                  worked at all, which is the fact no count can tell you — a
                  project can be delivered downstream with cases still under the
                  ceiling, and readings taken after that are work nobody asked
                  for.
                */}
                <td className={cell}>
                  <Toggle on={!p.closed_at} busy={busy === `work-${p.id}`} labels={["Taking work", "Closed"]}
                    onClick={() => {
                      const closing = !p.closed_at;
                      if (closing && !confirm(`Close ${p.name}? Clinicians stop being offered it, and submissions to it are refused.`)) return;
                      act(`work-${p.id}`,
                        () => ops(`/pools/${p.id}/closed`, { method: "POST", body: JSON.stringify({ value: closing }) }),
                        closing
                          ? `${p.name} is closed. It is no longer offered, and submissions are refused.`
                          : `${p.name} is taking work again.`);
                    }} />
                </td>
                <td className={cell}>
                  <Toggle on={p.open_access} busy={busy === p.id} labels={["Open", "Closed"]}
                    onClick={() => act(p.id,
                      () => ops(`/pools/${p.id}/open-access`, { method: "POST", body: JSON.stringify({ value: !p.open_access }) }),
                      p.open_access
                        ? `${p.name} closed to new grants. Existing access is unchanged — use Close & revoke all to remove it.`
                        : `${p.name} is open. Clinicians receive it on their next sign-in.`)} />
                </td>
                <td className={`${cell} whitespace-nowrap text-right`}>
                  <button className={`${btn} mr-2`} onClick={() => setPicker(p)}>Manage access</button>
                  <button className={btn} disabled={busy === `revoke-${p.id}`}
                    onClick={() => {
                      if (!confirm(`Close ${p.name} and revoke access for all ${p.eligible_clinicians} clinician(s)?`)) return;
                      act(`revoke-${p.id}`,
                        () => ops(`/pools/${p.id}/revoke-all`, { method: "POST" }),
                        `${p.name} closed and all access revoked.`);
                    }}>
                    Close &amp; revoke all
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* Access requests. Review only: nothing here sends an invitation. If
          someone is a fit, reach out, then invite them from Invites below. */}
      <Section title="Access requests" count={requests.length}>
        <table className="w-full min-w-[880px]">
          <thead><tr>
            <th className={head}>Name</th><th className={head}>Email</th><th className={head}>Specialty</th>
            <th className={head}>Country</th><th className={head}>LinkedIn</th>
            <th className={head}>Received</th><th className={head} />
          </tr></thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id} className={rowLine}>
                <td className={`${cell} font-medium text-ink`}>{r.full_name}</td>
                <td className={`${cell}`}>{r.email}</td>
                <td className={`${cell}`}>{r.specialty}</td>
                <td className={`${cell}`}>{r.country}</td>
                <td className={cell}>
                  {r.linkedin_url ? (
                    // Only https on linkedin.com gets this far — the API and the
                    // table's CHECK both hold that line — and it opens without a
                    // referrer or opener handle.
                    <a href={r.linkedin_url} target="_blank" rel="noopener noreferrer nofollow"
                      className="focusable rounded-btn text-accent underline-offset-4 hover:underline">
                      {linkedinPath(r.linkedin_url)}
                    </a>
                  ) : (
                    <span className="text-subtle">—</span>
                  )}
                </td>
                <td className={`${cell} whitespace-nowrap`}>{fmt(r.created_at)}</td>
                <td className={`${cell} whitespace-nowrap text-right`}>
                  <button className={btn} disabled={busy === `req-${r.id}`}
                    onClick={() => act(`req-${r.id}`,
                      () => ops(`/access-requests/${r.id}/review`, { method: "POST" }),
                      `Request from ${r.email} marked reviewed.`)}>
                    Mark reviewed
                  </button>
                </td>
              </tr>
            ))}
            {requests.length === 0 && (
              <tr><td colSpan={7} className={`${cell} py-8 text-center text-muted`}>No requests waiting.</td></tr>
            )}
          </tbody>
        </table>
      </Section>

      {/* Invites */}
      <Section title="Invites"
        action={
          <form className="flex w-full gap-2 sm:w-auto"
            onSubmit={(e) => {
              e.preventDefault();
              act("invite",
                () => ops("/invites", { method: "POST", body: JSON.stringify({ email: inviteEmail }) }),
                `Invitation sent to ${inviteEmail}.`).then(() => setInviteEmail(""));
            }}>
            <Input type="email" required value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="colleague@hospital.org" aria-label="Email to invite"
              controlSize="sm" className="min-w-0 sm:w-64" />
            <button type="submit" className={btnPrimary} disabled={busy === "invite"}>
              {busy === "invite" ? "Sending…" : "Send invite"}
            </button>
          </form>
        }>
        <table className="w-full min-w-[720px]">
          <thead><tr>
            <th className={head}>Email</th><th className={head}>Invited by</th>
            <th className={head}>Sent</th><th className={head}>Expires</th><th className={head} />
          </tr></thead>
          <tbody>
            {invites.map((i) => (
              <tr key={i.id} className={rowLine}>
                <td className={`${cell} font-medium text-ink`}>{i.email}</td>
                <td className={`${cell}`}>{i.invited_by}</td>
                <td className={`${cell}`}>{fmt(i.sent)}</td>
                <td className={`${cell} ${i.expired ? "text-danger" : ""}`}>
                  {fmt(i.expires)}{i.expired ? " (expired)" : ""}
                </td>
                <td className={`${cell} text-right`}>
                  <button className={btn} disabled={busy === i.id}
                    onClick={() => act(i.id,
                      () => ops(`/invites/${i.id}/revoke`, { method: "POST" }),
                      `Invitation to ${i.email} revoked.`)}>
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
            {invites.length === 0 && (
              <tr><td colSpan={5} className={`${cell} py-8 text-center text-muted`}>No invitations pending.</td></tr>
            )}
          </tbody>
        </table>
      </Section>

      {/* Saving access changes the eligible counts, so the console reloads
          rather than only announcing it. */}
      {picker && (
        <AccessPicker
          pool={picker}
          onClose={() => setPicker(null)}
          onSaved={() => {
            setNotice("Access updated.");
            refresh();
          }}
        />
      )}
    </div>
  );
}
