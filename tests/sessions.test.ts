import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { SignJWT } from "jose";
import { NextRequest } from "next/server";

/**
 * Revocable sessions.
 *
 * The database is an in-memory table that applies the same filters the code
 * sends (eq, is, gt, order, limit), rather than a mock that returns whatever a
 * test tells it to. So "a revoked session is refused" is proven by the query
 * verifySessionToken actually builds: if it forgot to filter on revoked_at,
 * that test would fail.
 */

type Row = Record<string, unknown>;
type DbError = { code: string; message: string };
type Result = { data: Row[] | null; error: DbError | null };

const fake = vi.hoisted(() => {
  const state = {
    tables: {} as Record<string, Row[]>,
    /** Make the next session insert fail as a lost connection would. */
    failSessionInsert: false,
  };
  const unique: Record<string, string[]> = { sessions: ["token"] };
  let seq = 0;

  class Query {
    private filters: ((r: Row) => boolean)[] = [];
    private op: "select" | "insert" | "update" | "delete" = "select";
    private patch: Row = {};
    private row: Row = {};
    private cap: number | null = null;

    constructor(private readonly table: string) {}

    select() {
      return this;
    }
    eq(column: string, value: unknown) {
      this.filters.push((r) => r[column] === value);
      return this;
    }
    is(column: string, value: unknown) {
      this.filters.push((r) => (r[column] ?? null) === value);
      return this;
    }
    gt(column: string, value: string) {
      this.filters.push((r) => typeof r[column] === "string" && (r[column] as string) > value);
      return this;
    }
    order() {
      return this;
    }
    limit(n: number) {
      this.cap = n;
      return this;
    }
    insert(row: Row) {
      this.op = "insert";
      this.row = row;
      return this;
    }
    update(patch: Row) {
      this.op = "update";
      this.patch = patch;
      return this;
    }
    delete() {
      this.op = "delete";
      return this;
    }

    private run(): Result {
      const rows = (state.tables[this.table] ??= []);
      if (this.op === "insert") {
        if (this.table === "sessions" && state.failSessionInsert) {
          return { data: null, error: { code: "08006", message: "connection failure" } };
        }
        for (const column of unique[this.table] ?? []) {
          if (rows.some((r) => r[column] === this.row[column])) {
            return { data: null, error: { code: "23505", message: "duplicate key" } };
          }
        }
        const inserted: Row = { id: `row-${++seq}`, revoked_at: null, ...this.row };
        rows.push(inserted);
        return { data: [inserted], error: null };
      }

      const hit = rows.filter((r) => this.filters.every((f) => f(r)));
      if (this.op === "update") {
        hit.forEach((r) => Object.assign(r, this.patch));
        return { data: hit, error: null };
      }
      if (this.op === "delete") {
        state.tables[this.table] = rows.filter((r) => !hit.includes(r));
        return { data: hit, error: null };
      }
      return { data: this.cap === null ? hit : hit.slice(0, this.cap), error: null };
    }

    maybeSingle() {
      const { data, error } = this.run();
      return Promise.resolve({ data: data?.[0] ?? null, error });
    }
    single() {
      const { data, error } = this.run();
      if (error) return Promise.resolve({ data: null, error });
      if (!data?.length) return Promise.resolve({ data: null, error: { code: "PGRST116", message: "no rows" } });
      return Promise.resolve({ data: data[0], error: null });
    }
    then<T>(resolve: (value: Result) => T, reject?: (reason: unknown) => T) {
      return Promise.resolve(this.run()).then(resolve, reject);
    }
  }

  return { state, from: (table: string) => new Query(table) };
});

vi.mock("server-only", () => ({}));
vi.mock("../lib/supabase", () => ({ supabaseAdmin: { from: fake.from } }));
// Granting pool access is not what is under test, and it touches other tables.
vi.mock("../lib/access", () => ({ grantDirectAccess: async () => 0 }));

import { verifySessionToken } from "../lib/auth";
import { signInOrReject } from "../lib/auth-gate";
import { POST as signOut } from "../app/api/auth/sign-out/route";
import { POST as revokeSessions } from "../app/api/ops/clinicians/[id]/revoke-sessions/route";

/* ── helpers ─────────────────────────────────────────────────────── */

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET);
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

function signSession(clinicianId: string, email: string) {
  return new SignJWT({ clinicianId, email })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(randomBytes(8).toString("hex"))
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(SECRET);
}

function addSessionRow(
  token: string,
  clinicianId: string,
  { expires = inDays(7), revoked = null as string | null } = {}
) {
  fake.state.tables.sessions.push({
    id: `s-${fake.state.tables.sessions.length + 1}`,
    clinician_id: clinicianId,
    token: hash(token),
    expires_at: expires,
    revoked_at: revoked,
  });
}

async function liveSession(clinicianId: string, email: string) {
  const token = await signSession(clinicianId, email);
  addSessionRow(token, clinicianId);
  return token;
}

const A = { id: "clin-a", email: "a@example.org" };
const B = { id: "clin-b", email: "b@example.org" };

beforeEach(() => {
  fake.state.tables = {
    sessions: [],
    clinicians: [
      { id: A.id, email: A.email, active: true, created_at: "2026-01-01T00:00:00Z" },
      { id: B.id, email: B.email, active: true, created_at: "2026-01-02T00:00:00Z" },
    ],
  };
  fake.state.failSessionInsert = false;
});

/* ── verification ────────────────────────────────────────────────── */

describe("verifySessionToken", () => {
  it("accepts a signed token whose row is live", async () => {
    const token = await liveSession(A.id, A.email);
    expect(await verifySessionToken(token)).toEqual({ clinicianId: A.id, email: A.email });
  });

  it("refuses a revoked session", async () => {
    const token = await signSession(A.id, A.email);
    addSessionRow(token, A.id, { revoked: new Date().toISOString() });
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("refuses a session whose row has expired", async () => {
    const token = await signSession(A.id, A.email);
    addSessionRow(token, A.id, { expires: inDays(-1) });
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("refuses a validly signed token that has no row", async () => {
    const token = await signSession(A.id, A.email);
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("refuses a row that belongs to a different clinician", async () => {
    const token = await signSession(A.id, A.email);
    addSessionRow(token, B.id);
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("still refuses a bad signature, whatever the table says", async () => {
    const forged = await new SignJWT({ clinicianId: A.id, email: A.email })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .sign(new TextEncoder().encode("not-the-secret-but-long-enough-to-sign-with"));
    addSessionRow(forged, A.id);
    expect(await verifySessionToken(forged)).toBeNull();
  });
});

/* ── issuing ─────────────────────────────────────────────────────── */

describe("issuing a session", () => {
  it("issues no session when the insert fails", async () => {
    fake.state.failSessionInsert = true;
    const result = await signInOrReject({ kind: "authenticated", email: A.email });
    expect(result).toEqual({ ok: false, reason: "unavailable" });
    expect(fake.state.tables.sessions).toHaveLength(0);
  });

  it("issues a working session when the insert succeeds", async () => {
    const result = await signInOrReject({ kind: "authenticated", email: A.email });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(fake.state.tables.sessions).toHaveLength(1);
    expect(await verifySessionToken(result.sessionToken)).toEqual({
      clinicianId: A.id,
      email: A.email,
    });
  });

  it("gives every sign-in its own token, even in the same second", async () => {
    const first = await signInOrReject({ kind: "authenticated", email: A.email });
    const second = await signInOrReject({ kind: "authenticated", email: A.email });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.sessionToken).not.toBe(second.sessionToken);
    expect(fake.state.tables.sessions).toHaveLength(2);
  });
});

/* ── sign-out ────────────────────────────────────────────────────── */

describe("sign-out", () => {
  it("ends the session it is called with, and only that one", async () => {
    const here = await liveSession(A.id, A.email);
    const elsewhere = await liveSession(A.id, A.email);

    const res = await signOut(
      new NextRequest("http://localhost/api/auth/sign-out", {
        method: "POST",
        headers: { cookie: `sessionToken=${here}` },
      })
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/sessionToken=;/);
    expect(await verifySessionToken(here)).toBeNull();
    expect(await verifySessionToken(elsewhere)).not.toBeNull();
  });
});

/* ── ops: end every session for one clinician ────────────────────── */

describe("POST /api/ops/clinicians/[id]/revoke-sessions", () => {
  const call = (id: string, headers: Record<string, string> = { "x-ops-key": "test-ops-key" }) =>
    revokeSessions(
      new NextRequest(`http://localhost/api/ops/clinicians/${id}/revoke-sessions`, {
        method: "POST",
        headers,
      }),
      { params: Promise.resolve({ id }) }
    );

  it("ends every session for that clinician and no one else's", async () => {
    const a1 = await liveSession(A.id, A.email);
    const a2 = await liveSession(A.id, A.email);
    const b1 = await liveSession(B.id, B.email);

    const res = await call(A.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ clinician: A.email, revoked: 2 });

    expect(await verifySessionToken(a1)).toBeNull();
    expect(await verifySessionToken(a2)).toBeNull();
    expect(await verifySessionToken(b1)).toEqual({ clinicianId: B.id, email: B.email });
  });

  it("is refused without the operator key, and ends nothing", async () => {
    const a1 = await liveSession(A.id, A.email);
    const res = await call(A.id, {});
    expect(res.status).toBe(403);
    expect(await verifySessionToken(a1)).not.toBeNull();
  });

  it("says so when there is no such clinician", async () => {
    const res = await call("clin-nobody");
    expect(res.status).toBe(404);
  });
});
