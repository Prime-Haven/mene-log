import { useState, useMemo } from "react";
import {
  Building2,
  Download,
  Plus,
  Search,
  Filter,
  Pencil,
  Clock,
  Layers,
  Mail,
  ShieldCheck,
  RotateCcw,
  AlertTriangle,
  FolderArchive,
  ArrowRight,
  Users,
  Trash2,
  FileDown,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { exportChurchDatabaseDump } from "@/lib/operator.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { planLabel, intervalFromReference } from "@/lib/pricing";
import {
  type Snapshot,
  type Tenant,
  type Act,
  type Rpc,
  type Tier,
  type Status,
  fmtDate,
  fmtDateTime,
  fmtBytes,
  downloadCsv,
} from "./prime-types";

type Form = {
  id?: string;
  name: string;
  subdomain: string;
  tier: Tier;
  status: Status;
  contact_email: string;
  contact_phone: string;
};

const emptyForm: Form = {
  name: "",
  subdomain: "",
  tier: "free",
  status: "active",
  contact_email: "",
  contact_phone: "",
};

export function PrimeChurches({ d, act, rpc }: { d: Snapshot; act: Act; rpc: Rpc }) {
  const [q, setQ] = useState("");
  const [tier, setTier] = useState("all");
  const [status, setStatus] = useState("all");
  const [approval, setApproval] = useState("all");
  const [kind, setKind] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);

  const list = useMemo(
    () =>
      d.tenants.filter(
        (c) =>
          (tier === "all" || c.tier === tier) &&
          (status === "all" || c.status === status) &&
          (approval === "all" || c.approval_status === approval) &&
          (kind === "all" ||
            (kind === "branch"
              ? !!c.parent_tenant_id
              : kind === "head"
                ? d.tenants.some((x) => x.parent_tenant_id === c.id)
                : !c.parent_tenant_id)) &&
          `${c.name} ${c.subdomain} ${c.contact_email ?? ""}`
            .toLowerCase()
            .includes(q.toLowerCase()),
      ),
    [d, q, tier, status, approval, kind],
  );

  const selected = d.tenants.find((t) => t.id === openId) ?? null;

  const save = () => {
    if (!form) return;
    const args = {
      p_name: form.name,
      p_subdomain: form.subdomain,
      p_tier: form.tier,
      p_contact_email: form.contact_email,
      p_contact_phone: form.contact_phone,
    };
    rpc.mutate(
      form.id
        ? {
            fn: "platform_update_tenant",
            args: { ...args, p_tenant: form.id, p_status: form.status },
            done: "Church updated",
          }
        : { fn: "platform_create_tenant", args, done: "Church created" },
      { onSuccess: () => setForm(null) },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-eyebrow">Directory & Accounts</p>
          <h1 className="mt-1 font-display text-2xl font-bold">Church Registry</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {list.length} of {d.tenants.length} churches shown. Click any church for full account
            workspace and backups.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() =>
              downloadCsv(
                "churches.csv",
                list.map((c) => ({
                  name: c.name,
                  subdomain: c.subdomain,
                  plan: planLabel(c.tier),
                  status: c.status,
                  approval: c.approval_status,
                  members: c.usage.members,
                  staff: c.usage.staff,
                  checkins_30d: c.usage.attendance30,
                  db_bytes: c.usage.bytes,
                  files_bytes: c.storage_bytes,
                  created_at: c.created_at,
                  email: c.contact_email,
                  phone: c.contact_phone,
                })),
              )
            }
            className="gap-2 h-9"
          >
            <Download className="size-4" /> Export CSV
          </Button>

          <Button onClick={() => setForm({ ...emptyForm })} className="gap-2 h-9">
            <Plus className="size-4" /> New Church
          </Button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="surface p-3 grid gap-2 md:grid-cols-[1fr_140px_140px_150px_140px]">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-9 text-xs"
            placeholder="Search church name, address or email..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <Select value={tier} onValueChange={setTier}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="Plan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All packages</SelectItem>
            <SelectItem value="free">Free</SelectItem>
            <SelectItem value="standard">Standard</SelectItem>
            <SelectItem value="pro">Pro</SelectItem>
            <SelectItem value="premium">Premium</SelectItem>
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="grace">Grace</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>

        <Select value={approval} onValueChange={setApproval}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="Approval" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All approvals</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="pending_approval">Pending review</SelectItem>
            <SelectItem value="correction_requested">Correction requested</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>

        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="Structure" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All structures</SelectItem>
            <SelectItem value="main">Standalone only</SelectItem>
            <SelectItem value="head">Head churches</SelectItem>
            <SelectItem value="branch">Branches only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Scannable Registry Rows */}
      <div className="surface divide-y divide-border overflow-hidden">
        {list.map((c) => {
          const isBranch = !!c.parent_tenant_id;
          const branchCount = d.tenants.filter((x) => x.parent_tenant_id === c.id).length;
          const sub = c.sub as { period_end?: string } | null;

          return (
            <button
              key={c.id}
              onClick={() => setOpenId(c.id)}
              className="w-full text-left p-4 grid gap-3 sm:grid-cols-[1.8fr_1fr_1fr_auto_auto] items-center hover:bg-muted/40 transition-colors text-xs"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground text-sm">{c.name}</span>
                  {isBranch && (
                    <Badge variant="outline" className="text-[10px] py-0">
                      Branch
                    </Badge>
                  )}
                  {branchCount > 0 && (
                    <Badge variant="secondary" className="text-[10px] py-0">
                      {branchCount} {branchCount === 1 ? "branch" : "branches"}
                    </Badge>
                  )}
                </div>
                <p className="text-muted-foreground text-[11px] mt-0.5">
                  /c/{c.subdomain} · Joined {fmtDate(c.created_at)}
                </p>
              </div>

              <div>
                <p className="font-medium text-foreground">
                  {c.usage.members.toLocaleString()} members
                </p>
                <p className="text-muted-foreground text-[11px]">
                  {c.usage.attendance30} check-ins (30d) · {c.usage.staff} staff
                </p>
              </div>

              <div>
                <p className="font-mono text-muted-foreground">
                  {fmtBytes(c.usage.bytes + c.storage_bytes)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Renews: {sub?.period_end?.startsWith("9999") ? "Never" : fmtDate(sub?.period_end)}
                </p>
              </div>

              <div>
                <Badge variant="secondary">{planLabel(c.tier)}</Badge>
              </div>

              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    c.status === "active"
                      ? "default"
                      : c.status === "grace"
                        ? "secondary"
                        : "destructive"
                  }
                  className="capitalize"
                >
                  {c.status}
                </Badge>
                {c.approval_status !== "approved" && (
                  <span className="text-[10px] text-destructive font-semibold">
                    {c.approval_status.replace(/_/g, " ")}
                  </span>
                )}
              </div>
            </button>
          );
        })}

        {list.length === 0 && (
          <p className="p-8 text-center text-xs text-muted-foreground">
            No churches match the active search or filters.
          </p>
        )}
      </div>

      {/* Church Detail Workspace Sheet (Full Tabbed Workspace) */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto p-6">
          {selected && (
            <ChurchWorkspace
              c={selected}
              d={d}
              act={act}
              rpc={rpc}
              onEdit={() => {
                setForm({
                  id: selected.id,
                  name: selected.name,
                  subdomain: selected.subdomain,
                  tier: selected.tier as Tier,
                  status: selected.status as Status,
                  contact_email: selected.contact_email ?? "",
                  contact_phone: selected.contact_phone ?? "",
                });
                setOpenId(null);
              }}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Create / Edit Dialog */}
      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {form?.id ? "Edit Church Account" : "Create Church Workspace"}
            </DialogTitle>
            <DialogDescription>
              Account metadata only. Individual church member records remain strictly isolated.
            </DialogDescription>
          </DialogHeader>
          {form && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
              className="space-y-4 text-xs"
            >
              <div className="space-y-1.5">
                <Label>Church Name</Label>
                <Input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Permanent Check-in Handle (/c/...)</Label>
                <Input
                  required
                  value={form.subdomain}
                  onChange={(e) => setForm({ ...form, subdomain: e.target.value.toLowerCase() })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Plan Tier</Label>
                  <Select
                    value={form.tier}
                    onValueChange={(v) => setForm({ ...form, tier: v as Tier })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="free">Free</SelectItem>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="pro">Pro</SelectItem>
                      <SelectItem value="premium">Premium</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {form.id && (
                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    <Select
                      value={form.status}
                      onValueChange={(v) => setForm({ ...form, status: v as Status })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="grace">Grace</SelectItem>
                        <SelectItem value="suspended">Suspended</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Contact Email</Label>
                  <Input
                    type="email"
                    value={form.contact_email}
                    onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Contact Phone</Label>
                  <Input
                    value={form.contact_phone}
                    onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setForm(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={rpc.isPending}>
                  {rpc.isPending ? "Saving…" : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Full-featured Account Workspace (Organized into 8 Tabs) */
function ChurchWorkspace({
  c,
  d,
  act,
  rpc,
  onEdit,
}: {
  c: Tenant;
  d: Snapshot;
  act: Act;
  rpc: Rpc;
  onEdit: () => void;
}) {
  const [notes, setNotes] = useState(c.admin_notes ?? "");
  const [extendModal, setExtendModal] = useState(false);
  const [extendDays, setExtendDays] = useState(30);
  const [spaceModal, setSpaceModal] = useState(false);
  const [spaceSlots, setSpaceSlots] = useState(c.extra_member_slots ?? 0);
  const [statusConfirm, setStatusConfirm] = useState<{ next: Status; verb: string } | null>(null);
  const [detachConfirm, setDetachConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const exportDumpFn = useServerFn(exportChurchDatabaseDump);

  const handleExportDatabaseDump = async () => {
    setIsExporting(true);
    try {
      const dump = await exportDumpFn({ data: { tenant_id: c.id } });
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `menelog-${c.subdomain}-database-archive-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Full database archive downloaded for ${c.name}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to export church data.";
      toast.error(msg);
    } finally {
      setIsExporting(false);
    }
  };

  const payments = d.payments.filter((p) => p.tenant_id === c.id);
  const auditEntries = d.audit.filter((a) => a.tenant_id === c.id);
  const churchBackups = (d.backup_jobs ?? []).filter((j) => j.tenant_id === c.id);

  const sub = c.sub as {
    period_end?: string;
    auto_renew?: boolean;
    payment_method?: string;
  } | null;

  const handleSetStatus = (next: Status) => {
    rpc.mutate(
      {
        fn: "platform_set_tenant_status",
        args: { p_tenant: c.id, p_status: next },
        done: `Church marked as ${next}`,
      },
      { onSuccess: () => setStatusConfirm(null) },
    );
  };

  return (
    <div className="space-y-5">
      <SheetHeader className="border-b pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <SheetTitle className="text-xl font-bold">{c.name}</SheetTitle>
            <SheetDescription className="text-xs">
              Check-in: menelog.site/c/{c.subdomain} · Joined {fmtDate(c.created_at)}
            </SheetDescription>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary">{planLabel(c.tier)}</Badge>
            <Badge
              variant={
                c.status === "active"
                  ? "default"
                  : c.status === "grace"
                    ? "secondary"
                    : "destructive"
              }
              className="capitalize"
            >
              {c.status}
            </Badge>
          </div>
        </div>
      </SheetHeader>

      {/* Multi-Section Workspace Tabs (8 Organized Sections) */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid grid-cols-4 sm:grid-cols-8 h-auto p-1 text-[11px]">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="branches">Branches</TabsTrigger>
          <TabsTrigger value="messaging">Messaging</TabsTrigger>
          <TabsTrigger value="backups">Backups</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        {/* Tab 1: Overview */}
        <TabsContent value="overview" className="space-y-4 pt-3 text-xs">
          <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/20 p-4">
            <div>
              <p className="text-muted-foreground text-[10px] uppercase font-semibold">
                Contact Email
              </p>
              <p className="font-medium text-foreground text-sm mt-0.5">{c.contact_email || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-[10px] uppercase font-semibold">
                Contact Phone
              </p>
              <p className="font-medium text-foreground text-sm mt-0.5">{c.contact_phone || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-[10px] uppercase font-semibold">
                Approval Status
              </p>
              <p className="font-medium text-foreground capitalize mt-0.5">
                {c.approval_status.replace(/_/g, " ")}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-[10px] uppercase font-semibold">
                Last Church Activity
              </p>
              <p className="font-medium text-foreground mt-0.5">{fmtDate(c.usage.last_activity)}</p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="font-semibold text-sm">Two-step sign-in requirement</p>
              <p className="text-muted-foreground text-[11px]">Enforce MFA for all staff</p>
            </div>
            <Switch
              checked={!!c.require_mfa}
              onCheckedChange={(v) =>
                act.mutate({ type: "require_mfa", tenant_id: c.id, value: v })
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button variant="outline" onClick={onEdit} className="h-9">
              <Pencil className="size-3.5 mr-1" /> Edit details
            </Button>
            <Button
              variant="outline"
              disabled={act.isPending}
              onClick={() => act.mutate({ type: "resend_welcome", tenant_id: c.id })}
              className="h-9"
            >
              <Mail className="size-3.5 mr-1" /> Resend welcome
            </Button>
            {c.status === "active" ? (
              <Button
                variant="destructive"
                onClick={() => setStatusConfirm({ next: "suspended", verb: "Suspend" })}
                className="h-9"
              >
                Suspend Church
              </Button>
            ) : (
              <Button
                onClick={() => setStatusConfirm({ next: "active", verb: "Restore" })}
                className="h-9"
              >
                Restore Church
              </Button>
            )}
            <Button
              variant="outline"
              className="text-destructive h-9"
              disabled={c.status === "closed"}
              onClick={() => setStatusConfirm({ next: "closed", verb: "Close" })}
            >
              Close Account
            </Button>
            <Button
              variant="outline"
              onClick={handleExportDatabaseDump}
              disabled={isExporting}
              className="h-9 gap-1.5"
            >
              <FileDown className="size-3.5 text-primary" />
              <span>{isExporting ? "Exporting..." : "Export Full Database (JSON)"}</span>
            </Button>
            <Button
              variant="destructive"
              className="h-9 gap-1.5 bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold"
              onClick={() => {
                setDeleteInput("");
                setDeleteConfirm(true);
              }}
            >
              <Trash2 className="size-3.5" />
              <span>Permanently Purge Church</span>
            </Button>
          </div>
        </TabsContent>

        {/* Tab 2: Subscription */}
        <TabsContent value="subscription" className="space-y-4 pt-3 text-xs">
          <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/20 p-4">
            <div>
              <p className="text-muted-foreground text-[10px] uppercase font-semibold">
                Current Plan
              </p>
              <p className="font-bold text-base text-foreground mt-0.5">{planLabel(c.tier)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-[10px] uppercase font-semibold">
                Period End / Renews
              </p>
              <p className="font-bold text-base text-foreground mt-0.5">
                {sub?.period_end?.startsWith("9999") ? "Never (Free)" : fmtDate(sub?.period_end)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-[10px] uppercase font-semibold">
                Auto-Renew
              </p>
              <p className="font-medium text-foreground mt-0.5">
                {sub?.auto_renew ? `Yes · ${sub.payment_method}` : "No (manual)"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-[10px] uppercase font-semibold">
                Trial Status
              </p>
              <p className="font-medium text-foreground mt-0.5">
                {c.trial_ends_at ? `Ends ${fmtDate(c.trial_ends_at)}` : "No active trial"}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 h-9"
              onClick={() => {
                setExtendDays(30);
                setExtendModal(true);
              }}
            >
              <Clock className="size-3.5 mr-1" /> Extend time
            </Button>
            <Button
              variant="outline"
              className="flex-1 h-9"
              onClick={() => {
                setSpaceSlots(c.extra_member_slots ?? 0);
                setSpaceModal(true);
              }}
            >
              Set extra member space
            </Button>
          </div>

          {/* Payment History */}
          <div className="pt-2">
            <p className="font-semibold text-xs text-foreground mb-2">
              Recorded Payments ({payments.length})
            </p>
            <div className="divide-y rounded-lg border max-h-48 overflow-y-auto">
              {payments.map((p) => (
                <div key={p.id} className="p-2.5 flex justify-between items-center text-[11px]">
                  <div>
                    <span className="font-medium">
                      {fmtDate(p.created_at)} · {planLabel(p.tier)} (
                      {intervalFromReference(p.reference)})
                    </span>
                    <p className="font-mono text-[10px] text-muted-foreground">{p.reference}</p>
                  </div>
                  <span className="font-semibold">
                    {p.currency} {(p.amount_kobo / 100).toFixed(2)} ({p.status})
                  </span>
                </div>
              ))}
              {payments.length === 0 && (
                <p className="p-4 text-center text-muted-foreground text-xs">
                  No payments recorded
                </p>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Tab 3: Usage */}
        <TabsContent value="usage" className="space-y-4 pt-3 text-xs">
          <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/20 p-4">
            <div>
              <p className="text-muted-foreground text-[10px] uppercase font-semibold">
                Congregation Members
              </p>
              <p className="font-bold text-base text-foreground mt-0.5">
                {c.usage.members.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-[10px] uppercase font-semibold">
                Staff Accounts
              </p>
              <p className="font-bold text-base text-foreground mt-0.5">{c.usage.staff}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-[10px] uppercase font-semibold">
                Recorded Services
              </p>
              <p className="font-medium text-foreground mt-0.5">{c.usage.services}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-[10px] uppercase font-semibold">
                Check-ins (30 Days)
              </p>
              <p className="font-medium text-foreground mt-0.5">{c.usage.attendance30}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-[10px] uppercase font-semibold">
                Database Rows
              </p>
              <p className="font-medium text-foreground mt-0.5">
                {c.usage.rows.toLocaleString()} ({fmtBytes(c.usage.bytes)})
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-[10px] uppercase font-semibold">
                Stored Files
              </p>
              <p className="font-medium text-foreground mt-0.5">{fmtBytes(c.storage_bytes)}</p>
            </div>
          </div>
        </TabsContent>

        {/* Tab 4: Branches */}
        <TabsContent value="branches" className="space-y-4 pt-3 text-xs">
          {c.parent_tenant_id ? (
            <div className="rounded-lg border p-4 space-y-2">
              <p className="font-semibold text-sm">Branch Configuration</p>
              <p className="text-muted-foreground">
                This church is a branch of{" "}
                <b>{d.tenants.find((x) => x.id === c.parent_tenant_id)?.name ?? "Parent Church"}</b>
                . Branches share the Pro plan features of their parent.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDetachConfirm(true)}
                className="mt-2"
              >
                Detach into standalone church
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="font-semibold text-sm">Branches Belonging to this Church</p>
              <div className="divide-y rounded-lg border">
                {d.tenants
                  .filter((x) => x.parent_tenant_id === c.id)
                  .map((b) => (
                    <div key={b.id} className="p-3 flex justify-between items-center text-xs">
                      <div>
                        <p className="font-medium text-foreground">{b.name}</p>
                        <p className="text-[11px] text-muted-foreground">/c/{b.subdomain}</p>
                      </div>
                      <span className="text-muted-foreground">
                        {b.usage.members} members · {b.usage.attendance30} check-ins
                      </span>
                    </div>
                  ))}
                {d.tenants.filter((x) => x.parent_tenant_id === c.id).length === 0 && (
                  <p className="p-6 text-center text-muted-foreground">
                    This church currently has no registered branches.
                  </p>
                )}
              </div>
            </div>
          )}
        </TabsContent>

        {/* Tab 5: Messaging */}
        <TabsContent value="messaging" className="space-y-4 pt-3 text-xs">
          <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/20 p-4">
            <div>
              <p className="text-muted-foreground text-[10px] uppercase font-semibold">
                Emails Sent (30d)
              </p>
              <p className="font-bold text-base mt-0.5">{c.messaging.email_sent}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-[10px] uppercase font-semibold">
                SMS Sent (30d)
              </p>
              <p className="font-bold text-base mt-0.5">{c.messaging.sms_sent}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-[10px] uppercase font-semibold">
                Failed Messages
              </p>
              <p className="font-bold text-base text-destructive mt-0.5">{c.messaging.failed}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-[10px] uppercase font-semibold">
                Queued Messages
              </p>
              <p className="font-medium mt-0.5">{c.messaging.queued}</p>
            </div>
          </div>

          <Button
            variant="outline"
            disabled={c.messaging.failed === 0 || act.isPending}
            onClick={() => act.mutate({ type: "retry_failed", tenant_id: c.id })}
            className="w-full h-9"
          >
            Retry failed messages for this church ({c.messaging.failed})
          </Button>
        </TabsContent>

        {/* Tab 6: Backups */}
        <TabsContent value="backups" className="space-y-4 pt-3 text-xs">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm">Encrypted Backups</p>
              <p className="text-muted-foreground text-[11px]">
                One-church isolated snapshot encrypted with AES-256-GCM.
              </p>
            </div>
            <Button
              size="sm"
              disabled={act.isPending}
              onClick={() => act.mutate({ type: "create_backup", tenant_id: c.id })}
              className="gap-1.5 h-8"
            >
              <Plus className="size-3.5" /> Create Backup Now
            </Button>
          </div>

          <div className="divide-y rounded-lg border">
            {churchBackups.map((b) => (
              <div key={b.id} className="p-3 flex justify-between items-center text-xs">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold capitalize">{b.kind.replace("_", " ")}</span>
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {b.status}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {fmtDateTime(b.created_at)} · {fmtBytes(b.byte_size)}
                  </p>
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">
                  SHA256: {b.checksum?.slice(0, 12)}…
                </span>
              </div>
            ))}
            {churchBackups.length === 0 && (
              <p className="p-6 text-center text-muted-foreground">
                No backup archives created yet for this church.
              </p>
            )}
          </div>
        </TabsContent>

        {/* Tab 7: Notes */}
        <TabsContent value="notes" className="space-y-4 pt-3 text-xs">
          <div className="space-y-2">
            <Label className="text-xs">Private Prime Haven Notes</Label>
            <Textarea
              rows={6}
              maxLength={4000}
              placeholder="Internal operator notes regarding account verification, billing history, or support communication..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-xs"
            />
          </div>
          <Button
            size="sm"
            onClick={() => act.mutate({ type: "notes", tenant_id: c.id, notes })}
            disabled={act.isPending}
            className="h-8"
          >
            Save Notes
          </Button>
        </TabsContent>

        {/* Tab 8: Activity */}
        <TabsContent value="activity" className="space-y-4 pt-3 text-xs">
          <div>
            <p className="font-semibold text-sm">Account Activity & Operator Audit</p>
            <p className="text-muted-foreground text-[11px]">
              Chronological log of administrative changes, approvals, and mutations for this church.
            </p>
          </div>
          <div className="divide-y rounded-lg border max-h-72 overflow-y-auto">
            {auditEntries.map((a) => (
              <div key={a.id} className="p-3 text-xs flex justify-between items-start gap-2">
                <div>
                  <p className="font-mono font-semibold text-foreground">{a.action}</p>
                  <p className="text-muted-foreground text-[11px] mt-0.5">
                    By: <span className="text-foreground">{a.actor}</span>
                    {a.detail && Object.keys(a.detail).length > 0
                      ? ` · ${JSON.stringify(a.detail)}`
                      : ""}
                  </p>
                </div>
                <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                  {fmtDateTime(a.created_at)}
                </span>
              </div>
            ))}
            {auditEntries.length === 0 && (
              <p className="p-6 text-center text-muted-foreground">
                No administrative audit events recorded for this church yet.
              </p>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Extend Subscription Modal */}
      <Dialog open={extendModal} onOpenChange={setExtendModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend subscription or trial</DialogTitle>
            <DialogDescription>
              Grant additional time for {c.name} without processing a payment.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (extendDays > 0) {
                act.mutate(
                  { type: "extend", tenant_id: c.id, days: extendDays },
                  { onSuccess: () => setExtendModal(false) },
                );
              }
            }}
            className="space-y-4 text-xs"
          >
            <div className="space-y-2">
              <Label>Number of days</Label>
              <div className="flex gap-2">
                {[14, 30, 60, 90].map((d) => (
                  <Button
                    key={d}
                    type="button"
                    variant={extendDays === d ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setExtendDays(d)}
                  >
                    +{d} days
                  </Button>
                ))}
              </div>
              <Input
                type="number"
                min={1}
                max={730}
                value={extendDays}
                onChange={(e) => setExtendDays(Math.max(1, Number(e.target.value)))}
                className="mt-2"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setExtendModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={act.isPending}>
                Extend time
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Extra Space Modal */}
      <Dialog open={spaceModal} onOpenChange={setSpaceModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extra member capacity</DialogTitle>
            <DialogDescription>
              Adjust extra congregation member capacity slots for {c.name}.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              rpc.mutate(
                {
                  fn: "platform_grant_space",
                  args: { p_tenant: c.id, p_slots: spaceSlots },
                  done: "Extra member space updated",
                },
                { onSuccess: () => setSpaceModal(false) },
              );
            }}
            className="space-y-4 text-xs"
          >
            <div className="space-y-2">
              <Label>Extra slots</Label>
              <div className="flex gap-2">
                {[0, 500, 1000, 2500, 5000].map((slots) => (
                  <Button
                    key={slots}
                    type="button"
                    variant={spaceSlots === slots ? "default" : "outline"}
                    size="sm"
                    className="flex-1 text-[11px]"
                    onClick={() => setSpaceSlots(slots)}
                  >
                    +{slots}
                  </Button>
                ))}
              </div>
              <Input
                type="number"
                min={0}
                value={spaceSlots}
                onChange={(e) => setSpaceSlots(Math.max(0, Number(e.target.value)))}
                className="mt-2"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSpaceModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={rpc.isPending}>
                Save capacity
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Status Confirmation Modal */}
      <Dialog open={!!statusConfirm} onOpenChange={(o) => !o && setStatusConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{statusConfirm?.verb} church account</DialogTitle>
            <DialogDescription>
              Are you sure you want to mark <b>{c.name}</b> as {statusConfirm?.next}?
            </DialogDescription>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            {statusConfirm?.next === "suspended"
              ? "Suspension halts congregation check-in and edits until restored."
              : statusConfirm?.next === "closed"
                ? "Closing disables access while preserving records safely for export."
                : "Restoring reactivates congregation check-in and administrative tools."}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setStatusConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant={statusConfirm?.next === "active" ? "default" : "destructive"}
              disabled={rpc.isPending}
              onClick={() => statusConfirm && handleSetStatus(statusConfirm.next)}
            >
              Confirm {statusConfirm?.verb}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detach Branch Confirmation Modal */}
      <Dialog open={detachConfirm} onOpenChange={setDetachConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detach branch church</DialogTitle>
            <DialogDescription>
              Make <b>{c.name}</b> a standalone church account?
            </DialogDescription>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            The branch will operate as its own independent church and no longer share its parent's
            plan subscription.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDetachConfirm(false)}>
              Cancel
            </Button>
            <Button
              disabled={act.isPending}
              onClick={() =>
                act.mutate(
                  { type: "detach_branch", tenant_id: c.id },
                  { onSuccess: () => setDetachConfirm(false) },
                )
              }
            >
              Confirm detach
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permanent Church Deletion (Cascading Purge) Modal */}
      <Dialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <DialogContent className="border-destructive/40 bg-card">
          <DialogHeader>
            <div className="flex items-center gap-2 text-destructive font-bold text-lg">
              <AlertTriangle className="size-5 shrink-0" />
              <span>Permanently Delete Church</span>
            </div>
            <DialogDescription className="text-xs text-muted-foreground pt-1">
              This action is immediate and completely irreversible. All records belonging to{" "}
              <strong className="text-foreground">{c.name}</strong>—including members, attendance
              logs, services, branches, tickets, messaging logs, and subscriptions—will be wiped
              from the database.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs">
              <p className="font-semibold">Irreversible Hard Purge</p>
              <p className="text-[11px] mt-0.5 opacity-90">
                To prevent accidental loss, type the church name and DELETE in uppercase exactly as
                shown below:
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Verification phrase:{" "}
                <span className="font-mono font-bold text-foreground">{c.name} DELETE</span>
              </Label>
              <Input
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                placeholder={`${c.name} DELETE`}
                className="font-mono text-xs h-10"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDeleteConfirm(false);
                setDeleteInput("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteInput.trim() !== `${c.name} DELETE` || act.isPending}
              onClick={() => {
                act.mutate(
                  {
                    type: "delete_church_permanent",
                    tenant_id: c.id,
                    confirmation_name: c.name,
                  },
                  {
                    onSuccess: () => {
                      setDeleteConfirm(false);
                      setDeleteInput("");
                    },
                  },
                );
              }}
              className="gap-2"
            >
              <Trash2 className="size-4" />
              <span>
                {act.isPending ? "Purging from database..." : "Wipe Completely from Database"}
              </span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
