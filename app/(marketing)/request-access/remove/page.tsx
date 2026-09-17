import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass, DISABLED } from "@/components/ui/button-class";
import { removalLinkIsValid } from "@/lib/access-requests";

export const metadata: Metadata = {
  title: "Remove your address | Senebiclabs",
  robots: { index: false, follow: false },
};

/**
 * Where the removal link in a confirmation email lands.
 *
 * Opening the link only asks. The address is removed when the button is
 * pressed, because mail scanners open links on their own and a removal on
 * page load would take people off the list who never clicked. The result comes
 * back here as ?removed=1 or ?error=… after the POST.
 */
export default async function RemoveAddressPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const id = one(q.id);
  const sig = one(q.sig);

  let title: string;
  let body: string;
  let confirm = false;

  if (one(q.removed) === "1") {
    title = "You are off the list";
    body = "Your address has been removed, and your request deleted. We will not email you about Senebiclabs again.";
  } else if (one(q.error) === "failed") {
    title = "That did not go through";
    body = "We could not remove your address just now. Please open the link from your email again in a little while.";
  } else if (one(q.error) === "invalid" || !removalLinkIsValid(id, sig)) {
    title = "This link does not work";
    body = "It may have been cut short when it was copied. Please open the link from your email again.";
  } else {
    title = "Remove your address?";
    body = "This takes your address off the Senebiclabs list and deletes your request. We will not email you about Senebiclabs again.";
    confirm = true;
  }

  return (
    <section>
      <div className="mx-auto w-full max-w-[1040px] px-5 pb-24 pt-32 text-center sm:pb-32 sm:pt-40 lg:px-8">
        <p className="text-label uppercase text-muted">Request access</p>
        <h1 className="mx-auto mt-5 max-w-[880px] text-[42px] leading-[1.04] text-ink sm:text-[60px]">
          {title}
        </h1>
        <p className="mx-auto mt-5 max-w-[560px] text-[19px] leading-relaxed text-muted">{body}</p>

        {confirm ? (
          // A plain form, so it works without JavaScript, from any mail app's
          // built-in browser.
          <form method="post" action="/api/access-requests/remove" className="mt-10">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="sig" value={sig} />
            <button type="submit" className={`${buttonClass({ variant: "light", size: "lg" })} ${DISABLED}`}>
              Remove my address
            </button>
            <p className="mt-5 text-body text-muted">
              <Link
                href="/"
                className="focusable rounded-btn text-muted underline underline-offset-4 transition-colors hover:text-ink"
              >
                Keep me on the list
              </Link>
            </p>
          </form>
        ) : (
          <p className="mt-10 text-body">
            <Link
              href="/"
              className="focusable rounded-btn text-muted underline underline-offset-4 transition-colors hover:text-ink"
            >
              Go to Senebiclabs
            </Link>
          </p>
        )}
      </div>
    </section>
  );
}
