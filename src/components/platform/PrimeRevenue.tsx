import { useState, useMemo } from "react";
import {
  CircleDollarSign,
  Download,
  Search,
  Filter,
  CreditCard,
  Phone,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { planLabel, intervalFromReference } from "@/lib/pricing";
import { type Snapshot, fmtDate, fmtDateTime, usd, downloadCsv } from "./prime-types";

const GHS_USD_RATE = 15.5; // Stored explicit conversion basis for analytics

export function PrimeRevenue({ d }: { d: Snapshot }) {
  const [q, setQ] = useState("");
  const [tierFilter, setTierFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currencyFilter, setCurrencyFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [intervalFilter, setIntervalFilter] = useState("all");
  const [dateWindow, setDateWindow] = useState<"all" | "30" | "90" | "365">("all");

  const churchNames = useMemo(
    () => Object.fromEntries(d.tenants.map((t) => [t.id, t.name])),
    [d.tenants],
  );

  const now = Date.now();

  const allPayments = d.payments;
  const successful = allPayments.filter((p) => p.status === "success");
  const failed = allPayments.filter((p) => p.status === "failed");
  const pending = allPayments.filter((p) => p.status === "pending");

  // Accurate separate currency aggregates
  const usdSuccessTotal = successful
    .filter((p) => p.currency === "USD")
    .reduce((s, p) => s + p.amount_kobo / 100, 0);

  const ghsSuccessTotal = successful
    .filter((p) => p.currency === "GHS")
    .reduce((s, p) => s + p.amount_kobo / 100, 0);

  // Normalised USD equivalent with explicitly stored basis
  const grossUsdEquiv = usdSuccessTotal + ghsSuccessTotal / GHS_USD_RATE;

  const withinDays = (days: number) => {
    const cutoff = new Date(now - days * 864e5);
    return successful.filter((p) => new Date(p.paid_at ?? p.created_at) > cutoff);
  };

  const m30Payments = withinDays(30);
  const y365Payments = withinDays(365);

  const m30Usd = m30Payments.reduce(
    (s, p) => s + (p.currency === "USD" ? p.amount_kobo / 100 : p.amount_kobo / 100 / GHS_USD_RATE),
    0,
  );
  const y365Usd = y365Payments.reduce(
    (s, p) => s + (p.currency === "USD" ? p.amount_kobo / 100 : p.amount_kobo / 100 / GHS_USD_RATE),
    0,
  );

  const avgSuccessPayment =
    successful.length > 0 ? Math.round(grossUsdEquiv / successful.length) : 0;

  // Space requests revenue
  const extraSpaceTotalCents = (d.space_requests ?? [])
    .filter((s) => s.status === "approved" || s.status === "completed")
    .reduce((s, r) => s + (r.amount_cents ?? 0), 0);

  // Upcoming renewals & at-risk calculation
  const renewals = d.tenants.filter((t) => {
    const end = (t.sub as { period_end?: string } | null)?.period_end;
    return (
      end &&
      !end.startsWith("9999") &&
      new Date(end) > new Date() &&
      new Date(end) < new Date(now + 14 * 864e5)
    );
  });

  const atRiskChurches = d.tenants.filter(
    (t) =>
      t.status === "grace" ||
      (t.status === "active" &&
        (t.sub as { period_end?: string } | null)?.period_end &&
        new Date((t.sub as { period_end?: string }).period_end!) < new Date()),
  );

  // 12-month revenue trend
  const months = Array.from({ length: 12 }, (_, i) => {
    const dt = new Date();
    dt.setMonth(dt.getMonth() - (11 - i), 1);
    const key = dt.toISOString().slice(0, 7);
    const monthSuccess = successful.filter((p) => (p.paid_at ?? p.created_at).startsWith(key));
    const monthFailed = failed.filter((p) => (p.created_at ?? "").startsWith(key));

    const revUsd = monthSuccess.reduce(
      (s, p) =>
        s + (p.currency === "USD" ? p.amount_kobo / 100 : p.amount_kobo / 100 / GHS_USD_RATE),
      0,
    );

    return {
      key: key.slice(5),
      label: new Intl.DateTimeFormat(undefined, { month: "short" }).format(dt),
      revenue: Math.round(revUsd),
      successCount: monthSuccess.length,
      failedCount: monthFailed.length,
    };
  });

  const maxMonthRev = Math.max(1, ...months.map((m) => m.revenue));

  // Channel & interval mix
  const yearlyCount = successful.filter((p) => p.reference.startsWith("gchy")).length;
  const monthlyCount = successful.length - yearlyCount;
  const cardCount = successful.filter((p) => p.channel === "card").length;
  const momoCount = successful.filter((p) => p.channel === "mobile_money").length;

  // Filtered Payments Table
  const filteredPayments = useMemo(() => {
    return allPayments.filter((p) => {
      const matchQ =
        !q ||
        p.reference.toLowerCase().includes(q.toLowerCase()) ||
        (churchNames[p.tenant_id] ?? "").toLowerCase().includes(q.toLowerCase());

      const matchTier = tierFilter === "all" || p.tier === tierFilter;
      const matchStatus = statusFilter === "all" || p.status === statusFilter;
      const matchCurrency = currencyFilter === "all" || p.currency === currencyFilter;
      const matchChannel = channelFilter === "all" || p.channel === channelFilter;
      const isYearly = p.reference.startsWith("gchy");
      const matchInterval =
        intervalFilter === "all" ||
        (intervalFilter === "yearly" && isYearly) ||
        (intervalFilter === "monthly" && !isYearly);

      let matchDate = true;
      if (dateWindow !== "all") {
        const days = Number(dateWindow);
        const pDate = new Date(p.paid_at ?? p.created_at).getTime();
        matchDate = pDate > now - days * 864e5;
      }

      return (
        matchQ &&
        matchTier &&
        matchStatus &&
        matchCurrency &&
        matchChannel &&
        matchInterval &&
        matchDate
      );
    });
  }, [
    allPayments,
    q,
    tierFilter,
    statusFilter,
    currencyFilter,
    channelFilter,
    intervalFilter,
    dateWindow,
    churchNames,
    now,
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-eyebrow">Financial Telemetry</p>
          <h1 className="mt-1 font-display text-2xl font-bold">Revenue & Billing Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Accurate multi-currency processing. Currencies recorded directly as transacted; USD
            normalisation computed at 1 USD = {GHS_USD_RATE} GHS.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            downloadCsv(
              "revenue-export.csv",
              filteredPayments.map((p) => ({
                reference: p.reference,
                church: churchNames[p.tenant_id] ?? "Unknown",
                plan: planLabel(p.tier),
                interval: intervalFromReference(p.reference),
                amount: (p.amount_kobo / 100).toFixed(2),
                currency: p.currency,
                channel: p.channel ?? "card",
                status: p.status,
                paid_at: p.paid_at,
                created_at: p.created_at,
              })),
            )
          }
          className="gap-2"
        >
          <Download className="size-4" /> Export Filtered CSV ({filteredPayments.length})
        </Button>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Gross Revenue</p>
          <p className="mt-2 text-2xl font-bold">{usd(grossUsdEquiv)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            USD: ${usdSuccessTotal.toLocaleString()} · GHS: GH₵{ghsSuccessTotal.toLocaleString()}
          </p>
        </div>

        <div className="surface p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Recent Revenue (30d / 12m)
          </p>
          <p className="mt-2 text-2xl font-bold">
            {usd(m30Usd)}{" "}
            <span className="text-sm font-normal text-muted-foreground">/ {usd(y365Usd)}</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {m30Payments.length} successful transactions in 30d
          </p>
        </div>

        <div className="surface p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Payment Health & Avg
          </p>
          <p className="mt-2 text-2xl font-bold">
            {successful.length}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ok · {failed.length} failed
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Avg payment: {usd(avgSuccessPayment)} per transaction
          </p>
        </div>

        <div className="surface p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Renewals & Extra Capacity
          </p>
          <p className="mt-2 text-2xl font-bold">
            {renewals.length}{" "}
            <span className="text-sm font-normal text-muted-foreground">renewals in 14d</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Extra space sales: ${(extraSpaceTotalCents / 100).toFixed(0)} · At risk:{" "}
            {atRiskChurches.length} churches
          </p>
        </div>
      </div>

      {/* Visual Trends and Channels */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* 12-Month Revenue Trend */}
        <div className="surface p-5">
          <p className="text-sm font-semibold">Monthly Revenue Trend (USD Equivalent)</p>
          <p className="text-xs text-muted-foreground mb-4">Converted from GHS where applicable</p>

          <div className="flex h-44 items-end gap-2 pt-4">
            {months.map((m) => (
              <div key={m.key} className="group flex flex-1 flex-col items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                  {usd(m.revenue)}
                </span>
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${(m.revenue / maxMonthRev) * 100}%` }}
                  transition={{ duration: 0.4 }}
                  className="w-full min-h-[3px] rounded-t bg-emerald-600/80 group-hover:bg-emerald-600 transition-colors"
                />
                <span className="truncate text-[10px] text-muted-foreground">{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Channel & Interval Mix */}
        <div className="surface p-5 space-y-4">
          <p className="text-sm font-semibold">Payment Channels & Interval Mix</p>

          <div className="space-y-3 pt-2 text-xs">
            <div>
              <div className="flex justify-between mb-1.5">
                <span>Billing Interval: Monthly vs Yearly</span>
                <span className="text-muted-foreground">
                  {monthlyCount} monthly (
                  {Math.round((monthlyCount / (successful.length || 1)) * 100)}%) · {yearlyCount}{" "}
                  yearly ({Math.round((yearlyCount / (successful.length || 1)) * 100)}%)
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden bg-muted flex">
                <div
                  className="bg-primary h-full"
                  style={{ width: `${(monthlyCount / (successful.length || 1)) * 100}%` }}
                />
                <div
                  className="bg-purple-600 h-full"
                  style={{ width: `${(yearlyCount / (successful.length || 1)) * 100}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1.5">
                <span>Payment Channel: Card vs Mobile Money</span>
                <span className="text-muted-foreground">
                  {cardCount} card · {momoCount} mobile money
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden bg-muted flex">
                <div
                  className="bg-sky-500 h-full"
                  style={{ width: `${(cardCount / (successful.length || 1)) * 100}%` }}
                />
                <div
                  className="bg-amber-500 h-full"
                  style={{ width: `${(momoCount / (successful.length || 1)) * 100}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1.5">
                <span>Currencies Handled</span>
                <span className="text-muted-foreground">
                  USD: ${usdSuccessTotal.toLocaleString()} · GHS: GH₵
                  {ghsSuccessTotal.toLocaleString()}
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden bg-muted flex">
                <div
                  className="bg-emerald-600 h-full"
                  style={{ width: `${(usdSuccessTotal / (grossUsdEquiv || 1)) * 100}%` }}
                />
                <div
                  className="bg-teal-500 h-full"
                  style={{
                    width: `${(ghsSuccessTotal / GHS_USD_RATE / (grossUsdEquiv || 1)) * 100}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Filters Bar */}
      <div className="surface p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Filter className="size-3.5" />
          Filter Payments
        </div>
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-6">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-2.5 size-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-9 text-xs"
              placeholder="Search reference or church..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="success">Success only</SelectItem>
              <SelectItem value="failed">Failed only</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>

          <Select value={tierFilter} onValueChange={setTierFilter}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Plan" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All plans</SelectItem>
              <SelectItem value="basic">Standard</SelectItem>
              <SelectItem value="standard">Pro</SelectItem>
              <SelectItem value="premium">Premium</SelectItem>
            </SelectContent>
          </Select>

          <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Currency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All currencies</SelectItem>
              <SelectItem value="USD">USD ($)</SelectItem>
              <SelectItem value="GHS">GHS (GH₵)</SelectItem>
            </SelectContent>
          </Select>

          <Select value={dateWindow} onValueChange={(v) => setDateWindow(v as typeof dateWindow)}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Timeframe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All time</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last 12 months</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Filtered Payments Registry Table */}
      <div className="surface divide-y divide-border overflow-hidden">
        {filteredPayments.map((p) => (
          <div
            key={p.id}
            className="p-4 grid gap-3 sm:grid-cols-[1.5fr_1fr_1fr_auto] items-center text-xs"
          >
            <div>
              <p className="font-semibold text-foreground text-sm">
                {churchNames[p.tenant_id] ?? "Church"}
              </p>
              <p className="font-mono text-[11px] text-muted-foreground mt-0.5">{p.reference}</p>
            </div>

            <div>
              <p className="font-medium text-foreground">
                {planLabel(p.tier)} plan · {intervalFromReference(p.reference)}
              </p>
              <p className="text-muted-foreground mt-0.5">Channel: {p.channel ?? "card"}</p>
            </div>

            <div>
              <p className="font-bold text-sm tabular-nums">
                {p.currency} {(p.amount_kobo / 100).toFixed(2)}
              </p>
              <p className="text-muted-foreground text-[11px]">
                {fmtDateTime(p.paid_at ?? p.created_at)}
              </p>
            </div>

            <div>
              <Badge
                variant={
                  p.status === "success"
                    ? "default"
                    : p.status === "failed"
                      ? "destructive"
                      : "outline"
                }
                className="capitalize"
              >
                {p.status}
              </Badge>
            </div>
          </div>
        ))}

        {filteredPayments.length === 0 && (
          <p className="p-8 text-center text-xs text-muted-foreground">
            No transactions match the selected filters.
          </p>
        )}
      </div>
    </div>
  );
}
