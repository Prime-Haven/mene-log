import { useState, useMemo } from "react";
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
  ShieldAlert,
  Users,
  ArrowRight,
  TrendingUp,
  Calendar,
  Sparkles,
  BarChart2,
  Layers,
} from "lucide-react";
import { motion } from "framer-motion";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Line,
  ComposedChart,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { planLabel } from "@/lib/pricing";
import {
  type Snapshot,
  type Section,
  fmtDate,
  fmtBytes,
  usd,
  paymentUsd,
} from "./prime-types";

const TIER_COLORS: Record<string, string> = {
  free: "#71717a",
  standard: "#0ea5e9",
  pro: "#6366f1",
  premium: "#a855f7",
};

export function PrimeOverview({ d, go }: { d: Snapshot; go: (s: Section) => void }) {
  const [timeRange, setTimeRange] = useState<"30" | "90">("30");

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

  // 1. Time-series Check-in Chart Data (30d vs 90d)
  const checkinData = useMemo(() => {
    const days = timeRange === "30" ? 30 : 90;
    const sinceDate = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
    const source = (d.dailyTrends ?? []).filter((pt) => pt.date >= sinceDate);

    // If source has fewer data points than days, synthesize a clean time series
    if (source.length === 0) {
      return Array.from({ length: days }, (_, i) => {
        const dt = new Date(Date.now() - (days - 1 - i) * 864e5);
        const dateStr = dt.toISOString().slice(0, 10);
        const formatted = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(dt);
        const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(dt);
        return {
          date: dateStr,
          checkins: 0,
          newChurches: 0,
          activeChurches: 0,
          formattedDate: formatted,
          weekday,
          label: `${weekday}, ${formatted}`,
        };
      });
    }

    return source.map((pt) => {
      const dt = new Date(pt.date + "T00:00:00");
      const formatted = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(dt);
      const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(dt);
      return {
        ...pt,
        formattedDate: formatted,
        weekday,
        label: `${weekday}, ${formatted}`,
      };
    });
  }, [d.dailyTrends, timeRange]);

  const totalRangeCheckins = useMemo(() => {
    return checkinData.reduce((sum, cur) => sum + cur.checkins, 0);
  }, [checkinData]);

  const peakDay = useMemo(() => {
    if (!checkinData.length) return null;
    return checkinData.reduce((max, cur) => (cur.checkins > max.checkins ? cur : max), checkinData[0]);
  }, [checkinData]);

  const avgRangeCheckins = useMemo(() => {
    return checkinData.length ? Math.round(totalRangeCheckins / checkinData.length) : 0;
  }, [checkinData, totalRangeCheckins]);

  // 2. Subscription Tiers Donut Chart Data
  const tierChartData = useMemo(() => {
    return (["free", "standard", "pro", "premium"] as const).map((k) => {
      const count = t.filter((x) => x.tier === k).length;
      const pct = t.length > 0 ? Math.round((count / t.length) * 100) : 0;
      const rev = successfulPayments
        .filter((p) => p.tier === k)
        .reduce((s, p) => s + paymentUsd(p), 0);
      return {
        name: planLabel(k),
        tier: k,
        value: count,
        pct,
        rev,
        color: TIER_COLORS[k],
      };
    });
  }, [t, successfulPayments]);

  // 3. Monthly Church Registrations & Growth Trajectory
  const growthChartData = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => {
      const dt = new Date();
      dt.setMonth(dt.getMonth() - (11 - i), 1);
      const key = dt.toISOString().slice(0, 7);
      const newCount = t.filter((x) => x.created_at.startsWith(key)).length;
      return {
        key: key.slice(5),
        label: new Intl.DateTimeFormat(undefined, { month: "short" }).format(dt),
        newChurches: newCount,
      };
    });

    let cum = 0;
    return months.map((m) => {
      cum += m.newChurches;
      return {
        ...m,
        cumulative: Math.max(cum, m.newChurches),
      };
    });
  }, [t]);

  // Trial conversion rate
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
              className="gap-1.5 shadow-sm"
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

      {/* Primary Summary KPI Grid */}
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

      {/* Secondary Metrics Bar */}
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

      {/* -------------------------------------------------------------------------- */}
      {/* 1. VISUALIZATION: Active Check-ins Over Time Area Chart                     */}
      {/* -------------------------------------------------------------------------- */}
      <div className="surface p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="size-4 text-primary" />
              <h2 className="font-semibold text-base text-foreground">
                Active Check-ins Over Time
              </h2>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Daily aggregate congregation check-ins, online attendance, and QR scans across all churches.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {peakDay && peakDay.checkins > 0 && (
              <Badge variant="secondary" className="text-xs hidden md:inline-flex gap-1.5">
                <Sparkles className="size-3 text-amber-500" />
                <span>Peak: <b>{peakDay.checkins.toLocaleString()}</b> on {peakDay.label}</span>
              </Badge>
            )}

            {/* 30-Day vs 90-Day Toggle Buttons */}
            <div className="inline-flex rounded-xl bg-muted p-1 border">
              <button
                type="button"
                onClick={() => setTimeRange("30")}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                  timeRange === "30"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Last 30 Days
              </button>
              <button
                type="button"
                onClick={() => setTimeRange("90")}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                  timeRange === "90"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Last 90 Days
              </button>
            </div>
          </div>
        </div>

        {/* Stats Sub-strip */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground pt-1">
          <div>
            <span className="text-[11px] uppercase tracking-wider font-semibold">Total Window Check-ins:</span>{" "}
            <span className="font-bold text-foreground text-sm font-mono">{totalRangeCheckins.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-[11px] uppercase tracking-wider font-semibold">Daily Average:</span>{" "}
            <span className="font-semibold text-foreground font-mono">{avgRangeCheckins.toLocaleString()}/day</span>
          </div>
          <div>
            <span className="text-[11px] uppercase tracking-wider font-semibold">Active Window:</span>{" "}
            <span className="font-semibold text-foreground">{timeRange === "30" ? "Past 30 Days" : "Past 90 Days"}</span>
          </div>
        </div>

        {/* Recharts Area Chart */}
        <div className="h-64 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={checkinData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="checkinAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="opacity-10" />
              <XAxis
                dataKey="formattedDate"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "currentColor" }}
                className="text-muted-foreground"
                interval={timeRange === "30" ? 4 : 12}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "currentColor" }}
                className="text-muted-foreground"
                allowDecimals={false}
              />
              <Tooltip content={<CustomCheckinTooltip />} />
              <Area
                type="monotone"
                dataKey="checkins"
                name="Check-ins"
                stroke="#6366f1"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#checkinAreaGrad)"
                activeDot={{ r: 5, stroke: "#6366f1", strokeWidth: 2, fill: "#ffffff" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* -------------------------------------------------------------------------- */}
      {/* 2. VISUALIZATIONS: Subscription Tiers Donut & Total Church Growth           */}
      {/* -------------------------------------------------------------------------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Subscription Tiers Distribution Donut Chart */}
        <div className="surface p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 border-b pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Layers className="size-4 text-purple-600" />
                  <p className="font-semibold text-sm">Subscription Tiers Distribution</p>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Plan distribution & revenue weight across {t.length} registered churches
                </p>
              </div>
              <button
                onClick={() => go("revenue")}
                className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
              >
                Revenue <ArrowRight className="size-3" />
              </button>
            </div>

            <div className="grid sm:grid-cols-2 items-center gap-4 py-2">
              {/* Donut Chart with center label */}
              <div className="relative h-48 w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={tierChartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={78}
                      paddingAngle={4}
                      stroke="transparent"
                    >
                      {tierChartData.map((entry) => (
                        <Cell key={`cell-${entry.tier}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTierTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Center text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-bold tabular-nums text-foreground">{t.length}</span>
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground">Churches</span>
                </div>
              </div>

              {/* Tier Legend & Table */}
              <div className="space-y-2.5">
                {tierChartData.map((item) => (
                  <div key={item.tier} className="text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="font-medium text-foreground">{item.name}</span>
                      </div>
                      <span className="font-semibold text-foreground font-mono">
                        {item.value}{" "}
                        <span className="text-muted-foreground font-normal">({item.pct}%)</span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground pl-4.5 mt-0.5">
                      <span>Revenue: {usd(item.rev)}</span>
                      <span>
                        {item.tier === "free" ? "Unlimited trial" : `${trial.filter((x) => x.tier === item.tier).length} in trial`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-3 border-t mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>Paid Tiers: <b>{nonFreeChurches}</b> churches ({t.length > 0 ? Math.round((nonFreeChurches / t.length) * 100) : 0}%)</span>
            <span className="text-emerald-600 font-semibold">{trialConversionRate}% conversion rate</span>
          </div>
        </div>

        {/* Total Church Count & Monthly Growth Chart */}
        <div className="surface p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 border-b pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <BarChart2 className="size-4 text-emerald-600" />
                  <p className="font-semibold text-sm">Church Growth Trajectory</p>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Monthly onboarding volume and cumulative active churches
                </p>
              </div>
              <span className="text-xs font-semibold text-emerald-600">
                +{since(30)} in last 30d
              </span>
            </div>

            <div className="h-48 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={growthChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="opacity-10" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "currentColor" }}
                    className="text-muted-foreground"
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "currentColor" }}
                    className="text-muted-foreground"
                    allowDecimals={false}
                  />
                  <Tooltip content={<CustomGrowthTooltip />} />
                  <Bar
                    dataKey="newChurches"
                    name="New Churches"
                    fill="#3b82f6"
                    radius={[4, 4, 0, 0]}
                  />
                  <Line
                    type="monotone"
                    dataKey="cumulative"
                    name="Cumulative Total"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#10b981" }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="pt-3 border-t mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>Growth velocity: <b>+{since(7)} churches</b> this week</span>
            <button onClick={() => go("growth")} className="text-primary hover:underline flex items-center gap-1 font-medium">
              Usage & growth details <ArrowRight className="size-3" />
            </button>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------------------- */}
      {/* 3. OPERATIONAL PANELS: Needs Attention & Follow-up                          */}
      {/* -------------------------------------------------------------------------- */}
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
                  <Clock className="size-4 text-primary" />
                  <p className="font-semibold text-sm">Trials Ending in 7 Days</p>
                </div>
                <span className="text-xs text-muted-foreground">{endingSoon.length} of {trial.length}</span>
              </div>
              <div className="mt-2.5 divide-y max-h-48 overflow-y-auto">
                {endingSoon.slice(0, 4).map((church) => (
                  <div key={church.id} className="py-2 text-xs flex justify-between items-center">
                    <div>
                      <p className="font-medium text-foreground">{church.name}</p>
                      <p className="text-muted-foreground text-[11px]">
                        {planLabel(church.tier)} · {church.usage.members} members
                      </p>
                    </div>
                    <span className="text-amber-600 font-semibold text-[11px]">
                      {fmtDate(church.trial_ends_at)}
                    </span>
                  </div>
                ))}
                {endingSoon.length === 0 && (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    No trials expiring this week.
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
              Manage Active Trials ({trial.length})
            </Button>
          </div>

          {/* 3. Renewals Due */}
          <div className="surface p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-2.5 border-b">
                <div className="flex items-center gap-2">
                  <CircleDollarSign className="size-4 text-emerald-600" />
                  <p className="font-semibold text-sm">Upcoming Renewals (14d)</p>
                </div>
                <Badge variant="outline" className="text-xs">
                  {renewals14.length}
                </Badge>
              </div>
              <div className="mt-2.5 divide-y max-h-48 overflow-y-auto">
                {renewals14.slice(0, 4).map((church) => {
                  const end = (church.sub as { period_end?: string } | null)?.period_end;
                  return (
                    <div key={church.id} className="py-2 text-xs flex justify-between items-center">
                      <div>
                        <p className="font-medium text-foreground">{church.name}</p>
                        <p className="text-muted-foreground text-[11px]">
                          {planLabel(church.tier)} · Auto-renew
                        </p>
                      </div>
                      <span className="text-muted-foreground text-[11px]">{fmtDate(end)}</span>
                    </div>
                  );
                })}
                {renewals14.length === 0 && (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    No paid renewals due in next 14 days.
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
              Subscription & Billing
            </Button>
          </div>

          {/* 4. Failed Messaging Check */}
          <div className="surface p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-2.5 border-b">
                <div className="flex items-center gap-2">
                  <Mail className="size-4 text-primary" />
                  <p className="font-semibold text-sm">Outbound Message Delivery</p>
                </div>
                <Badge
                  variant={d.health.failed_24h > 0 ? "destructive" : "secondary"}
                  className="text-xs"
                >
                  {d.health.failed_24h > 0 ? `${d.health.failed_24h} failed` : "Healthy"}
                </Badge>
              </div>
              <div className="mt-2.5 space-y-2 text-xs">
                <div className="flex justify-between items-center py-1">
                  <span className="text-muted-foreground">Sent in last 24h</span>
                  <span className="font-semibold font-mono">{d.health.sent_24h.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-muted-foreground">Delivery failures (24h)</span>
                  <span className={`font-semibold font-mono ${d.health.failed_24h > 0 ? "text-destructive" : "text-emerald-600"}`}>
                    {d.health.failed_24h}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-muted-foreground">Stuck message queue</span>
                  <span className="font-semibold font-mono">{d.health.stuck_queue}</span>
                </div>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full mt-3 text-xs h-8"
              onClick={() => go("messaging")}
            >
              Inspect Outbox & Queue
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
                <span className="text-xs text-muted-foreground">{inactiveChurches.length} accounts</span>
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

// ----------------------------------------------------------------------------
// Custom Tooltip Components for Recharts
// ----------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomCheckinTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="surface p-3 text-xs shadow-xl border rounded-xl space-y-1.5 min-w-36">
        <p className="font-semibold text-foreground">{data.label}</p>
        <div className="flex items-center justify-between gap-4 text-primary font-bold">
          <span>Check-ins:</span>
          <span className="font-mono text-sm">{data.checkins.toLocaleString()}</span>
        </div>
        {data.activeChurches > 0 && (
          <div className="flex items-center justify-between gap-4 text-muted-foreground text-[11px]">
            <span>Active Churches:</span>
            <span className="font-mono font-medium">{data.activeChurches}</span>
          </div>
        )}
      </div>
    );
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTierTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="surface p-3 text-xs shadow-xl border rounded-xl space-y-1 min-w-40">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ backgroundColor: data.color }} />
          <span className="font-semibold text-foreground">{data.name} Plan</span>
        </div>
        <div className="flex justify-between gap-4 text-muted-foreground text-[11px]">
          <span>Churches:</span>
          <span className="font-semibold text-foreground font-mono">
            {data.value} ({data.pct}%)
          </span>
        </div>
        <div className="flex justify-between gap-4 text-muted-foreground text-[11px]">
          <span>Revenue:</span>
          <span className="font-semibold text-emerald-600 font-mono">{usd(data.rev)}</span>
        </div>
      </div>
    );
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomGrowthTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="surface p-3 text-xs shadow-xl border rounded-xl space-y-1 min-w-36">
        <p className="font-semibold text-foreground">{data.label}</p>
        <div className="flex justify-between gap-4 text-blue-600 font-medium text-[11px]">
          <span>New Churches:</span>
          <span className="font-mono font-bold">+{data.newChurches}</span>
        </div>
        <div className="flex justify-between gap-4 text-emerald-600 font-medium text-[11px]">
          <span>Cumulative:</span>
          <span className="font-mono font-bold">{data.cumulative}</span>
        </div>
      </div>
    );
  }
  return null;
}
