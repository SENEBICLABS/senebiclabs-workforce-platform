import { afterEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";

/**
 * The operator cookie used to be signed with JWT_SECRET ?? "missing-jwt-secret".
 * With the variable unset, that literal is a public constant, and anyone could
 * sign their own operator cookie with it. It now uses the fail-closed secret
 * from lib/secrets.ts.
 *
 * lib/secrets.ts caches a secret once loaded, so each case loads the module
 * fresh with the environment it needs.
 */

vi.mock("server-only", () => ({}));

const ORIGINAL = process.env.JWT_SECRET;

afterEach(() => {
  process.env.JWT_SECRET = ORIGINAL;
  vi.resetModules();
});

async function loadWithSecret(value: string | undefined) {
  if (value === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = value;
  vi.resetModules();
  return import("../lib/ops-auth");
}

const forgeWith = (secret: string) =>
  new SignJWT({ ops: true })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("8h")
    .sign(new TextEncoder().encode(secret));

describe("operator cookies", () => {
  it("refuses a cookie forged with the old public fallback when no secret is set", async () => {
    const { verifyOpsToken } = await loadWithSecret(undefined);
    expect(await verifyOpsToken(await forgeWith("missing-jwt-secret"))).toBe(false);
  });

  it("will not issue a cookie when no secret is set", async () => {
    const { issueOpsToken } = await loadWithSecret(undefined);
    await expect(issueOpsToken()).rejects.toThrow(/JWT_SECRET/);
  });

  it("issues and accepts its own cookie when the secret is set", async () => {
    const { issueOpsToken, verifyOpsToken } = await loadWithSecret(ORIGINAL);
    expect(await verifyOpsToken(await issueOpsToken())).toBe(true);
  });

  it("refuses a cookie signed with anything else", async () => {
    const { verifyOpsToken } = await loadWithSecret(ORIGINAL);
    expect(await verifyOpsToken(await forgeWith("some-other-secret-that-is-long-enough"))).toBe(false);
  });
});
