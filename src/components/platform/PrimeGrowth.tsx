import { useState } from "react";
import {
  BarChart3,
  TrendingUp,
  Building2,
  Users,
  Check,
  Calendar,
  Activity,
  UserX,
} from "lucide-react";
import { motion } from "framer-motion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { planLabel } from "@/lib/pricing";
import { type Snapshot, fmtDate, fmtBytes } from "./prime-types";

export function PrimeGrowth({ d }: { d: Snapshot }) {
  const [planFilter, setPlanFilter] = useState("all");
  const [activityWindow, setActivityWindow] = useState<"30" | "all">("30");

  const t = d.tenants;
  const now = Date.now();

  const filteredTenants = t.filter((c) => planFilter === "all" || c.tier === planFilter);

  const new30 = t.filter((x) => new Date(x.created_at) > new Date(now - 30 * 864e5)).length;
  const new90 = t.filter((x) => new Date(x.created_at) > new Date(now - 90 * 864e5)).length;

  const activeChurches = t.filter((x) => x.usage.attendance30 > 0);
  const inactiveChurches = t.filter((x) => x.usage.attendance30 === 0 && x.status === "active");
  const trialChurches = t.filter((x) => x.trial_ends_at && new Date(x.trial_ends_at) > new Date());

  // Activation rate: churches that have created at least 1 service or recorded check-ins
  const activated = t.filter((x) => x.usage.services > 0 || x.usage.attendance > 0).length;
  const activationRate = t.length > 0 ? Math.round((activated / t.length) * 100) : 0;

  const totalMembers = t.reduce((s, x) => s + x.usage.members, 0);
  const totalAttendance = t.reduce((s, x) => s + x.usage.attendance, 0);
  const totalServices = t.reduce((s, x) => s + x.usage.services, 0);

  const avgMembers = t.length ? Math.round(totalMembers / t.length) : 0;
  const avgCheckinsPerService = totalServices > 0 ? Math.round(totalAttendance / totalServices) : 0;

  // Monthly new churches trend
  const months = Array.from({ length: 12 }, (_, i) => {
    const dt = new Date();
    dt.setMonth(dt.getMonth() - (11 - i), 1);
    const key = dt.toISOString().slice(0, 7);
    return {
      key: key.slice(5),
      label: new Intl.DateTimeFormat(undefined, { month: "short" }).format(dt),
      count: t.filter((c) => c.created_at.startsWith(key)).length,
    };
  });
  const maxMonth = Math.max(1, ...months.map((m) => m.count));

  // Rankings
  const ranked = [...filteredTenants].sort((a, b) => b.usage.attendance30 - a.usage.attendance30);
  const mostActive = ranked.slice(0, 8);
  const leastActive = [...ranked]
    .filter((x) => x.status === "active")
    .reverse()
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-eyebrow">Congregational & Engagement Metrics</p>
          <h1 className="mt-1 font-display text-2xl font-bold">Growth & Usage Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Platform-wide aggregated trends and participation metrics. Strictly zero individual
            member data.
          </p>
        </div>

        <Select value={planFilter} onValueChange={setPlanFilter}>
          <SelectTrigger className="w-40 h-9 text-xs">
            <SelectValue placeholder="Filter by plan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All packages</SelectItem>
            <SelectItem value="free">Free</SelectItem>
            <SelectItem value="standard">Standard</SelectItem>
            <SelectItem value="pro">Pro</SelectItem>
            <SelectItem value="premium">Premium</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">New Churches</p>
          <p className="mt-2 text-2xl font-bold">
            {new30}{" "}
            <span className="text-sm font-normal text-muted-foreground">(30d) · {new90} (90d)</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {trialChurches.length} currently on active 30-day trials
          </p>
        </div>

        <div className="surface p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Activation Rate</p>
          <p className="mt-2 text-2xl font-bold text-emerald-600">{activationRate}%</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {activated} of {t.length} churches held services or check-ins
          </p>
        </div>

        <div className="surface p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Active Churches</p>
          <p className="mt-2 text-2xl font-bold">
            {activeChurches.length}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              / {t.filter((x) => x.status === "active").length} active
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {inactiveChurches.length} active churches with 0 check-ins in 30d
          </p>
        </div>

        <div className="surface p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Avg Usage Ratios</p>
          <p className="mt-2 text-2xl font-bold">
            {avgMembers}{" "}
            <span className="text-sm font-normal text-muted-foreground">members/church</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            ~{avgCheckinsPerService} check-ins per recorded service
          </p>
        </div>
      </div>

      {/* Visual Trends */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Registrations Chart */}
        <div className="surface p-5">
          <p className="text-sm font-semibold">New Church Registrations by Month</p>
          <p className="text-xs text-muted-foreground mb-4">Past 12-month signup trajectory</p>

          <div className="flex h-44 items-end gap-2 pt-4">
            {months.map((m) => (
              <div key={m.key} className="group flex flex-1 flex-col items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                  {m.count}
                </span>
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${(m.count / maxMonth) * 100}%` }}
                  transition={{ duration: 0.4 }}
                  className="w-full min-h-[3px] rounded-t bg-primary/80 group-hover:bg-primary transition-colors"
                />
                <span className="truncate text-[10px] text-muted-foreground">{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 12-Week Check-in Trend */}
        <div className="surface p-5">
          <p className="text-sm font-semibold">Weekly Check-in Volume (Platform Total)</p>
          <p className="text-xs text-muted-foreground mb-4">Last 12 weeks attendance aggregate</p>

          <div className="flex h-44 items-end gap-2 pt-4">
            {(() => {
              const maxWeek = Math.max(1, ...d.weekly.map((w) => w.checkins));
              return d.weekly.map((w) => (
                <div key={w.week} className="group flex flex-1 flex-col items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                    {w.checkins}
                  </span>
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${(w.checkins / maxWeek) * 100}%` }}
                    transition={{ duration: 0.4 }}
                    className="w-full min-h-[3px] rounded-t bg-sky-500/80 group-hover:bg-sky-500 transition-colors"
                  />
                  <span className="truncate text-[9px] text-muted-foreground">
                    {w.week.slice(5)}
                  </span>
                </div>
              ));
            })()}
          </div>
        </div>
      </div>

      {/* Rankings: Most Active vs Least Active */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="surface p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-sm">Most Active Churches (Last 30 Days)</p>
            <span className="text-xs text-muted-foreground">By check-in volume</span>
          </div>
          <div className="divide-y text-xs">
            {mostActive.map((church) => (
              <div key={church.id} className="py-2.5 flex justify-between items-center">
                <div>
                  <p className="font-medium text-foreground">{church.name}</p>
                  <p className="text-muted-foreground text-[11px]">
                    {planLabel(church.tier)} · {church.usage.members} members
                  </p>
                </div>
                <div className="text-right">
                  <span className="font-bold text-sm tabular-nums text-foreground">
                    {church.usage.attendance30.toLocaleString()}
                  </span>
                  <p className="text-[10px] text-muted-foreground">check-ins</p>
                </div>
              </div>
            ))}
            {mostActive.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">No data available.</p>
            )}
          </div>
        </div>

        <div className="surface p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-sm">Churches Needing Engagement Attention</p>
            <span className="text-xs text-muted-foreground">Active status with low activity</span>
          </div>
          <div className="divide-y text-xs">
            {leastActive.map((church) => (
              <div key={church.id} className="py-2.5 flex justify-between items-center">
                <div>
                  <p className="font-medium text-foreground">{church.name}</p>
                  <p className="text-muted-foreground text-[11px]">
                    {planLabel(church.tier)} · Joined {fmtDate(church.created_at)}
                  </p>
                </div>
                <div className="text-right">
                  <span className="font-medium tabular-nums text-muted-foreground">
                    {church.usage.attendance30} in 30d
                  </span>
                  <p className="text-[10px] text-muted-foreground">
                    Last active: {fmtDate(church.usage.last_activity)}
                  </p>
                </div>
              </div>
            ))}
            {leastActive.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">
                All active churches are engaged.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
