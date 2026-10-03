import { useState } from "react";
import {
  Database,
  HardDrive,
  FolderArchive,
  Download,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Lock,
  Wrench,
  RefreshCw,
} from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/PasswordField";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useServerFn } from "@tanstack/react-start";
import { downloadBackupArchive } from "@/lib/operator.functions";
import { toast } from "sonner";
import { type Snapshot, type Act, fmtDate, fmtDateTime, fmtBytes } from "./prime-types";

export function PrimeDatabase({ d, act }: { d: Snapshot; act: Act }) {
  const [restoreModal, setRestoreModal] = useState<string | null>(null);
  const [confirmChurchName, setConfirmChurchName] = useState("");
  const [operatorPassword, setOperatorPassword] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const downloadFn = useServerFn(downloadBackupArchive);

  const t = d.tenants;
  const churchNames = Object.fromEntries(t.map((x) => [x.id, x.name]));

  const totalDbBytes = t.reduce((s, x) => s + x.usage.bytes, 0);
  const totalRows = t.reduce((s, x) => s + x.usage.rows, 0);
  const totalFileBytes = d.storage.reduce((s, b) => s + b.bytes, 0);
  const totalFiles = d.storage.reduce((s, b) => s + b.files, 0);

  // Table row counts category summary
  const totalMembers = t.reduce((s, x) => s + x.usage.members, 0);
  const totalAttendance = t.reduce((s, x) => s + x.usage.attendance, 0);
  const totalServices = t.reduce((s, x) => s + x.usage.services, 0);
  const totalStaff = t.reduce((s, x) => s + x.usage.staff, 0);
  const totalLeaders = t.reduce((s, x) => s + x.usage.leaders, 0);
  const totalMessages = t.reduce((s, x) => s + x.usage.messages, 0);

  const ranked = [...t].sort(
    (a, b) => b.usage.bytes + b.storage_bytes - (a.usage.bytes + a.storage_bytes),
  );
  const maxBytes = Math.max(1, ...ranked.map((x) => x.usage.bytes + x.storage_bytes));

  const backups = d.backup_jobs ?? [];
  const selectedRestoreJob = backups.find((j) => j.id === restoreModal);
  const targetChurch = selectedRestoreJob
    ? t.find((x) => x.id === selectedRestoreJob.tenant_id)
    : null;

  async function handleDownload(backupId: string) {
    setDownloadingId(backupId);
    try {
      const res = await downloadFn({ data: { backup_id: backupId } });
      const byteCharacters = atob(res.content_base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "application/octet-stream" });

      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = res.filename;
      link.click();
      toast.success("Encrypted backup downloaded.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-eyebrow">Infrastructure & Resilience</p>
          <h1 className="mt-1 font-display text-2xl font-bold">Database, Storage & Backups</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Capacity management, row counts, and tenant-scoped AES-256-GCM encrypted backup
            archives.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Church Data (Estimated)
          </p>
          <p className="mt-2 text-2xl font-bold">{fmtBytes(totalDbBytes)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {totalRows.toLocaleString()} total rows across tables
          </p>
        </div>

        <div className="surface p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">File Storage</p>
          <p className="mt-2 text-2xl font-bold">{fmtBytes(totalFileBytes)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {totalFiles} files across {d.storage.length} storage buckets
          </p>
        </div>

        <div className="surface p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Table Rows Breakdown
          </p>
          <p className="mt-2 text-2xl font-bold">{totalMembers.toLocaleString()}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {totalAttendance.toLocaleString()} attendances · {totalMessages.toLocaleString()} msgs
          </p>
        </div>

        <div className="surface p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Encrypted Archives
          </p>
          <p className="mt-2 text-2xl font-bold">{backups.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            AES-256-GCM encrypted · 30-day retention
          </p>
        </div>
      </div>

      {/* Database Integrity & Inconsistency Remediation */}
      <div className="surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Wrench className="size-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">Database Integrity & Consistency Maintenance</p>
              <p className="text-xs text-muted-foreground">
                Automated member code reconciliation, rate-limit bucket pruning, and schema alignment.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => act.mutate({ type: "reconcile_member_codes" })}
              disabled={act.isPending}
            >
              <RefreshCw className={`size-3.5 ${act.isPending ? "animate-spin" : ""}`} />
              <span>Reconcile Member Codes</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => act.mutate({ type: "cleanup_rate_limits" })}
              disabled={act.isPending}
            >
              <ShieldCheck className="size-3.5 text-success" />
              <span>Purge Expired Rate Limits</span>
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3 text-xs">
          <div className="rounded-lg border border-border/50 bg-background/50 p-3">
            <span className="text-muted-foreground">Missing Member Codes</span>
            <p className="mt-1 text-lg font-bold font-mono">
              {(d.health as { missing_member_codes?: number }).missing_member_codes ?? 0}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {(d.health as { missing_member_codes?: number }).missing_member_codes === 0
                ? "All member records have unique check-in codes"
                : "Records waiting for automated sequential code assignment"}
            </p>
          </div>

          <div className="rounded-lg border border-border/50 bg-background/50 p-3">
            <span className="text-muted-foreground">Active Rate-Limit Buckets</span>
            <p className="mt-1 text-lg font-bold font-mono">
              {(d.health as { rate_limit_hits?: number }).rate_limit_hits ?? 0}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Brute-force and DDoS tracking entries stored in database
            </p>
          </div>

          <div className="rounded-lg border border-border/50 bg-background/50 p-3">
            <span className="text-muted-foreground">Schema Migration Script</span>
            <p className="mt-1 text-lg font-bold font-mono text-primary">v2026.10-aligned</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              database-remediation-and-upgrades.sql ready for Supabase
            </p>
          </div>
        </div>
      </div>

      {/* Storage Breakdown and Largest Churches */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Largest Churches Capacity Usage */}
        <div className="surface p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold">Churches by Storage Footprint</p>
            <span className="text-xs text-muted-foreground">DB rows + Storage files</span>
          </div>
          <div className="divide-y text-xs max-h-72 overflow-y-auto">
            {ranked.slice(0, 10).map((church) => {
              const total = church.usage.bytes + church.storage_bytes;
              const isHeavy = total > 100 * 1024 * 1024; // > 100 MB
              return (
                <div key={church.id} className="py-2.5">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium text-foreground">{church.name}</span>
                    <span className="text-muted-foreground font-mono">
                      {fmtBytes(total)}{" "}
                      {isHeavy && (
                        <Badge variant="destructive" className="ml-1 text-[9px] py-0">
                          Heavy
                        </Badge>
                      )}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden bg-muted">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(total / maxBytes) * 100}%` }}
                      className={`h-full ${isHeavy ? "bg-amber-500" : "bg-primary"}`}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {church.usage.rows.toLocaleString()} rows · {church.usage.members} members ·{" "}
                    {fmtBytes(church.storage_bytes)} files
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Buckets & Row Categories */}
        <div className="surface p-5 space-y-4">
          <p className="text-sm font-semibold">Storage Buckets & Row Breakdown</p>

          <div className="divide-y text-xs">
            {d.storage.map((b) => (
              <div key={b.bucket} className="py-2 flex justify-between items-center">
                <div>
                  <p className="font-medium text-foreground">{b.bucket}</p>
                  <p className="text-[10px] text-muted-foreground">{b.files} files stored</p>
                </div>
                <span className="font-mono font-semibold">{fmtBytes(b.bytes)}</span>
              </div>
            ))}
          </div>

          <div className="pt-2 border-t text-xs space-y-1.5">
            <p className="font-semibold text-muted-foreground text-[10px] uppercase">
              Platform Row Totals:
            </p>
            <div className="grid grid-cols-2 gap-2 text-muted-foreground">
              <span>Members: {totalMembers.toLocaleString()}</span>
              <span>Attendance: {totalAttendance.toLocaleString()}</span>
              <span>Services: {totalServices.toLocaleString()}</span>
              <span>Staff accounts: {totalStaff.toLocaleString()}</span>
              <span>Leaders: {totalLeaders.toLocaleString()}</span>
              <span>Messages: {totalMessages.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Encrypted Backups & Restore Hub */}
      <div className="surface p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Tenant-Scoped Encrypted Backups</h2>
            <p className="text-xs text-muted-foreground">
              Isolated snapshots encrypted with AES-256-GCM. Operators can create, download, and
              restore archives into the original church. Private contents are never displayed in
              this console.
            </p>
          </div>
        </div>

        <div className="divide-y divide-border overflow-hidden rounded-lg border text-xs">
          {backups.map((job) => {
            const churchName = churchNames[job.tenant_id] ?? "Unknown church";
            const isCompleted = job.status === "completed";
            const isRunning = job.status === "running";

            return (
              <div
                key={job.id}
                className="p-3.5 flex flex-wrap items-center justify-between gap-3 bg-card"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-foreground text-sm">{churchName}</p>
                    <Badge variant="outline" className="text-[10px] uppercase font-mono">
                      {job.kind.replace("_", " ")}
                    </Badge>
                    <Badge
                      variant={
                        isCompleted
                          ? "default"
                          : job.status === "failed"
                            ? "destructive"
                            : "secondary"
                      }
                      className="text-[10px] capitalize"
                    >
                      {job.status}
                    </Badge>
                  </div>

                  <p className="text-[11px] text-muted-foreground mt-1">
                    Requested by <b>{job.requested_by_name}</b> · Created{" "}
                    {fmtDateTime(job.created_at)}
                    {job.expires_at ? ` · Expires ${fmtDate(job.expires_at)}` : ""}
                  </p>

                  {job.checksum && (
                    <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                      SHA256: {job.checksum.slice(0, 16)}… · Size: {fmtBytes(job.byte_size)}
                    </p>
                  )}
                </div>

                {/* Backup Actions */}
                <div className="flex items-center gap-2">
                  {isCompleted && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={downloadingId === job.id}
                        onClick={() => handleDownload(job.id)}
                        className="h-8 gap-1.5"
                      >
                        <Download className="size-3.5" />
                        {downloadingId === job.id ? "Downloading…" : "Download (.mlbak.enc)"}
                      </Button>

                      {job.kind !== "restore" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setConfirmChurchName("");
                            setOperatorPassword("");
                            setRestoreModal(job.id);
                          }}
                          className="h-8 gap-1.5"
                        >
                          <RotateCcw className="size-3.5" /> Restore
                        </Button>
                      )}
                    </>
                  )}

                  {isRunning && (
                    <span className="text-xs text-muted-foreground animate-pulse">
                      Processing backup…
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {backups.length === 0 && (
            <p className="p-8 text-center text-muted-foreground">
              No backups created yet. Open any church in the Churches tab to generate an encrypted
              backup archive.
            </p>
          )}
        </div>
      </div>

      {/* Restore Confirmation Dialog with Two-Step & Pre-Restore Backup */}
      <Dialog open={!!restoreModal} onOpenChange={(o) => !o && setRestoreModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="size-5 text-amber-500" />
              Restore Church From Encrypted Backup
            </DialogTitle>
            <DialogDescription>
              This will restore all records for <b>{targetChurch?.name}</b> to the state of this
              backup. An automatic pre-restore backup will be captured before any data is modified.
            </DialogDescription>
          </DialogHeader>

          {selectedRestoreJob && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!targetChurch) return;
                if (confirmChurchName.trim() !== targetChurch.name.trim()) {
                  toast.error("Typed confirmation name does not match church name.");
                  return;
                }
                act.mutate(
                  {
                    type: "restore_backup",
                    backup_id: selectedRestoreJob.id,
                    tenant_id: selectedRestoreJob.tenant_id,
                    confirmation_name: confirmChurchName.trim(),
                    operator_password: operatorPassword,
                  },
                  {
                    onSuccess: () => setRestoreModal(null),
                  },
                );
              }}
              className="space-y-4 text-xs"
            >
              {/* Record counts preview */}
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                <p className="font-semibold text-foreground">Archive Contents Preview:</p>
                <div className="grid grid-cols-2 gap-1 text-muted-foreground text-[11px]">
                  {Object.entries(selectedRestoreJob.record_counts ?? {}).map(([k, v]) => (
                    <span key={k}>
                      {k}: {Number(v).toLocaleString()}
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">
                  Type church name <b>"{targetChurch?.name}"</b> to confirm:
                </Label>
                <Input
                  required
                  value={confirmChurchName}
                  onChange={(e) => setConfirmChurchName(e.target.value)}
                  placeholder={targetChurch?.name}
                  className="h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Operator Password (Two-Step Re-authentication):</Label>
                <PasswordInput
                  required
                  value={operatorPassword}
                  onChange={(e) => setOperatorPassword(e.target.value)}
                  placeholder="Enter your operator password"
                  className="h-9"
                />
              </div>

              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-800 dark:text-amber-300">
                <p className="font-semibold">Safety verification:</p>
                <p className="mt-0.5">
                  Backups can ONLY be restored into the same church. Other churches cannot be
                  affected. A pre-restore rollback backup is automatically generated.
                </p>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setRestoreModal(null)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    act.isPending ||
                    confirmChurchName.trim() !== targetChurch?.name.trim() ||
                    !operatorPassword
                  }
                >
                  {act.isPending ? "Restoring…" : "Execute Restore"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
