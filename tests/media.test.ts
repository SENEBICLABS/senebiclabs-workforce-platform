import { describe, expect, it } from "vitest";
import { resolveImageSource } from "../lib/media";

const SUPABASE = "https://abcd.supabase.co";
const KEY = "0123456789abcdef/0123456789abcdef0123456789abcdef.png";

describe("resolveImageSource", () => {
  it("re-signs an image in our bucket rather than passing its long-lived URL on", () => {
    const stored = `${SUPABASE}/storage/v1/object/sign/client-images/${KEY}?token=eyJ.long.lived`;
    expect(resolveImageSource(stored, SUPABASE)).toEqual({ kind: "bucket", path: KEY });
  });

  it("accepts a bare de-identified key", () => {
    expect(resolveImageSource(KEY, SUPABASE)).toEqual({ kind: "bucket", path: KEY });
  });

  it("refuses a path in our storage that is not one of our image keys", () => {
    for (const path of [
      "client-images/../other-bucket/secret.png",
      "other-bucket/0123456789abcdef/0123456789abcdef0123456789abcdef.png",
      "client-images/0123456789abcdef/../../x.png",
    ]) {
      expect(resolveImageSource(`${SUPABASE}/storage/v1/object/sign/${path}`, SUPABASE)).toBeNull();
    }
  });

  it("passes a client's own https URL through, and nothing that is not https", () => {
    const s3 = "https://bucket.s3.amazonaws.com/x.png?X-Amz-Signature=abc";
    expect(resolveImageSource(s3, SUPABASE)).toEqual({ kind: "external", url: s3 });
    expect(resolveImageSource("http://example.com/x.png", SUPABASE)).toBeNull();
    expect(resolveImageSource("javascript:alert(1)", SUPABASE)).toBeNull();
    expect(resolveImageSource("data:image/png;base64,AAAA", SUPABASE)).toBeNull();
    expect(resolveImageSource("file:///etc/passwd", SUPABASE)).toBeNull();
  });

  it("serves nothing for a missing or non-string value", () => {
    for (const v of [undefined, null, "", "   ", 42, { url: KEY }]) {
      expect(resolveImageSource(v, SUPABASE)).toBeNull();
    }
  });
});
