/**
 * A stand-in for HEALTH, for testing this platform's side of the conversation.
 *
 *   node scripts/stub-health.mjs            # listens on 3457
 *
 * It answers the two endpoints the senior review queue uses and records what it
 * was sent, so a test can assert what left this service rather than what
 * arrived somewhere else. It is not a model of HEALTH and makes no attempt to
 * be one: it checks the key is present, returns what it was told to return, and
 * remembers the decisions it receives.
 *
 * The point of testing against it is that the interesting failures are on this
 * side — a held case offered to the wrong clinician, an author's identity
 * leaking into a payload, a decision recorded twice — and none of them need the
 * real service to reproduce. It also means a test run cannot write a real final
 * answer over a real client's case.
 *
 * Control endpoints, which the real service does not have:
 *   POST /__held      { project, held: [...] }   what to hold
 *   GET  /__received                             what has been sent here
 *   POST /__reset                                forget both
 */
import http from "node:http";

const PORT = Number(process.env.STUB_PORT || 3457);
const KEY_HEADER = (process.env.HEALTH_KEY_HEADER || "x-ops-key").toLowerCase();

let held = new Map();
let adjudications = [];

const json = (res, status, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(payload);
};

const readBody = (req) =>
  new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // Control surface, no key required.
  if (path === "/__reset" && req.method === "POST") {
    held = new Map();
    adjudications = [];
    return json(res, 200, { reset: true });
  }
  if (path === "/__held" && req.method === "POST") {
    const body = await readBody(req);
    held.set(Number(body.project), body.held ?? []);
    return json(res, 200, { holding: (body.held ?? []).length });
  }
  if (path === "/__received") {
    return json(res, 200, { adjudications });
  }

  // Everything else is the real surface, and wants the key.
  if (!req.headers[KEY_HEADER]) {
    return json(res, 403, { detail: "Not authorised." });
  }

  const heldMatch = path.match(/^\/api\/v1\/project\/admin\/held\/(\d+)$/);
  if (heldMatch && req.method === "GET") {
    return json(res, 200, { held: held.get(Number(heldMatch[1])) ?? [] });
  }

  if (path === "/api/v1/project/admin/adjudicate" && req.method === "POST") {
    const body = await readBody(req);
    adjudications.push(body);
    // A settled case stops being held, as the real service would.
    const list = held.get(Number(body.project_id)) ?? [];
    held.set(
      Number(body.project_id),
      list.filter((c) => c.idx !== body.idx)
    );
    return json(res, 200, { recorded: true });
  }

  return json(res, 404, { detail: "No such endpoint." });
});

server.listen(PORT, () => {
  console.log(`  stub HEALTH listening on ${PORT}, key header "${KEY_HEADER}"`);
});
