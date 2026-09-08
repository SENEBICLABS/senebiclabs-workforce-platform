"use client";

import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/AppLayout";
import { useAppState } from "@/components/AppState";
import { Button } from "@/components/ui/Button";
import { Card, SectionHeading } from "@/components/ui/Card";
import { Switch } from "@/components/ui/Switch";
import { ErrorState, Skeleton } from "@/components/ui/States";
import { api } from "@/lib/api";
import { InviteColleague } from "@/components/InviteColleague";
import { useAsync } from "@/lib/use-async";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-hairline px-5 py-4 last:border-b-0">
      <span className="text-label uppercase text-muted">{label}</span>
      <span className="text-body text-ink">{value}</span>
    </div>
  );
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
      <div className="max-w-2xl">
        <SectionHeading>Profile</SectionHeading>

        {me.loading && <Skeleton className="h-40" />}

        {!me.loading && me.error && (
          <ErrorState message={me.error} onRetry={me.reload} />
        )}

        {!me.loading && !me.error && me.data && (
          <Card>
            <Row label="Name" value={me.data.name} />
            <Row label="Email" value={me.data.email} />
            <Row
              label="Agreement"
              value={me.data.agreement_accepted ? "Accepted" : "Not accepted"}
            />
            <Row
              label="Pools you are eligible for"
              value={String(me.data.eligible_pool_ids.length)}
            />
          </Card>
        )}

        <div className="mt-8">
          <SectionHeading>Availability</SectionHeading>
          {me.data?.can_invite && <InviteColleague />}

          <Card className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-body font-semibold text-ink">
                  Available for reviews
                </p>
                <p className="mt-1 text-body text-muted">
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
        </div>

        <div className="mt-8">
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
        </div>

        <div className="mt-8">
          <SectionHeading>Payment</SectionHeading>
          <Card className="p-5">
            <p className="text-body text-ink">
              Paid at professional rates via M-Pesa.
            </p>
            <p className="mt-1.5 text-body text-muted">
              Rates and payment schedule are agreed per pool. Statements are not
              available in the portal yet.
            </p>
          </Card>
        </div>

        <div className="mt-8">
          <Button variant="secondary" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
