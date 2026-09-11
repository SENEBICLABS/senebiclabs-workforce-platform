import "server-only";
import { supabaseAdmin } from "./supabase";
import { normalizeEmail } from "./invites";

/**
 * Looking a clinician up by address.
 *
 * One implementation, because "which clinician is this address" is a security
 * decision and it was being answered independently in three places. All three
 * had drifted to .ilike, where supabase-js passes the value through as an
 * unescaped LIKE pattern, so "_" and "%" in an address were wildcards. The fix
 * had to be found three times. This exists so the next such question is asked
 * once.
 *
 * Its whole job is to be the single place .eq has to be right. It carries no
 * identity assertion: with an exact match the returned row is by definition the
 * row whose email equals the input, so checking that here would compare a value
 * to itself. The assertion that matters lives at session issuance, where the
 * consequence is.
 *
 * Exactness is safe rather than merely conventional because migration 009
 * constrains clinicians.email to lower(btrim(email)), so no stored address can
 * fail to match a normalised one.
 */
export interface Clinician {
  id: string;
  email: string;
  active: boolean | null;
}

export async function findClinicianByEmail(
  rawEmail: string
): Promise<Clinician | null> {
  const email = normalizeEmail(rawEmail);
  if (!email) return null;

  const { data } = await supabaseAdmin
    .from("clinicians")
    .select("id, email, active")
    .eq("email", email)
    // Duplicates cannot arise since migration 005's unique index on
    // lower(email), but the oldest row still wins if one ever did, so a member
    // keeps the account their history hangs off.
    .order("created_at", { ascending: true })
    .limit(1);

  return (data?.[0] as Clinician | undefined) ?? null;
}
