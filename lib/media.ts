/**
 * Where a case's image is, decided without trusting the case.
 *
 * HEALTH stores an image in one of two ways. Uploaded through the client
 * portal, it lives in our private `client-images` bucket under a de-identified
 * key, and the item carries a signed URL that stays valid for weeks. Ingested
 * from a client's manifest, it stays in the client's storage and the item
 * carries their URL.
 *
 * For our bucket, the long-lived URL is never handed on: the path is pulled out
 * and a fresh URL is signed for a few minutes, on each view, for a clinician the
 * gate has already admitted. For a client's URL there is nothing of ours to
 * sign; it is passed on only if it is https. Anything else is not served.
 */

export const IMAGE_BUCKET = "client-images";

/** HEALTH's de-identified key: a client prefix and a digest (storage.py _deid_key). */
const BUCKET_KEY = /^[0-9a-f]{16}\/[0-9a-f]{32}\.[a-z0-9]{1,5}$/;

export type ImageSource =
  | { kind: "bucket"; path: string }
  | { kind: "external"; url: string };

export function resolveImageSource(
  value: unknown,
  supabaseUrl: string | undefined
): ImageSource | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const raw = value.trim();

  if (BUCKET_KEY.test(raw)) return { kind: "bucket", path: raw };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  if (supabaseUrl) {
    let ours: URL | null = null;
    try {
      ours = new URL(supabaseUrl);
    } catch {
      ours = null;
    }
    if (ours && url.host === ours.host) {
      const match = url.pathname.match(
        new RegExp(`^/storage/v1/object/(?:sign|public|authenticated)/${IMAGE_BUCKET}/(.+)$`)
      );
      const path = match ? decodeURIComponent(match[1]) : "";
      // Only a key of ours; a path that climbs or wanders is refused.
      return BUCKET_KEY.test(path) ? { kind: "bucket", path } : null;
    }
  }

  return url.protocol === "https:" ? { kind: "external", url: url.toString() } : null;
}
