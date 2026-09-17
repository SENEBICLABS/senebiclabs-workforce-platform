import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Operator console",
  // Never indexed, never linked from the clinician application.
  robots: { index: false, follow: false },
};

/**
 * The console's own shell.
 *
 * Deliberately shares no layout, navigation or state with the clinician
 * application — there is no route from one into the other, in either direction.
 */
export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#0C2422] text-white">{children}</div>;
}
