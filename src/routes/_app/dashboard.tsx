import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Cake,
  CalendarDays,
  ChartNoAxesColumn,
  Filter,
  QrCode,
  TrendingUp,
  UserPlus,
  Users,
  VenusAndMars,
  X,
  Sparkles,
  ShieldCheck,
  Building2,
  CheckCircle2,
  ListChecks,
  ArrowUpRight,
  ExternalLink,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { AbsenceAlerts } from "@/components/AbsenceAlerts";
import { DashboardTutorialBanner } from "@/components/dashboard/DashboardTutorialBanner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { planLabel } from "@/lib/pricing";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({
    meta: [
      { title: "Operations Dashboard — Mene:Log" },
      {
        name: "description",
        content: "Attendance totals, growth trend and demographics for your church.",
      },
      { property: "og:title", content: "Operations Dashboard — Mene:Log" },
      { property: "og:description", content: "Attendance totals, growth trend and demographics." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

type Dash = {
  members: number;
  first_timers_30d: number;
  services: number;
  last_service_attendance: number;
  trend: Array<{ name: string; service_date: string; attendance: number }>;
  gender: Array<{ label: string; value: number }>;
  age_bands: Array<{ label: string; value: number }>;
};

const pieColors = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

export function Dashboard() {
  const ctx = useTenant();
  const { tenant, tier, isOwner } = ctx;
  const reduceMotion = useReducedMotion();
  const [serviceName, setServiceName] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data } = useQuery({
    queryKey: ["dashboard", tenant?.id],
    enabled: !!tenant,
    queryFn: async () => {
      if (!tenant) throw new Error("Church account is unavailable");
      const { data, error } = await supabase.rpc("tenant_dashboard", { p_tenant: tenant.id });
      if (error) throw error;
      return data as unknown as Dash;
    },
  });

  const { data: birthdays } = useQuery({
    queryKey: ["birthdays", tenant?.id],
    enabled: !!tenant,
    queryFn: async () => {
      if (!tenant) throw new Error("Church account is unavailable");
      const { data, error } = await supabase.rpc("birthdays_this_month", { p_tenant: tenant.id });
      if (error) throw error;
      return data ?? [];
    },
  });

  const trend = [...(data?.trend ?? [])].reverse();
  const serviceOptions = useMemo(
    () => Array.from(new Set(trend.map((item) => item.name))),
    [trend],
  );

  const filteredTrend = trend.filter((item) => {
    if (serviceName !== "all" && item.name !== serviceName) return false;
    if (dateFrom && item.service_date < dateFrom) return false;
    if (dateTo && item.service_date > dateTo) return false;
    return true;
  });

  const averageAttendance = filteredTrend.length
    ? Math.round(
        filteredTrend.reduce((total, item) => total + item.attendance, 0) / filteredTrend.length,
      )
    : 0;

  const genderTotal = (data?.gender ?? []).reduce((total, item) => total + item.value, 0);
  const hasFilters = serviceName !== "all" || Boolean(dateFrom) || Boolean(dateTo);

  const memberLimit = ctx.limitWithExtras("member_limit");
  const currentMembers = data?.members ?? 0;
  const memberPercentage =
    memberLimit > 0 ? Math.min(100, Math.round((currentMembers / memberLimit) * 100)) : 0;

  const metrics = [
    {
      label: "Total Members",
      value: currentMembers,
      subtitle: `${memberPercentage}% of plan capacity`,
      icon: Users,
      tint: "bg-primary/10 text-primary border-primary/20",
    },
    {
      label: "Last Attendance",
      value: data?.last_service_attendance ?? 0,
      subtitle: "Most recent service",
      icon: TrendingUp,
      tint: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    },
    {
      label: "First-timers (30d)",
      value: data?.first_timers_30d ?? 0,
      subtitle: "New souls joined",
      icon: UserPlus,
      tint: "bg-chart-2/10 text-chart-2 border-chart-2/20",
    },
    {
      label: "Services Recorded",
      value: data?.services ?? 0,
      subtitle: "Lifetime services",
      icon: CalendarDays,
      tint: "bg-chart-4/10 text-chart-4 border-chart-4/20",
    },
    {
      label: "Average Attendance",
      value: averageAttendance,
      subtitle: hasFilters ? "Selected filter window" : "Across recorded services",
      icon: ChartNoAxesColumn,
      tint: "bg-chart-3/10 text-chart-3 border-chart-3/20",
    },
    {
      label: "Birthdays This Month",
      value: birthdays?.length ?? 0,
      subtitle: "Celebrants this month",
      icon: Cake,
      tint: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    },
  ];

  return (
    <div className="space-y-6">
      {/* 1. System Tutorial & Orientation Video Banner */}
      <DashboardTutorialBanner tenantName={tenant?.name} />

      {/* 2. Tiered Account Operations Hero */}
      <motion.section
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl bg-deep px-6 py-7 text-deep-foreground shadow-panel border border-border/20 sm:px-8"
      >
        {/* Subtle background glow */}
        <div className="absolute -right-16 -top-16 size-80 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
        <div className="absolute right-1/4 -bottom-16 size-60 rounded-full bg-accent/15 blur-2xl pointer-events-none" />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              <Badge
                variant="outline"
                className="border-primary/40 bg-primary/20 text-white font-display text-xs uppercase tracking-wider font-semibold px-2.5 py-0.5"
              >
                <Sparkles className="size-3 mr-1 text-primary-foreground" />
                {planLabel(tier ?? "standard")} Plan
              </Badge>
              <span className="text-xs text-deep-foreground/60">·</span>
              <span className="text-xs font-mono text-deep-foreground/75">
                menelog.site/c/{tenant?.subdomain}
              </span>
            </div>

            <h1 className="font-display text-2xl sm:text-3xl font-bold text-deep-foreground tracking-tight">
              {tenant?.name}
            </h1>

            <p className="text-xs sm:text-sm text-deep-foreground/75 max-w-xl font-sans leading-relaxed">
              Real-time attendance capture, member demographics, and weekly service analytics.
            </p>

            {/* Capacity tracker */}
            <div className="pt-2 max-w-sm space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-deep-foreground/70">
                <span>
                  Member Capacity ({currentMembers} / {memberLimit.toLocaleString()})
                </span>
                <span className="font-mono font-bold text-white">{memberPercentage}%</span>
              </div>
              <Progress value={memberPercentage} className="h-1.5 bg-white/10" />
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap gap-2.5 lg:flex-col lg:items-end">
            <div className="flex flex-wrap gap-2">
              <Button
                asChild
                className="h-10 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-accent"
              >
                <Link to="/scan">
                  <QrCode className="size-4 mr-1.5" /> Door Scanner
                </Link>
              </Button>

              <Button
                asChild
                variant="outline"
                className="h-10 rounded-xl border-deep-foreground/30 bg-deep-foreground/10 text-deep-foreground hover:bg-deep-foreground/20 hover:text-deep-foreground font-semibold"
              >
                <Link to="/attendance">
                  <ListChecks className="size-4 mr-1.5" /> Register
                </Link>
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="h-8 rounded-lg text-deep-foreground/80 hover:text-deep-foreground hover:bg-white/10 text-xs font-medium"
              >
                <Link to="/services">
                  <CalendarDays className="size-3.5 mr-1" /> Special Programs
                </Link>
              </Button>

              <Button
                asChild
                variant="ghost"
                size="sm"
                className="h-8 rounded-lg text-deep-foreground/80 hover:text-deep-foreground hover:bg-white/10 text-xs font-medium"
              >
                <Link to="/members">
                  <UserPlus className="size-3.5 mr-1" /> Add Member
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </motion.section>

      {/* Filter Toolbar */}
      <section
        aria-label="Dashboard filters"
        className="surface rounded-2xl border border-border/80 p-4 shadow-sm grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_auto] lg:items-end"
      >
        <div className="space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Service Program Filter
          </span>
          <select
            value={serviceName}
            onChange={(event) => setServiceName(event.target.value)}
            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm font-medium focus:ring-2 focus:ring-primary/20"
          >
            <option value="all">All Services & Programs</option>
            {serviceOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            From Date
          </span>
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm font-medium focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            To Date
          </span>
          <input
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm font-medium focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <Button
          variant={hasFilters ? "outline" : "secondary"}
          onClick={() => {
            setServiceName("all");
            setDateFrom("");
            setDateTo("");
          }}
          disabled={!hasFilters}
          className="h-10 rounded-xl font-semibold"
        >
          <X className="size-4 mr-1.5" /> Clear Filters
        </Button>
      </section>

      {/* KPI Tiles */}
      <section data-tour="page-kpi-cards" className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map((m, idx) => {
          const Icon = m.icon;
          return (
            <motion.div
              key={m.label}
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04 }}
              className="surface rounded-2xl border border-border/80 p-5 shadow-sm transition-all hover:border-primary/40 hover:shadow-panel flex flex-col justify-between"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {m.label}
                  </p>
                  <p className="mt-2 text-3xl font-display font-bold text-ink tabular-nums">
                    {m.value.toLocaleString()}
                  </p>
                </div>
                <div className={`grid size-11 place-items-center rounded-2xl border ${m.tint}`}>
                  <Icon className="size-5" />
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground font-medium pt-2 border-t border-border/60">
                {m.subtitle}
              </p>
            </motion.div>
          );
        })}
      </section>

      {/* Absence Alerts */}
      <AbsenceAlerts />

      {/* Attendance Growth Trend */}
      <section data-tour="page-attendance-trend" className="surface rounded-2xl border border-border/80 p-5 shadow-panel space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-ink flex items-center gap-2">
              <TrendingUp className="size-5 text-primary" /> Attendance Growth Trend
            </h2>
            <p className="text-xs text-muted-foreground">
              Attendance counts per service chronologically over time.
            </p>
          </div>
          <Badge variant="outline" className="font-mono text-xs font-semibold">
            {filteredTrend.length} data points
          </Badge>
        </div>

        {filteredTrend.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            No attendance data matching your filter window.
          </div>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={filteredTrend} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis
                  dataKey="service_date"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                />
                <Tooltip
                  cursor={{ fill: "var(--color-accent)", opacity: 0.1 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const item = payload[0]!.payload as {
                      name: string;
                      service_date: string;
                      attendance: number;
                    };
                    return (
                      <div className="rounded-xl border border-border bg-card p-3 shadow-panel text-xs">
                        <p className="font-bold text-foreground font-display">{item.name}</p>
                        <p className="text-muted-foreground">{item.service_date}</p>
                        <p className="mt-1 text-sm font-bold text-primary font-mono">
                          {item.attendance} present
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="attendance"
                  fill="var(--color-primary)"
                  radius={[8, 8, 2, 2]}
                  maxBarSize={44}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Demographics Split */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Gender Demographics */}
        <section className="surface rounded-2xl border border-border/80 p-5 shadow-panel space-y-4">
          <h2 className="font-display text-base font-bold text-ink flex items-center gap-2">
            <VenusAndMars className="size-4 text-chart-2" /> Gender Distribution
          </h2>

          {(data?.gender ?? []).length === 0 ? (
            <p className="p-8 text-center text-xs text-muted-foreground">No gender records yet.</p>
          ) : (
            <div className="space-y-3">
              {(data?.gender ?? []).map((item, idx) => {
                const pct = genderTotal > 0 ? Math.round((item.value / genderTotal) * 100) : 0;
                return (
                  <div key={item.label} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-medium">
                      <span className="capitalize">{item.label}</span>
                      <span className="font-mono text-muted-foreground">
                        {item.value} ({pct}%)
                      </span>
                    </div>
                    <Progress value={pct} className="h-2" />
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Age Demographics */}
        <section className="surface rounded-2xl border border-border/80 p-5 shadow-panel space-y-4">
          <h2 className="font-display text-base font-bold text-ink flex items-center gap-2">
            <Cake className="size-4 text-amber-500" /> Age Bands
          </h2>

          {(data?.age_bands ?? []).length === 0 ? (
            <p className="p-8 text-center text-xs text-muted-foreground">
              No date of birth records yet.
            </p>
          ) : (
            <div className="space-y-3">
              {(data?.age_bands ?? []).map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between text-xs py-1 border-b border-border/50"
                >
                  <span className="font-medium text-foreground">{item.label}</span>
                  <Badge variant="secondary" className="font-mono text-[11px]">
                    {item.value} members
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default Dashboard;
