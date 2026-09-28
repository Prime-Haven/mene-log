import {
  Activity,
  AlertTriangle,
  Building2,
  Check,
  CircleDollarSign,
  Clock,
  Database,
  Hourglass,
  Mail,
  Plus,
  ShieldAlert,
  Users,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { planLabel } from "@/lib/pricing";
import { type Snapshot, type Section, fmtDate, fmtBytes, usd, paymentUsd } from "./prime-types";

export function PrimeOverview({ d, go }: { d: Snapshot; go: (s: Section) => void }) {
  const t = d.tenants;
  const n = (s: string) => t.filter((x) => x.status === s).length;
  const trial = t.filter((x) => x.trial_ends_at && new Date(x.trial_ends_at) > new Date());
  const endingSoon = trial.filter(
    (x) => new Date(x.trial_ends_at!) < new Date(Date.now() + 7 * 864e5),
  );
  const since = (days: number) =>
    t.filter((x) => new Date(x.created_at) > new Date(Date.now() - days * 864e5)).length;

  const successfulPayments = d.payments.filter((p) => p.status === "success");
  const failedPayments = d.payments.filter((p) => p.status === "failed");
  const within = (days: number) =>
    successfulPayments
      .filter((p) => new Date(p.paid_at ?? p.created_at) > new Date(Date.now() - days * 864e5))
      .reduce((s, p) => s + paymentUsd(p), 0);

  const m30 = within(30);
  const y365 = within(365);
  const grossRev = successfulPayments.reduce((s, p) => s + paymentUsd(p), 0);

  const members = t.reduce((s, x) => s + x.usage.members, 0);
  const checkins = t.reduce((s, x) => s + x.usage.attendance, 0);
  const checkins30 = t.reduce((s, x) => s + x.usage.attendance30, 0);
  const activeChurches = t.filter((x) => x.usage.attendance30 > 0).length;
  const inactiveChurches = t.filter((x) => x.usage.attendance30 === 0 && x.status === "active");

  const pendingApprovals = t.filter(
    (x) => x.approval_status === "pending_approval" || x.approval_status === "correction_requested",
  );

  const renewals14 = t.filter((x) => {
    const periodEnd = (x.sub as { period_end?: string } | null)?.period_end;
    return (
      periodEnd &&
      !periodEnd.startsWith("9999") &&
      new Date(periodEnd) > new Date() &&
      new Date(periodEnd) < new Date(Date.now() + 14 * 864e5)
    );
  });

  const totalDbBytes = t.reduce((s, x) => s + x.usage.bytes, 0);
  const totalFileBytes = d.storage.reduce((s, b) => s + b.bytes, 0);
  const storageHeavy = [...t]
    .sort((a, b) => b.usage.bytes + b.storage_bytes - (a.usage.bytes + a.storage_bytes))
    .slice(0, 5);

  const byTier = (["free", "basic", "standard", "premium"] as const).map((k) => ({
    k,
    count: t.filter((x) => x.tier === k).length,
    rev: successfulPayments.filter((p) => p.tier === k).reduce((s, p) => s + paymentUsd(p), 0),
  }));

  // Monthly registrations trend (last 12 months)
  const regTrends = Array.from({ length: 12 }, (_, i) => {
    const dt = new Date();
    dt.setMonth(dt.getMonth() - (11 - i), 1);
    const key = dt.toISOString().slice(0, 7);
    return {
      key: key.slice(5),
      label: new Intl.DateTimeFormat(undefined, { month: "short" }).format(dt),
      count: t.filter((x) => x.created_at.startsWith(key)).length,
      revenue: successfulPayments
        .filter((p) => (p.paid_at ?? p.created_at).startsWith(key))
        .reduce((s, p) => s + paymentUsd(p), 0),
    };
  });

  const maxReg = Math.max(1, ...regTrends.map((x) => x.count));

  // Trial conversion rate: churches that paid after starting
  const churchesWithPayment = new Set(successfulPayments.map((p) => p.tenant_id)).size;
  const nonFreeChurches = t.filter((x) => x.tier !== "free").length;
  const trialConversionRate =
    nonFreeChurches > 0 ? Math.round((churchesWithPayment / nonFreeChurches) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Platform Title */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-eyebrow">Operations & Oversight</p>
          <h1 className="mt-1 font-display text-2xl font-bold">Platform Overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Aggregate operations and telemetry across all churches. Church member records stay
            strictly private.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pendingApprovals.length > 0 && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => go("pending")}
              className="gap-1.5"
            >
              <Hourglass className="size-4 animate-spin" />
              {pendingApprovals.length} pending review
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => go("churches")}>
            View Church Registry
          </Button>
        </div>
      </div>

      {/* Primary Summary Grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Churches</span>
            <Building2 className="size-4 text-primary" />
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums">{t.length}</p>
          <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {n("active")} active · {trial.length} on trial
            </span>
            <span className="text-emerald-600 font-semibold">+{since(7)} this wk</span>
          </div>
        </div>

        <div className="surface p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Members</span>
            <Users className="size-4 text-primary" />
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums">{members.toLocaleString()}</p>
          <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>Avg {t.length ? Math.round(members / t.length) : 0} per church</span>
            <span>Across all plans</span>
          </div>
        </div>

        <div className="surface p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Check-ins Recorded
            </span>
            <Check className="size-4 text-primary" />
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums">{checkins.toLocaleString()}</p>
          <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>{checkins30.toLocaleString()} in last 30d</span>
            <span className="text-emerald-600 font-semibold">{activeChurches} churches active</span>
          </div>
        </div>

        <div className="surface p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Revenue (30d / 12m)
            </span>
            <CircleDollarSign className="size-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums">
            {usd(m30)}{" "}
            <span className="text-sm font-normal text-muted-foreground">/ {usd(y365)}</span>
          </p>
          <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>Gross: {usd(grossRev)}</span>
            <span>{successfulPayments.length} txns</span>
          </div>
        </div>
      </div>

      {/* Secondary Metrics Row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="surface p-3.5 text-xs">
          <p className="text-muted-foreground uppercase tracking-wider font-semibold text-[10px]">
            Approval Queue
          </p>
          <p className="mt-1 text-lg font-bold">
            {pendingApprovals.length}{" "}
            <span className="text-xs font-normal text-muted-foreground">flagged</span>
          </p>
          <button
            onClick={() => go("pending")}
            className="mt-1.5 flex items-center gap-1 text-primary hover:underline"
          >
            Review accounts <ArrowRight className="size-3" />
          </button>
        </div>

        <div className="surface p-3.5 text-xs">
          <p className="text-muted-foreground uppercase tracking-wider font-semibold text-[10px]">
            Trials Ending (7d)
          </p>
          <p className="mt-1 text-lg font-bold">
            {endingSoon.length}{" "}
            <span className="text-xs font-normal text-muted-foreground">of {trial.length}</span>
          </p>
          <p className="mt-1.5 text-muted-foreground">{trialConversionRate}% conversion rate</p>
        </div>

        <div className="surface p-3.5 text-xs">
          <p className="text-muted-foreground uppercase tracking-wider font-semibold text-[10px]">
            Renewals (14d)
          </p>
          <p className="mt-1 text-lg font-bold">
            {renewals14.length}{" "}
            <span className="text-xs font-normal text-muted-foreground">upcoming</span>
          </p>
          <p className="mt-1.5 text-muted-foreground">
            {failedPayments.length > 0 ? (
              <span className="text-destructive font-semibold">{failedPayments.length} failed</span>
            ) : (
              "All renewals healthy"
            )}
          </p>
        </div>

        <div className="surface p-3.5 text-xs">
          <p className="text-muted-foreground uppercase tracking-wider font-semibold text-[10px]">
            Messaging (24h)
          </p>
          <p className="mt-1 text-lg font-bold">
            {d.health.sent_24h.toLocaleString()}{" "}
            <span className="text-xs font-normal text-muted-foreground">sent</span>
          </p>
          <p className="mt-1.5 text-muted-foreground">
            {d.health.failed_24h > 0 ? (
              <span className="text-destructive font-semibold">{d.health.failed_24h} failed</span>
            ) : (
              "0 failures"
            )}
          </p>
        </div>

        <div className="surface p-3.5 text-xs">
          <p className="text-muted-foreground uppercase tracking-wider font-semibold text-[10px]">
            Total Storage
          </p>
          <p className="mt-1 text-lg font-bold">{fmtBytes(totalDbBytes + totalFileBytes)}</p>
          <p className="mt-1.5 text-muted-foreground">
            {fmtBytes(totalDbBytes)} DB · {fmtBytes(totalFileBytes)} files
          </p>
        </div>
      </div>

      {/* Trends & Plan Mix */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* 12-Month Registrations Chart */}
        <div className="surface p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-semibold text-sm">New Church Registrations (12 Months)</p>
              <p className="text-xs text-muted-foreground">Monthly onboarding volume</p>
            </div>
            <span className="text-xs font-semibold text-emerald-600">+{since(30)} in last 30d</span>
          </div>

          <div className="flex h-40 items-end gap-2 pt-4">
            {regTrends.map((x) => (
              <div key={x.key} className="group flex flex-1 flex-col items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                  {x.count}
                </span>
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${(x.count / maxReg) * 100}%` }}
                  transition={{ duration: 0.4 }}
                  className="w-full min-h-[3px] rounded-t bg-primary/80 group-hover:bg-primary transition-colors"
                />
                <span className="truncate text-[10px] text-muted-foreground">{x.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Plan Mix Breakdown */}
        <div className="surface p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-semibold text-sm">Plan Mix & Revenue Distribution</p>
              <p className="text-xs text-muted-foreground">Current tier subscription breakdown</p>
            </div>
            <button
              onClick={() => go("revenue")}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              Revenue details <ArrowRight className="size-3" />
            </button>
          </div>

          <div className="space-y-3">
            {byTier.map((item) => {
              const pct = t.length > 0 ? Math.round((item.count / t.length) * 100) : 0;
              return (
                <div key={item.k}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{planLabel(item.k)}</span>
                    <span className="text-muted-foreground">
                      {item.count} churches ({pct}%) · {usd(item.rev)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full ${
                        item.k === "premium"
                          ? "bg-purple-600"
                          : item.k === "standard"
                            ? "bg-primary"
                            : item.k === "basic"
                              ? "bg-sky-500"
                              : "bg-muted-foreground/40"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Needs Attention Panels - 6 Operations Panels */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-500" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
              Needs Attention & Follow-up
            </h2>
          </div>
          <span className="text-xs text-muted-foreground">
            Critical flags requiring operator review or support
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* 1. Flagged Approvals */}
          <div className="surface p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-2.5 border-b">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="size-4 text-amber-500" />
                  <p className="font-semibold text-sm">Flagged Registrations</p>
                </div>
                <Badge variant="outline" className="text-xs">
                  {pendingApprovals.length}
                </Badge>
              </div>
              <div className="mt-2.5 divide-y max-h-48 overflow-y-auto">
                {pendingApprovals.slice(0, 4).map((church) => (
                  <div key={church.id} className="py-2 text-xs">
                    <p className="font-medium text-foreground">{church.name}</p>
                    <p className="text-muted-foreground text-[11px]">
                      /c/{church.subdomain} · {planLabel(church.tier)}
                    </p>
                    {church.approval_risk_flags && church.approval_risk_flags.length > 0 && (
                      <p className="text-[10px] text-destructive mt-0.5 font-medium truncate">
                        Reason: {church.approval_risk_flags[0]}
                      </p>
                    )}
                  </div>
                ))}
                {pendingApprovals.length === 0 && (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    No registrations awaiting review.
                  </p>
                )}
              </div>
            </div>
            <Button
              size="sm"
              variant={pendingApprovals.length > 0 ? "default" : "outline"}
              className="w-full mt-3 text-xs h-8"
              onClick={() => go("pending")}
            >
              Open Approvals Queue ({pendingApprovals.length})
            </Button>
          </div>

          {/* 2. Trials Ending Soon */}
          <div className="surface p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-2.5 border-b">
                <div className="flex items-center gap-2">
                  <Clock className="size-4 text-sky-500" />
                  <p className="font-semibold text-sm">Trials Ending Soon (7d)</p>
                </div>
                <Badge variant="outline" className="text-xs">
                  {endingSoon.length}
                </Badge>
              </div>
              <div className="mt-2.5 divide-y max-h-48 overflow-y-auto">
                {endingSoon.slice(0, 4).map((church) => (
                  <div key={church.id} className="py-2 text-xs flex justify-between items-center">
                    <div>
                      <p className="font-medium text-foreground">{church.name}</p>
                      <p className="text-muted-foreground text-[11px]">
                        {planLabel(church.tier)} plan
                      </p>
                    </div>
                    <span className="text-muted-foreground font-mono text-[10px]">
                      {fmtDate(church.trial_ends_at)}
                    </span>
                  </div>
                ))}
                {endingSoon.length === 0 && (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    No trials ending this week.
                  </p>
                )}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full mt-3 text-xs h-8"
              onClick={() => go("churches")}
            >
              All Trial Churches ({trial.length})
            </Button>
          </div>

          {/* 3. Failed Payments */}
          <div className="surface p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-2.5 border-b">
                <div className="flex items-center gap-2">
                  <CircleDollarSign className="size-4 text-destructive" />
                  <p className="font-semibold text-sm">Failed Payments</p>
                </div>
                <Badge
                  variant={failedPayments.length > 0 ? "destructive" : "outline"}
                  className="text-xs"
                >
                  {failedPayments.length}
                </Badge>
              </div>
              <div className="mt-2.5 divide-y max-h-48 overflow-y-auto">
                {failedPayments.slice(0, 4).map((p) => {
                  const ch = t.find((x) => x.id === p.tenant_id);
                  return (
                    <div key={p.id} className="py-2 text-xs flex justify-between items-center">
                      <div>
                        <p className="font-medium text-foreground">
                          {ch?.name ?? "Unknown church"}
                        </p>
                        <p className="text-[10px] text-muted-foreground font-mono truncate max-w-44">
                          {p.reference}
                        </p>
                      </div>
                      <span className="font-semibold text-destructive text-[11px]">
                        {p.currency} {(p.amount_kobo / 100).toFixed(2)}
                      </span>
                    </div>
                  );
                })}
                {failedPayments.length === 0 && (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    No failed transactions recorded.
                  </p>
                )}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full mt-3 text-xs h-8"
              onClick={() => go("revenue")}
            >
              Review Payment Failures
            </Button>
          </div>

          {/* 4. Stalled Messages & Failures */}
          <div className="surface p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-2.5 border-b">
                <div className="flex items-center gap-2">
                  <Mail className="size-4 text-amber-500" />
                  <p className="font-semibold text-sm">Stalled / Failed Messaging</p>
                </div>
                <Badge
                  variant={
                    d.health.failed_24h > 0 || d.health.stuck_queue > 0 ? "destructive" : "outline"
                  }
                  className="text-xs"
                >
                  {d.health.failed_24h} err
                </Badge>
              </div>
              <div className="mt-2.5 space-y-2 text-xs">
                <div className="flex justify-between items-center p-2 rounded bg-muted/40">
                  <span className="text-muted-foreground">24h Failures:</span>
                  <span className="font-bold text-destructive">{d.health.failed_24h}</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded bg-muted/40">
                  <span className="text-muted-foreground">Queue Waiting &gt;1h:</span>
                  <span className="font-bold text-foreground">{d.health.stuck_queue}</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded bg-muted/40">
                  <span className="text-muted-foreground">30-day Failures:</span>
                  <span className="font-bold text-foreground">
                    {t.reduce((s, x) => s + x.messaging.failed, 0)}
                  </span>
                </div>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full mt-3 text-xs h-8"
              onClick={() => go("messaging")}
            >
              Messaging Health & Retry
            </Button>
          </div>

          {/* 5. Inactive Churches */}
          <div className="surface p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-2.5 border-b">
                <div className="flex items-center gap-2">
                  <Activity className="size-4 text-muted-foreground" />
                  <p className="font-semibold text-sm">Inactive Churches (30d)</p>
                </div>
                <Badge variant="outline" className="text-xs">
                  {inactiveChurches.length}
                </Badge>
              </div>
              <div className="mt-2.5 divide-y max-h-48 overflow-y-auto">
                {inactiveChurches.slice(0, 4).map((church) => (
                  <div key={church.id} className="py-2 text-xs flex justify-between items-center">
                    <div>
                      <p className="font-medium text-foreground">{church.name}</p>
                      <p className="text-muted-foreground text-[11px]">
                        {planLabel(church.tier)} · 0 check-ins
                      </p>
                    </div>
                    <span className="text-muted-foreground text-[10px]">
                      Joined {fmtDate(church.created_at)}
                    </span>
                  </div>
                ))}
                {inactiveChurches.length === 0 && (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    All active churches have recorded check-ins!
                  </p>
                )}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full mt-3 text-xs h-8"
              onClick={() => go("churches")}
            >
              Inspect Inactive Accounts
            </Button>
          </div>

          {/* 6. Storage Heavy Churches */}
          <div className="surface p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-2.5 border-b">
                <div className="flex items-center gap-2">
                  <Database className="size-4 text-primary" />
                  <p className="font-semibold text-sm">Storage-Heavy Churches</p>
                </div>
                <span className="text-xs text-muted-foreground">DB + Files</span>
              </div>
              <div className="mt-2.5 divide-y max-h-48 overflow-y-auto">
                {storageHeavy.map((church) => {
                  const total = church.usage.bytes + church.storage_bytes;
                  return (
                    <div key={church.id} className="py-2 text-xs flex justify-between items-center">
                      <div>
                        <p className="font-medium text-foreground truncate max-w-40">
                          {church.name}
                        </p>
                        <p className="text-muted-foreground text-[11px]">
                          {church.usage.members} mbrs · {church.usage.rows.toLocaleString()} rows
                        </p>
                      </div>
                      <span className="font-mono text-[11px] font-semibold">{fmtBytes(total)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full mt-3 text-xs h-8"
              onClick={() => go("database")}
            >
              Capacity & Storage Breakdown
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
