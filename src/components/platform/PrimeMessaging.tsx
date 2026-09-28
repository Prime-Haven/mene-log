import { useState, useMemo } from "react";
import {
  Mail,
  RefreshCw,
  AlertTriangle,
  Hourglass,
  CheckCircle2,
  Filter,
  Search,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type Snapshot, type Act } from "./prime-types";

export function PrimeMessaging({ d, act }: { d: Snapshot; act: Act }) {
  const [q, setQ] = useState("");
  const [channelFilter, setChannelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [retryModal, setRetryModal] = useState(false);

  const churchNames = useMemo(
    () => Object.fromEntries(d.tenants.map((t) => [t.id, t.name])),
    [d.tenants],
  );

  const sum = (k: "email_sent" | "sms_sent" | "failed" | "queued") =>
    d.tenants.reduce((s, t) => s + t.messaging[k], 0);

  const totalSent = sum("email_sent") + sum("sms_sent");
  const totalFailed = sum("failed");
  const totalQueued = sum("queued");
  const successRate =
    totalSent + totalFailed > 0 ? Math.round((totalSent / (totalSent + totalFailed)) * 100) : 100;

  const errorsByCategory = d.messaging_errors ?? {};

  // Filter church list
  const filteredChurches = useMemo(() => {
    return d.tenants.filter((t) => {
      const matchQ = !q || t.name.toLowerCase().includes(q.toLowerCase());
      const hasFailed = t.messaging.failed > 0;
      const hasQueued = t.messaging.queued > 0;

      if (statusFilter === "failed") return matchQ && hasFailed;
      if (statusFilter === "queued") return matchQ && hasQueued;
      return matchQ;
    });
  }, [d.tenants, q, statusFilter]);

  const busiest = [...d.tenants]
    .sort(
      (a, b) =>
        b.messaging.email_sent +
        b.messaging.sms_sent -
        (a.messaging.email_sent + a.messaging.sms_sent),
    )
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-eyebrow">Communication Pipeline</p>
          <h1 className="mt-1 font-display text-2xl font-bold">Messaging Health & Delivery</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Delivery metrics and queue state over the last 30 days. Strictly aggregated counts —
            recipients, subjects, and message bodies are never exposed.
          </p>
        </div>

        <Button
          variant="outline"
          disabled={totalFailed === 0 || act.isPending}
          onClick={() => setRetryModal(true)}
          className="gap-2"
        >
          <RefreshCw className={`size-4 ${act.isPending ? "animate-spin" : ""}`} /> Retry all failed
          ({totalFailed})
        </Button>
      </div>

      <Dialog open={retryModal} onOpenChange={setRetryModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retry failed messages</DialogTitle>
            <DialogDescription>
              Re-queue all {totalFailed} failed messages across all churches?
            </DialogDescription>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Messages will be returned to the queued state and retried using available delivery
            channels.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRetryModal(false)}>
              Cancel
            </Button>
            <Button
              disabled={act.isPending}
              onClick={() => {
                act.mutate(
                  { type: "retry_failed", tenant_id: null },
                  { onSuccess: () => setRetryModal(false) },
                );
              }}
            >
              Confirm retry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* KPI Summary Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Delivery Success Rate
          </p>
          <p className="mt-2 text-2xl font-bold text-emerald-600">{successRate}%</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {totalSent.toLocaleString()} sent · {totalFailed.toLocaleString()} failed (30d)
          </p>
        </div>

        <div className="surface p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Email vs SMS Split
          </p>
          <p className="mt-2 text-2xl font-bold">{sum("email_sent").toLocaleString()}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Emails sent · {sum("sms_sent").toLocaleString()} SMS sent
          </p>
        </div>

        <div className="surface p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">24-Hour Velocity</p>
          <p className="mt-2 text-2xl font-bold">{d.health.sent_24h.toLocaleString()}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Messages sent in 24h · {d.health.failed_24h} failed
          </p>
        </div>

        <div className="surface p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Queue State</p>
          <p className="mt-2 text-2xl font-bold">
            {totalQueued} <span className="text-sm font-normal text-muted-foreground">queued</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {d.health.stuck_queue > 0 ? (
              <span className="text-destructive font-semibold">
                {d.health.stuck_queue} waiting &gt; 1h
              </span>
            ) : (
              "Queue moving normally"
            )}
          </p>
        </div>
      </div>

      {/* Safe Error Categorization & Busiest Churches */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Failures by Safe Error Category */}
        <div className="surface p-5 space-y-3">
          <p className="text-sm font-semibold">Delivery Failures by Safe Category</p>
          <p className="text-xs text-muted-foreground">
            Categorized without exposing message bodies, recipient identities or phone numbers
          </p>

          <div className="divide-y text-xs pt-1">
            {Object.entries(errorsByCategory).map(([category, count]) => (
              <div key={category} className="py-2.5 flex justify-between items-center">
                <span className="font-medium text-foreground">{category}</span>
                <span className="font-mono text-destructive font-semibold">
                  {count.toLocaleString()} failures
                </span>
              </div>
            ))}
            {Object.keys(errorsByCategory).length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">
                No failure categories recorded in the last 30 days.
              </p>
            )}
          </div>
        </div>

        {/* Busiest Churches by Messaging Volume */}
        <div className="surface p-5 space-y-3">
          <p className="text-sm font-semibold">Busiest Churches by Volume (30d)</p>
          <p className="text-xs text-muted-foreground">Churches with highest transmission counts</p>

          <div className="divide-y text-xs pt-1">
            {busiest.map((church) => {
              const total = church.messaging.email_sent + church.messaging.sms_sent;
              return (
                <div key={church.id} className="py-2.5 flex justify-between items-center">
                  <div>
                    <p className="font-medium text-foreground">{church.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {church.messaging.email_sent} email · {church.messaging.sms_sent} SMS
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="font-bold tabular-nums">{total.toLocaleString()}</span>
                    <p className="text-[10px] text-muted-foreground">total</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Per-Church Messaging Table */}
      <div className="surface divide-y divide-border overflow-hidden">
        <div className="p-4 bg-muted/20 flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-2.5 size-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-xs"
              placeholder="Search church name..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44 h-8 text-xs">
              <SelectValue placeholder="Status filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All churches</SelectItem>
              <SelectItem value="failed">With failed messages</SelectItem>
              <SelectItem value="queued">With queued messages</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {filteredChurches.map((church) => (
          <div
            key={church.id}
            className="p-3.5 grid gap-3 sm:grid-cols-[1.5fr_2fr_auto] items-center text-xs"
          >
            <div>
              <p className="font-semibold text-foreground">{church.name}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">/c/{church.subdomain}</p>
            </div>

            <div className="text-muted-foreground">
              <span>{church.messaging.email_sent} email</span> ·{" "}
              <span>{church.messaging.sms_sent} SMS</span> ·{" "}
              <span className={church.messaging.failed > 0 ? "text-destructive font-semibold" : ""}>
                {church.messaging.failed} failed
              </span>{" "}
              · <span>{church.messaging.queued} queued</span>
            </div>

            <div>
              <Button
                size="sm"
                variant="outline"
                disabled={church.messaging.failed === 0 || act.isPending}
                onClick={() => act.mutate({ type: "retry_failed", tenant_id: church.id })}
                className="h-8 gap-1.5"
              >
                <RefreshCw className="size-3" /> Retry failed
              </Button>
            </div>
          </div>
        ))}

        {filteredChurches.length === 0 && (
          <p className="p-8 text-center text-xs text-muted-foreground">
            No churches match the selected filter.
          </p>
        )}
      </div>
    </div>
  );
}
