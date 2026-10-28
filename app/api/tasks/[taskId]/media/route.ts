import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { supabaseAdmin } from "@/lib/supabase";
import {
  FORBIDDEN,
  POOL_CLOSED,
  requireEligiblePoolForTask,
  type GatedPool,
} from "@/lib/gate";
import { isImageTask, type RawEvalConfig } from "@/lib/eval-config";
import { IMAGE_BUCKET, resolveImageSource } from "@/lib/media";

export const dynamic = "force-dynamic";

/** Long enough to load and zoom; short enough that a copied link soon stops working. */
const SIGNED_URL_SECONDS = 300;

const NO_IMAGE = () =>
  NextResponse.json({ error: "This case has no image to show." }, { status: 404 });

/**
 * A case's image, for a clinician the gate admits to that case.
 *
 * The workspace shows <img src="/api/tasks/{id}/media">; the image's real
 * address is never put in the page. Each view is re-checked exactly as a
 * submit is, then answered with a redirect: to a URL signed for a few minutes
 * when the image is in our bucket, or to the client's own https URL when it
 * lives in their storage. Redirecting rather than streaming the bytes keeps a
 * large scan off this platform's function limits, and the bytes never pass
 * through us either way.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  return withAuth(req, async (_req, auth) => {
    const taskId = Number((await params).taskId);
    if (!Number.isInteger(taskId) || taskId <= 0) return FORBIDDEN();

    let pool: GatedPool | null;
    let stored: unknown;
    let data: Record<string, unknown>;
    try {
      const found = await requireEligiblePoolForTask(auth.clinicianId, taskId);
      pool = found?.pool ?? null;
      // The stored value, not the rendered one. HEALTH records our own bucket's
      // object key beside the image (`_image_key`, never sent to a browser), so a
      // fresh link is signed from the key itself rather than from a URL whose
      // weeks-long signature may since have expired.
      stored = found?.task.content._image_key ?? found?.task.content.image;
      data = found?.task.data ?? {};
    } catch (err) {
      console.error(`[media] case store unreachable for task ${taskId}`, err);
      return NextResponse.json(
        { error: "We could not reach the case store. Try again in a moment." },
        { status: 502 }
      );
    }

    if (!pool) return FORBIDDEN();
    if (pool.closedAt) return POOL_CLOSED();
    if (!isImageTask(pool.evalConfig as RawEvalConfig | null, data)) return NO_IMAGE();

    const source = resolveImageSource(stored, process.env.NEXT_PUBLIC_SUPABASE_URL);
    if (!source) return NO_IMAGE();

    let location: string;
    if (source.kind === "bucket") {
      const { data: signed, error } = await supabaseAdmin.storage
        .from(IMAGE_BUCKET)
        .createSignedUrl(source.path, SIGNED_URL_SECONDS);
      if (error || !signed?.signedUrl) {
        // The key only: the error itself is not clinical, but the path is
        // all an operator needs to find the object.
        console.error(`[media] could not sign the image for task ${taskId}`);
        return NextResponse.json(
          { error: "We could not load this image. Try again in a moment." },
          { status: 502 }
        );
      }
      location = signed.signedUrl;
    } else {
      location = source.url;
    }

    const res = NextResponse.redirect(location, 302);
    res.headers.set("Cache-Control", "private, no-store");
    res.headers.set("Referrer-Policy", "no-referrer");
    return res;
  });
}
