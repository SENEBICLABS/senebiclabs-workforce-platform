"use client";

import { useCallback, useEffect, useState } from "react";

/* ── shared plumbing ─────────────────────────────────────────────── */

/** Every call carries the ops cookie; a 403 means the session lapsed. */
async function ops<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/ops${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  if (res.status === 403) {
    window.location.href = "/ops/unlock";
    throw new Error("locked");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? "That did not work.");
  return body as T;
}

const cell = "px-3 py-2 text-[13px] align-middle";
const head = "px-3 py-2 text-[11px] uppercase tracking-wider text-[#A8BDBA] text-left font-medium";
const rowLine = "border-t border-white/10";
const btn =
  "rounded-md border border-white/15 px-2.5 py-1 text-[12px] text-white hover:bg-white/10 disabled:opacity-40";
const btnPrimary =
  "rounded-md bg-[#0E7C74] px-3 py-1.5 text-[13px] font-medium text-white hover:bg-[#0A5A54] disabled:opacity-40";
const fmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-[#A8BDBA]">{title}</h2>
        {action}
      </div>
      <div className="overflow-x-auto rounded-lg border border-white/10 bg-black/20">{children}</div>
    </section>
  );
}

function Toggle({ on, onClick, busy, labels = ["On", "Off"] }: { on: boolean; onClick: () => void; busy: boolean; labels?: [string, string] | string[] }) {
  return (
    <button onClick={onClick} disabled={busy}
      className={`rounded-md px-2.5 py-1 text-[12px] font-medium disabled:opacity-40 ${
        on ? "bg-[#0E7C74] text-white" : "border border-white/15 text-[#A8BDBA] hover:bg-white/10"
      }`}>
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
  reviews: number; pools: number;
}
interface Pool {
  id: string; name: string; ls_project_id: number; purpose: string;
  review_required: boolean; open_access: boolean; items: number | null;
  reviewed: number; eligible_clinicians: number;
}
interface Invite {
  id: string; email: string; invited_by: string; sent: string; expires: string | null; expired: boolean;
}
interface AccessRequest {
  id: string; full_name: string; email: string; specialty: string; credential: string;
  country: string; profile_url: string | null; referred_by: string | null; created_at: string;
}

/** The host alone, which is what an operator needs to judge a profile link at a glance. */
const hostOf = (url: string) => {
  try { return new URL(url).host; } catch { return "link"; }
};

/* ── access picker ───────────────────────────────────────────────── */

function AccessPicker({ pool, onClose, onSaved }: { pool: Pool; onClose: () => void; onSaved: () => void }) {
  const [rows, setRows] = useState<{ id: string; email: string; eligible: boolean }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    ops<{ clinicians: { id: string; email: string; eligible: boolean }[] }>(`/pools/${pool.id}/eligibility`)
      .then((d) => setRows(d.clinicians))
      .catch((e) => setError(String(e.message)));
  }, [pool.id]);

  const save = async () => {
    if (!rows) return;
    setBusy(true);
    setError("");
    try {
      await ops(`/pools/${pool.id}/eligibility`, {
        method: "POST",
        body: JSON.stringify({ clinician_ids: rows.filter((r) => r.eligible).map((r) => r.id) }),
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
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-lg border border-white/15 bg-[#0C2422] p-5">
        <h3 className="text-[14px] font-semibold text-white">Manage access</h3>
        <p className="mt-1 text-[12px] text-[#A8BDBA]">
          {pool.name} — only the clinicians ticked here can see this pool.
        </p>

        <div className="mt-4 max-h-[46vh] space-y-1 overflow-y-auto">
          {!rows && <p className="text-[13px] text-[#A8BDBA]">Loading…</p>}
          {rows?.map((r) => (
            <label key={r.id} className="flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 hover:bg-white/5">
              <input type="checkbox" checked={r.eligible}
                onChange={(e) => setRows(rows.map((x) => (x.id === r.id ? { ...x, eligible: e.target.checked } : x)))}
                className="h-3.5 w-3.5 accent-[#0E7C74]" />
              <span className="text-[13px] text-white">{r.email}</span>
            </label>
          ))}
          {rows?.length === 0 && <p className="text-[13px] text-[#A8BDBA]">No clinicians yet.</p>}
        </div>

        {error && <p role="alert" className="mt-2 text-[12px] text-[#F2A9A9]">{error}</p>}

        <div className="mt-4 flex items-center justify-between">
          <span className="text-[12px] text-[#A8BDBA]">
            {rows?.filter((r) => r.eligible).length ?? 0} of {rows?.length ?? 0} selected
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

  const load = useCallback(async () => {
    const [o, c, p, i, r] = await Promise.all([
      ops<Overview>("/overview"),
      ops<{ clinicians: Clinician[] }>(`/clinicians${search ? `?q=${encodeURIComponent(search)}` : ""}`),
      ops<{ pools: Pool[] }>("/pools"),
      ops<{ invites: Invite[] }>("/invites"),
      ops<{ requests: AccessRequest[] }>("/access-requests"),
    ]);
    setOverview(o); setClinicians(c.clinicians); setPools(p.pools); setInvites(i.invites); setRequests(r.requests);
  }, [search]);

  useEffect(() => { load().catch(() => {}); }, [load]);

  const act = async (key: string, fn: () => Promise<unknown>, message?: string) => {
    setBusy(key); setNotice(null);
    try {
      await fn();
      await load();
      if (message) setNotice(message);
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
    <div className="mx-auto max-w-[1180px] px-6 py-6">
      <header className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h1 className="text-[15px] font-semibold tracking-tight text-white">Operator console</h1>
          <p className="text-[12px] text-[#A8BDBA]">Not part of the clinician platform.</p>
        </div>
        <button className={btn}
          onClick={() => fetch("/api/ops/session", { method: "DELETE" }).then(() => (window.location.href = "/ops/unlock"))}>
          Lock
        </button>
      </header>

      {notice && (
        <p role="status" className="mt-4 rounded-md border border-white/15 bg-black/30 px-3 py-2 text-[13px] text-white">
          {notice}
        </p>
      )}

      {/* Overview */}
      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wider text-[#A8BDBA]">{label}</p>
            <p className="mt-1 font-mono text-[16px] text-white">{value}</p>
          </div>
        ))}
      </div>

      {/* Clinicians */}
      <Section title="Clinicians"
        action={
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search email or name"
            className="h-8 w-56 rounded-md border border-white/15 bg-black/20 px-2.5 text-[13px] text-white outline-none focus:border-[#0E7C74]" />
        }>
        <table className="w-full min-w-[860px]">
          <thead><tr>
            <th className={head}>Email</th><th className={head}>Name</th><th className={head}>Joined</th>
            <th className={head}>Invited by</th><th className={head}>Reviews</th><th className={head}>Pools</th>
            <th className={head}>Can invite</th>
          </tr></thead>
          <tbody>
            {clinicians.map((c) => (
              <tr key={c.id} className={rowLine}>
                <td className={`${cell} text-white`}>{c.email}</td>
                <td className={`${cell} text-[#A8BDBA]`}>{c.name ?? "—"}</td>
                <td className={`${cell} text-[#A8BDBA]`}>{fmt(c.joined)}</td>
                <td className={`${cell} text-[#A8BDBA]`}>{c.invited_by ?? "—"}</td>
                <td className={`${cell} font-mono text-white`}>{c.reviews}</td>
                <td className={`${cell} font-mono text-white`}>{c.pools}</td>
                <td className={cell}>
                  <Toggle on={c.can_invite} busy={busy === c.id} labels={["Yes", "No"]}
                    onClick={() => act(c.id,
                      () => ops(`/clinicians/${c.id}/can-invite`, { method: "POST", body: JSON.stringify({ value: !c.can_invite }) }),
                      `${c.email} can ${c.can_invite ? "no longer" : "now"} invite colleagues.`)} />
                </td>
              </tr>
            ))}
            {clinicians.length === 0 && (
              <tr><td colSpan={7} className={`${cell} text-[#A8BDBA]`}>No clinicians match.</td></tr>
            )}
          </tbody>
        </table>
      </Section>

      {/* Pools */}
      <Section title="Pools">
        <table className="w-full min-w-[980px]">
          <thead><tr>
            <th className={head}>Pool</th><th className={head}>Project</th><th className={head}>Purpose</th>
            <th className={head}>Review</th><th className={head}>Items</th><th className={head}>Reviewed</th>
            <th className={head}>Eligible</th><th className={head}>Access</th><th className={head} />
          </tr></thead>
          <tbody>
            {pools.map((p) => (
              <tr key={p.id} className={rowLine}>
                <td className={`${cell} text-white`}>{p.name}</td>
                <td className={`${cell} font-mono text-[#A8BDBA]`}>{p.ls_project_id}</td>
                <td className={`${cell} text-[#A8BDBA]`}>{p.purpose}</td>
                <td className={`${cell} text-[#A8BDBA]`}>{p.review_required ? "two-phase" : "—"}</td>
                <td className={`${cell} font-mono text-white`}>{p.items ?? "—"}</td>
                <td className={`${cell} font-mono text-white`}>{p.reviewed}</td>
                <td className={`${cell} font-mono text-white`}>{p.eligible_clinicians}</td>
                <td className={cell}>
                  <Toggle on={p.open_access} busy={busy === p.id} labels={["Open", "Closed"]}
                    onClick={() => act(p.id,
                      () => ops(`/pools/${p.id}/open-access`, { method: "POST", body: JSON.stringify({ value: !p.open_access }) }),
                      p.open_access
                        ? `${p.name} closed to new grants. Existing access is unchanged — use Close & revoke all to remove it.`
                        : `${p.name} is open. Clinicians receive it on their next sign-in.`)} />
                </td>
                <td className={`${cell} whitespace-nowrap text-right`}>
                  <button className={btn} onClick={() => setPicker(p)}>Manage access</button>{" "}
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

      {/* Access requests — above invites, because this is where invitations start. */}
      <Section title={`Access requests${requests.length ? ` (${requests.length})` : ""}`}>
        <table className="w-full min-w-[1080px]">
          <thead><tr>
            <th className={head}>Name</th><th className={head}>Email</th><th className={head}>Specialty</th>
            <th className={head}>Credential</th><th className={head}>Country</th><th className={head}>Profile</th>
            <th className={head}>Referred by</th><th className={head}>Received</th><th className={head} />
          </tr></thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id} className={rowLine}>
                <td className={`${cell} text-white`}>{r.full_name}</td>
                <td className={`${cell} text-[#A8BDBA]`}>{r.email}</td>
                <td className={`${cell} text-white`}>{r.specialty}</td>
                <td className={`${cell} text-[#A8BDBA]`}>{r.credential}</td>
                <td className={`${cell} text-[#A8BDBA]`}>{r.country}</td>
                <td className={cell}>
                  {r.profile_url ? (
                    // Validated as http(s) at the API and by the table's CHECK,
                    // and opened without a referrer or opener handle.
                    <a href={r.profile_url} target="_blank" rel="noopener noreferrer nofollow"
                      className="text-[#6ADABD] underline-offset-2 hover:underline">
                      {hostOf(r.profile_url)}
                    </a>
                  ) : (
                    <span className="text-[#A8BDBA]">—</span>
                  )}
                </td>
                <td className={`${cell} text-[#A8BDBA]`}>{r.referred_by ?? "—"}</td>
                <td className={`${cell} text-[#A8BDBA]`}>{fmt(r.created_at)}</td>
                <td className={`${cell} whitespace-nowrap text-right`}>
                  <button className={btnPrimary} disabled={busy === `req-${r.id}`}
                    onClick={() => act(`req-${r.id}`,
                      () => ops(`/access-requests/${r.id}/invite`, { method: "POST" }),
                      `Invitation sent to ${r.email}.`)}>
                    Invite
                  </button>{" "}
                  <button className={btn} disabled={busy === `req-${r.id}`}
                    onClick={() => {
                      if (!confirm(`Decline the request from ${r.full_name}? They will not be notified.`)) return;
                      act(`req-${r.id}`,
                        () => ops(`/access-requests/${r.id}/decline`, { method: "POST" }),
                        `Request from ${r.email} declined.`);
                    }}>
                    Decline
                  </button>
                </td>
              </tr>
            ))}
            {requests.length === 0 && (
              <tr><td colSpan={9} className={`${cell} text-[#A8BDBA]`}>No requests waiting.</td></tr>
            )}
          </tbody>
        </table>
      </Section>

      {/* Invites */}
      <Section title="Invites"
        action={
          <form className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              act("invite",
                () => ops("/invites", { method: "POST", body: JSON.stringify({ email: inviteEmail }) }),
                `Invitation sent to ${inviteEmail}.`).then(() => setInviteEmail(""));
            }}>
            <input type="email" required value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="colleague@hospital.org"
              className="h-8 w-56 rounded-md border border-white/15 bg-black/20 px-2.5 text-[13px] text-white outline-none focus:border-[#0E7C74]" />
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
                <td className={`${cell} text-white`}>{i.email}</td>
                <td className={`${cell} text-[#A8BDBA]`}>{i.invited_by}</td>
                <td className={`${cell} text-[#A8BDBA]`}>{fmt(i.sent)}</td>
                <td className={`${cell} ${i.expired ? "text-[#F2A9A9]" : "text-[#A8BDBA]"}`}>
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
              <tr><td colSpan={5} className={`${cell} text-[#A8BDBA]`}>No invitations pending.</td></tr>
            )}
          </tbody>
        </table>
      </Section>

      {picker && <AccessPicker pool={picker} onClose={() => setPicker(null)} onSaved={() => setNotice("Access updated.")} />}
    </div>
  );
}
