import { NextRequest, NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { removalLinkIsValid, removeAccessRequest } from "@/lib/access-requests";

export const dynamic = "force-dynamic";

/**
 * Removes an address from the list, given a signed removal link.
 *
 * Two callers:
 *
 *   - The confirm button on /request-access/remove, a plain form POST. It is
 *     answered with a 303, so the browser follows with a GET to the result
 *     page rather than re-posting to it.
 *   - A mail app's own unsubscribe button (RFC 8058 one-click), which POSTs
 *     "List-Unsubscribe=One-Click" to the URL in the email's header, with the
 *     id and signature in the query. It is answered with a bare status.
 *
 * POST only. Removal is never done on a GET, because mail security scanners
 * open every link in a message, and would otherwise take people off the list
 * without them ever clicking.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const field = (name: string) => form?.get(name) ?? req.nextUrl.searchParams.get(name);
  const oneClick = form?.get("List-Unsubscribe") === "One-Click";

  const answer = (state: string, status: number) =>
    oneClick
      ? new NextResponse(null, { status })
      : NextResponse.redirect(new URL(`/request-access/remove?${state}`, req.nextUrl.origin), 303);

  const limited = rateLimit(`access-remove:ip:${clientIp(req)}`, { max: 20, windowSeconds: 3600 });
  if (!limited.ok) return answer("error=failed", 429);

  const id = field("id");
  if (!removalLinkIsValid(id, field("sig"))) return answer("error=invalid", 400);

  const removed = await removeAccessRequest(id as string);
  if (!removed.ok) return answer("error=failed", 503);

  return answer("removed=1", 200);
}
