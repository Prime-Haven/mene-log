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
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Mene:Log" },
      {
        name: "description",
        content: "Attendance totals, growth trend and demographics for your church.",
      },
      { property: "og:title", content: "Dashboard — Mene:Log" },
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

function Dashboard() {
  const ctx = useTenant();
  const { tenant } = ctx;
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
  const metrics = [
    {
      label: "Total members",
      value: data?.members ?? 0,
      icon: Users,
      tint: "bg-primary/10 text-primary",
    },
    {
      label: "Last attendance",
      value: data?.last_service_attendance ?? 0,
      icon: TrendingUp,
      tint: "bg-success/10 text-success",
    },
    {
      label: "First-timers · 30 days",
      value: data?.first_timers_30d ?? 0,
      icon: UserPlus,
      tint: "bg-chart-2/10 text-chart-2",
    },
    {
      label: "Services recorded",
      value: data?.services ?? 0,
      icon: CalendarDays,
      tint: "bg-chart-4/10 text-chart-4",
    },
    {
      label: "Average attendance",
      value: averageAttendance,
      icon: ChartNoAxesColumn,
      tint: "bg-chart-3/10 text-chart-3",
    },
    {
      label: "Birthdays this month",
      value: birthdays?.length ?? 0,
      icon: Cake,
      tint: "bg-chart-5/10 text-chart-5",
    },
    {
      label: "Profile coverage",
      value: `${data?.members ? Math.round((genderTotal / data.members) * 100) : 0}%`,
      icon: VenusAndMars,
      tint: "bg-secondary text-secondary-foreground",
    },
    {
      label: "Member capacity",
      value: `${data?.members ?? 0} / ${ctx.limitWithExtras("member_limit").toLocaleString()}`,
      icon: Users,
      tint: "bg-primary/10 text-primary",
    },
  ];

  return (
    <div className="space-y-5">
      <motion.section
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-lg bg-deep px-5 py-6 text-deep-foreground shadow-[var(--shadow-panel)] sm:px-7"
      >
        <div className="absolute inset-y-0 right-0 w-1/3 bg-primary/15" aria-hidden="true" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold text-deep-foreground/65">
              Church operations overview
            </p>
            <h1 className="mt-1 text-2xl font-bold text-deep-foreground">Hello, {tenant?.name}</h1>
            <p className="mt-1 text-xs text-deep-foreground/60">
              menelog.site/c/{tenant?.subdomain}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              asChild
              variant="outline"
              className="border-deep-foreground/25 bg-deep-foreground/10 text-deep-foreground hover:bg-deep-foreground/20 hover:text-deep-foreground"
            >
              <Link to="/members">
                <UserPlus className="size-4" /> Add member
              </Link>
            </Button>
            <Button asChild>
              <Link to="/scan">
                <QrCode className="size-4" /> Record attendance
              </Link>
            </Button>
          </div>
        </div>
      </motion.section>

      <section
        aria-label="Dashboard filters"
        className="grid gap-3 border-y border-border bg-card/60 py-4 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_auto] lg:items-end"
      >
        <label className="space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Service type
          </span>
          <select
            value={serviceName}
            onChange={(event) => setServiceName(event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">All services</option>
            {serviceOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            From
          </span>
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            To
          </span>
          <input
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          />
        </label>
        <Button
          variant={hasFilters ? "outline" : "secondary"}
          disabled={!hasFilters}
          onClick={() => {
            setServiceName("all");
            setDateFrom("");
            setDateTo("");
          }}
        >
          <X className="size-4" /> Clear
        </Button>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map(({ label, value, icon: Icon, tint }, index) => (
          <motion.div
            key={label}
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduceMotion ? 0 : index * 0.035 }}
            className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-panel)] sm:p-5"
          >
            <div className="flex items-center justify-between">
              <p className="max-w-[75%] text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                {label}
              </p>
              <span className={`grid size-8 shrink-0 place-items-center rounded-md ${tint}`}>
                <Icon className="size-4" />
              </span>
            </div>
            <p className="mt-4 break-words font-display text-2xl font-bold sm:text-3xl">{value}</p>
          </motion.div>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-panel)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Attendance trend</h2>
            <p className="mt-1 text-xs text-muted-foreground">Last 12 recorded services</p>
          </div>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Filter className="size-3.5" /> {filteredTrend.length} shown
          </span>
        </div>
        <div className="mt-4 h-64">
          {filteredTrend.length === 0 ? (
            <div className="grid h-full place-items-center rounded-md border border-dashed border-border bg-muted/30 text-center">
              <div>
                <CalendarDays className="mx-auto size-6 text-muted-foreground" />
                <p className="mt-3 text-sm font-semibold">No attendance in this view</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Create a service or clear the filters to see activity.
                </p>
                <Button asChild variant="outline" size="sm" className="mt-4">
                  <Link to="/services">Manage services</Link>
                </Button>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={filteredTrend}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  vertical={false}
                />
                <XAxis dataKey="service_date" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="attendance" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <AbsenceAlerts />

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-panel)]">
          <h2 className="text-base font-semibold">Gender split</h2>
          <div className="mt-2 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data?.gender ?? []} dataKey="value" nameKey="label" outerRadius={72}>
                  {(data?.gender ?? []).map((_, i) => (
                    <Cell key={i} fill={pieColors[i % pieColors.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-panel)]">
          <h2 className="text-base font-semibold">Age bands</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {(data?.age_bands ?? []).map((band) => (
              <li key={band.label} className="flex items-center justify-between">
                <span className="text-muted-foreground">{band.label}</span>
                <span className="font-semibold">{band.value}</span>
              </li>
            ))}
            {(data?.age_bands ?? []).length === 0 && (
              <li className="text-muted-foreground">No member records yet.</li>
            )}
          </ul>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-panel)]">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Cake className="size-4 text-primary" /> Birthdays this month
          </h2>
          <ul className="mt-4 space-y-2 text-sm">
            {(birthdays ?? []).slice(0, 8).map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2">
                <span className="truncate">{b.full_name}</span>
                <span className="shrink-0 text-muted-foreground">
                  {b.date_of_birth ? new Date(b.date_of_birth).getDate() : ""}
                </span>
              </li>
            ))}
            {(birthdays ?? []).length === 0 && (
              <li className="text-muted-foreground">Nobody this month.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
