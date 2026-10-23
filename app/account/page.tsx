"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Wallet } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useAppState } from "@/components/AppState";
import { Button } from "@/components/ui/Button";
import { Card, IconBadge, SectionHeading } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Switch } from "@/components/ui/Switch";
import { ErrorState, Skeleton } from "@/components/ui/States";
import { api } from "@/lib/api";
import { InviteColleague } from "@/components/InviteColleague";
import { useAsync } from "@/lib/use-async";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-hairline-soft px-5 py-3.5 last:border-b-0 sm:px-6">
      <span className="text-[14px] text-muted">{label}</span>
      <span className="tnum text-[15px] font-semibold text-ink">{value}</span>
    </div>
  );
}

function initials(name: string) {
  const parts = name.replace(/^dr\.?\s+/i, "").split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "—";
}

export default function AccountPage() {
  const router = useRouter();
  const { available, setAvailable, reviewedThisSession } = useAppState();

  const me = useAsync(() => api.me(), []);
  const stats = useAsync(() => api.stats(), []);

  const signOut = async () => {
    try {
      await api.signOut();
    } finally {
      router.push("/");
    }
  };

  return (
    <AppLayout title="Account">
      <div className="max-w-3xl space-y-10">
        <section>
        <SectionHeading>Profile</SectionHeading>

        {me.loading && <Skeleton className="h-56" />}

        {!me.loading && me.error && (
          <ErrorState message={me.error} onRetry={me.reload} />
        )}

        {!me.loading && !me.error && me.data && (
          <Card className="overflow-hidden">
            <div className="flex items-center gap-4 border-b border-hairline-soft bg-linear-to-r from-accent-soft/60 to-transparent px-5 py-5 sm:px-6">
              <span
                aria-hidden="true"
                className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-linear-to-br from-accent-hover to-accent text-[18px] font-bold text-on-fill ring-4 ring-accent/15"
              >
                {initials(me.data.name || me.data.email)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[19px] font-bold tracking-[-0.015em] text-ink">
                  {me.data.name}
                </p>
                <p className="truncate text-[15px] text-muted">{me.data.email}</p>
              </div>
            </div>
            <Row
              label="Agreement"
              value={
                <span className="flex items-center gap-3">
                  {me.data.agreement_accepted ? (
                    <Pill tone="success" dot>Accepted</Pill>
                  ) : (
                    <Pill tone="warning" dot>Not accepted</Pill>
                  )}
                  <Link
                    href="/agreement"
                    className="focusable rounded-btn text-[14px] font-semibold text-accent-ink underline-offset-4 hover:underline"
                  >
                    {me.data.agreement_accepted ? "Read it" : "Read and accept"}
                  </Link>
                </span>
              }
            />
            <Row
              label="Pools you have access to"
              value={String(me.data.eligible_pool_ids.length)}
            />
          </Card>
        )}
        </section>

        {me.data?.can_invite && (
          <section>
            <InviteColleague />
          </section>
        )}

        <section>
          <SectionHeading>Availability</SectionHeading>

          <Card className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[15px] font-semibold text-ink">
                  Available for reviews
                </p>
                <p className="mt-1 text-[15px] text-muted">
                  Turn this off to stop picking up new cases. It applies to this
                  browser only.
                </p>
              </div>
              <Switch
                checked={available}
                onChange={setAvailable}
                label="Available for reviews"
              />
            </div>
          </Card>
        </section>

        <section>
          <SectionHeading>Your work</SectionHeading>
          {stats.loading && <Skeleton className="h-32" />}
          {!stats.loading && stats.error && (
            <ErrorState message={stats.error} onRetry={stats.reload} />
          )}
          {!stats.loading && !stats.error && stats.data && (
            <Card>
              <Row
                label="Reviewed this session"
                value={reviewedThisSession.toLocaleString()}
              />
              <Row
                label="Reviewed this week"
                value={stats.data.reviewed_this_week.toLocaleString()}
              />
              <Row
                label="Reviewed in total"
                value={stats.data.reviewed_total.toLocaleString()}
              />
            </Card>
          )}
        </section>

        <section>
          <SectionHeading>Payment</SectionHeading>
          <Card className="flex gap-4 p-5 sm:p-6">
            <IconBadge>
              <Wallet size={17} />
            </IconBadge>
            <div>
              <p className="text-[15px] font-semibold text-ink">
                Paid via M-Pesa.
              </p>
              <p className="mt-1 text-[15px] text-muted">
                Your rate and payment schedule are the ones agreed with you in
                writing. Rates and statements are not shown in the portal yet.
              </p>
            </div>
          </Card>
        </section>

        <div className="border-t border-hairline-soft pt-6">
          <Button variant="secondary" onClick={signOut}>
            <LogOut size={15} aria-hidden="true" />
            Sign out
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
