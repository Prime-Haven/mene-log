import { useState, useMemo } from "react";
import {
  ClipboardList,
  Search,
  Download,
  ShieldAlert,
  AlertTriangle,
  Info,
  Building2,
  Sliders,
  ShieldCheck,
  CircleDollarSign,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  ExternalLink,
  Flame,
  Calendar,
  User,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  type Snapshot,
  type AuditEvent,
  type AuditCategory,
  type AuditSeverity,
  fmtDateTime,
  downloadCsv,
} from "./prime-types";

const CATEGORY_TABS: Array<{
  id: "all" | "critical" | AuditCategory;
  label: string;
  icon: typeof ClipboardList;
}> = [
  { id: "all", label: "All Events", icon: ClipboardList },
  { id: "critical", label: "Critical Actions", icon: Flame },
  { id: "tenant", label: "Church Lifecycle", icon: Building2 },
  { id: "system", label: "System Controls", icon: Sliders },
  { id: "security", label: "Security & Staff", icon: ShieldCheck },
  { id: "commercial", label: "Commercials & Plans", icon: CircleDollarSign },
];

export function PrimeAuditTrail({ d }: { d: Snapshot }) {
  const [selectedCategory, setSelectedCategory] = useState<"all" | "critical" | AuditCategory>("all");
  const [selectedSeverity, setSelectedSeverity] = useState<"all" | AuditSeverity>("all");
  const [query, setQuery] = useState("");
  const [inspectedEvent, setInspectedEvent] = useState<AuditEvent | null>(null);
  const [copied, setCopied] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const currentUsername = useMemo(() => {
    return d.operators.find((o) => o.is_me)?.username?.toLowerCase() ?? "operator";
  }, [d.operators]);

  // Filter audit records
  const filteredEvents = useMemo(() => {
    const q = query.trim().toLowerCase();
    return d.audit.filter((event) => {
      // Category filter
      if (selectedCategory === "critical") {
        if (event.severity !== "critical") return false;
      } else if (selectedCategory !== "all") {
        if (event.category !== selectedCategory) return false;
      }

      // Severity filter
      if (selectedSeverity !== "all") {
        if (event.severity !== selectedSeverity) return false;
      }

      // Keyword search across action, actor, church, and JSON details
      if (q) {
        const churchName = event.tenant_name ?? "";
        const detailStr = event.detail ? JSON.stringify(event.detail) : "";
        const searchTarget = `${event.action} ${event.actor} ${churchName} ${event.category} ${event.severity} ${detailStr}`.toLowerCase();
        if (!searchTarget.includes(q)) return false;
      }

      return true;
    });
  }, [d.audit, selectedCategory, selectedSeverity, query]);

  // Pagination slice
  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedEvents = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredEvents.slice(start, start + PAGE_SIZE);
  }, [filteredEvents, currentPage]);

  // Count by category for pill badges
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: d.audit.length,
      critical: d.audit.filter((e) => e.severity === "critical").length,
      tenant: d.audit.filter((e) => e.category === "tenant").length,
      system: d.audit.filter((e) => e.category === "system").length,
      security: d.audit.filter((e) => e.category === "security").length,
      commercial: d.audit.filter((e) => e.category === "commercial").length,
    };
    return counts;
  }, [d.audit]);

  const handleExportCsv = () => {
    const rowsToExport = filteredEvents.map((e) => ({
      Timestamp: e.created_at,
      Severity: e.severity.toUpperCase(),
      Category: e.category.toUpperCase(),
      Action: e.action,
      Operator: e.actor,
      Church: e.tenant_name ?? (e.tenant_id ? "Attached Church" : "System-wide"),
      Detail: JSON.stringify(e.detail ?? {}),
    }));

    const dateStr = new Date().toISOString().slice(0, 10);
    downloadCsv(`prime-haven-audit-trail-${dateStr}.csv`, rowsToExport);
    toast.success(`Exported ${rowsToExport.length} audit records to CSV`);
  };

  const handleCopyJson = (obj: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
    setCopied(true);
    toast.success("JSON copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-eyebrow">Accountability & Compliance</p>
          <h1 className="mt-1 font-display text-2xl font-bold">Audit Trail & Operations Log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Complete immutable ledger of all administrative events, security changes, church lifecycle purges, and system controls.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCsv} className="gap-1.5">
            <Download className="size-4" />
            Export Audit Trail (CSV)
          </Button>
        </div>
      </div>

      {/* Category Pills Navigation */}
      <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-1">
        {CATEGORY_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = selectedCategory === tab.id;
          const count = categoryCounts[tab.id] ?? 0;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setSelectedCategory(tab.id);
                setPage(1);
              }}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/25"
                  : "bg-surface hover:bg-muted text-muted-foreground hover:text-foreground border"
              }`}
            >
              <Icon className="size-3.5" />
              <span>{tab.label}</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                  isActive
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : tab.id === "critical" && count > 0
                      ? "bg-destructive/15 text-destructive font-black"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filter and Search Bar */}
      <div className="surface p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search action name, operator username, church name, or parameters..."
            className="pl-9 h-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="w-44">
            <Select
              value={selectedSeverity}
              onValueChange={(val) => {
                setSelectedSeverity(val as "all" | AuditSeverity);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-10 text-xs">
                <SelectValue placeholder="All Severities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                <SelectItem value="critical">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-destructive inline-block" />
                    <span>Critical Only</span>
                  </div>
                </SelectItem>
                <SelectItem value="warning">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-amber-500 inline-block" />
                    <span>Warning Only</span>
                  </div>
                </SelectItem>
                <SelectItem value="info">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-sky-500 inline-block" />
                    <span>Info Only</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(query || selectedCategory !== "all" || selectedSeverity !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery("");
                setSelectedCategory("all");
                setSelectedSeverity("all");
                setPage(1);
              }}
              className="text-xs text-muted-foreground"
            >
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Events Table / Card Feed */}
      <div className="surface divide-y rounded-2xl overflow-hidden border">
        {paginatedEvents.map((event) => {
          const isCurrentUser =
            event.actor?.toLowerCase() === currentUsername ||
            event.actor_username?.toLowerCase() === currentUsername;

          return (
            <div
              key={event.id}
              className="p-4 transition-colors hover:bg-muted/30 flex flex-col md:flex-row md:items-center justify-between gap-3 text-sm"
            >
              {/* Left Column: Severity, Category, Action */}
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <SeverityBadge severity={event.severity} />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground">
                      {formatActionTitle(event.action)}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                      {event.action}
                    </span>
                    <CategoryBadge category={event.category} />
                  </div>

                  {/* Summary row */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <User className="size-3 text-muted-foreground/80" />
                      <span>{event.actor}</span>
                      {isCurrentUser && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          You
                        </Badge>
                      )}
                    </span>

                    {(event.tenant_name || event.tenant_id) && (
                      <span className="flex items-center gap-1 font-medium text-foreground/85">
                        <Building2 className="size-3 text-primary" />
                        <span>{event.tenant_name ?? "Church ID " + event.tenant_id?.slice(0, 8)}</span>
                      </span>
                    )}

                    {event.detail && Object.keys(event.detail).length > 0 && (
                      <span className="truncate max-w-xs text-muted-foreground/80">
                        {renderDetailPreview(event.detail)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Time and Inspect Action */}
              <div className="flex items-center justify-between md:justify-end gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0">
                <div className="text-right">
                  <p className="text-xs font-medium text-foreground">{fmtDateTime(event.created_at)}</p>
                  <p className="text-[11px] text-muted-foreground">{getRelativeTime(event.created_at)}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setInspectedEvent(event)}
                  className="h-8 text-xs gap-1"
                >
                  <span>Payload</span>
                  <ExternalLink className="size-3" />
                </Button>
              </div>
            </div>
          );
        })}

        {filteredEvents.length === 0 && (
          <div className="p-12 text-center text-muted-foreground space-y-2">
            <ClipboardList className="mx-auto size-8 opacity-40" />
            <p className="font-semibold text-foreground text-sm">No audit records match your filters</p>
            <p className="text-xs">Try clearing the search query or changing the category filter.</p>
          </div>
        )}
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2 text-xs text-muted-foreground">
          <span>
            Showing {(currentPage - 1) * PAGE_SIZE + 1}–
            {Math.min(currentPage * PAGE_SIZE, filteredEvents.length)} of {filteredEvents.length} events
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-8 px-2.5"
            >
              <ChevronLeft className="size-3.5" /> Previous
            </Button>
            <span className="font-medium text-foreground px-1">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-8 px-2.5"
            >
              Next <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail Inspector Modal */}
      <Dialog open={!!inspectedEvent} onOpenChange={(open) => !open && setInspectedEvent(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {inspectedEvent && <SeverityBadge severity={inspectedEvent.severity} />}
              <span>{inspectedEvent ? formatActionTitle(inspectedEvent.action) : "Audit Event"}</span>
            </DialogTitle>
            <DialogDescription className="font-mono text-xs">
              Event ID: {inspectedEvent?.id}
            </DialogDescription>
          </DialogHeader>

          {inspectedEvent && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3 text-xs bg-muted/40 p-3.5 rounded-xl border">
                <div>
                  <p className="text-muted-foreground">Action String</p>
                  <p className="font-mono font-semibold mt-0.5 text-foreground">
                    {inspectedEvent.action}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Actor</p>
                  <p className="font-medium mt-0.5 text-foreground">{inspectedEvent.actor}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Category / Severity</p>
                  <p className="mt-0.5 capitalize text-foreground">
                    {inspectedEvent.category} · {inspectedEvent.severity}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Recorded At</p>
                  <p className="mt-0.5 text-foreground">{fmtDateTime(inspectedEvent.created_at)}</p>
                </div>
                {inspectedEvent.tenant_name && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Associated Church</p>
                    <p className="font-semibold mt-0.5 text-primary">
                      {inspectedEvent.tenant_name} ({inspectedEvent.tenant_id})
                    </p>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between pb-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Event JSON Payload
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopyJson(inspectedEvent.detail ?? {})}
                    className="h-7 text-xs gap-1.5"
                  >
                    {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                    <span>{copied ? "Copied" : "Copy JSON"}</span>
                  </Button>
                </div>
                <div className="max-h-72 overflow-y-auto rounded-xl bg-neutral-950 p-3.5 text-neutral-100 font-mono text-xs border">
                  <pre className="whitespace-pre-wrap break-all">
                    {JSON.stringify(inspectedEvent.detail ?? {}, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: AuditSeverity }) {
  if (severity === "critical") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-bold text-destructive border border-destructive/25">
        <Flame className="size-3 fill-destructive text-destructive" /> Critical
      </span>
    );
  }
  if (severity === "warning") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400 border border-amber-500/25">
        <AlertTriangle className="size-3" /> Warning
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-600 dark:text-sky-400 border border-sky-500/20">
      <Info className="size-3" /> Info
    </span>
  );
}

function CategoryBadge({ category }: { category: AuditCategory }) {
  const styles: Record<AuditCategory, string> = {
    tenant: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20",
    system: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20",
    security: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
    commercial: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
  };
  return (
    <span
      className={`capitalize rounded-md px-1.5 py-0.5 text-[10px] font-semibold border ${styles[category] ?? "bg-muted text-muted-foreground"}`}
    >
      {category}
    </span>
  );
}

function formatActionTitle(action: string): string {
  const map: Record<string, string> = {
    "tenant.permanently_purged": "Church Permanently Purged",
    "tenant.approved": "Church Approved & Activated",
    "tenant.rejected": "Church Registration Rejected",
    "tenant.flagged": "Church Flagged for Review",
    "tenant.correction_requested": "Correction Requested from Church",
    "tenant.extended": "Subscription / Trial Extended",
    "tenant.notes_updated": "Operator Notes Saved",
    "tenant.require_mfa": "Two-Step Authentication Enforced",
    "tenant.welcome_resent": "Welcome Email Resent",
    "operator.profile_updated": "Operator Profile Updated",
    "operator.password_changed": "Operator Password Changed",
    "operator.password_reset": "Operator Password Reset",
    "operator.added": "New Operator Invited",
    "operator.removed": "Operator Access Revoked",
    "operator.sign_in": "Operator Signed In",
    "operator.sign_in_failed": "Failed Operator Login Attempt",
    "system.maintenance_enabled": "Platform Maintenance Mode Enabled",
    "system.maintenance_disabled": "Platform Maintenance Mode Disabled",
    "system.broadcast_updated": "Global Broadcast Banner Updated",
    "platform.settings_saved": "Platform Configuration Saved",
    "platform.test_email": "System Email Test Sent",
    "announcement.sent": "Platform Announcement Dispatched",
    "branch.detached": "Branch Detached to Standalone Church",
    "messages.retried": "Failed Outbound Messages Requeued",
  };
  if (map[action]) return map[action];
  return action
    .replace(/[._]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderDetailPreview(detail: Record<string, unknown>): string {
  const parts: string[] = [];
  if (detail.name) parts.push(`Church: ${String(detail.name)}`);
  if (detail.username) parts.push(`Username: ${String(detail.username)}`);
  if (detail.days) parts.push(`+${detail.days} days`);
  if (detail.subject) parts.push(`Subject: "${String(detail.subject)}"`);
  if (detail.message) parts.push(`Message: "${String(detail.message)}"`);
  if (detail.reason) parts.push(`Reason: ${String(detail.reason)}`);
  if (parts.length > 0) return parts.join(" · ");
  const keys = Object.keys(detail);
  return keys.length > 0 ? `${keys.join(", ")}` : "";
}

function getRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
