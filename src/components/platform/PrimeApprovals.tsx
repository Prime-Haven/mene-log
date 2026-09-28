import { useState } from "react";
import {
  Check,
  X,
  AlertTriangle,
  ShieldAlert,
  Clock,
  ArrowRight,
  Mail,
  Phone,
  Building2,
  Calendar,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { planLabel } from "@/lib/pricing";
import { type Snapshot, type Act, fmtDate, fmtDateTime } from "./prime-types";

export function PrimeApprovals({ d, act }: { d: Snapshot; act: Act }) {
  const [rejectDialog, setRejectDialog] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [correctionDialog, setCorrectionDialog] = useState<string | null>(null);
  const [correctionReason, setCorrectionReason] = useState("");

  const pendingList = d.tenants.filter(
    (c) => c.approval_status === "pending_approval" || c.approval_status === "correction_requested",
  );

  const selectedForReject = d.tenants.find((c) => c.id === rejectDialog);
  const selectedForCorrection = d.tenants.find((c) => c.id === correctionDialog);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-eyebrow">Risk & Compliance</p>
          <h1 className="mt-1 font-display text-2xl font-bold">Flagged Account Approvals</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Normal verified registrations activate automatically. Only registrations flagged by
            automated checks or an operator enter this review queue.
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {pendingList.length} requiring review
        </Badge>
      </div>

      <div className="surface divide-y divide-border overflow-hidden">
        {pendingList.map((church) => {
          const flags = church.approval_risk_flags ?? [];
          const isCorrection = church.approval_status === "correction_requested";

          return (
            <div key={church.id} className="p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-base text-foreground">{church.name}</h2>
                    <Badge
                      variant={isCorrection ? "secondary" : "destructive"}
                      className="capitalize text-[11px]"
                    >
                      {isCorrection ? "Correction requested" : "Flagged for review"}
                    </Badge>
                    <Badge variant="outline" className="text-[11px]">
                      {planLabel(church.tier)} plan
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Permanent check-in: <b>menelog.site/c/{church.subdomain}</b> · Signed up{" "}
                    {fmtDateTime(church.created_at)}
                  </p>
                </div>

                {/* Operator Actions */}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    disabled={act.isPending}
                    onClick={() =>
                      act.mutate({
                        type: "approve_church",
                        tenant_id: church.id,
                        notes: "Approved after operator risk review",
                      })
                    }
                    className="gap-1.5 h-9"
                  >
                    <Check className="size-4" /> Approve & activate
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={act.isPending}
                    onClick={() => {
                      setCorrectionReason(church.approval_reason ?? "");
                      setCorrectionDialog(church.id);
                    }}
                    className="gap-1.5 h-9"
                  >
                    <MessageSquare className="size-4" /> Request correction
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={act.isPending}
                    onClick={() => {
                      setRejectReason("");
                      setRejectDialog(church.id);
                    }}
                    className="gap-1.5 h-9"
                  >
                    <X className="size-4" /> Reject
                  </Button>
                </div>
              </div>

              {/* Exact Flag Reasons */}
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs space-y-1">
                <p className="font-semibold text-destructive flex items-center gap-1.5">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  Automated risk indicators:
                </p>
                {flags.length > 0 ? (
                  <ul className="list-disc pl-5 space-y-0.5 text-foreground/80">
                    {flags.map((flag, idx) => (
                      <li key={idx}>{flag}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground pl-5">
                    {church.approval_reason || "Flagged manually by platform operator."}
                  </p>
                )}
                {church.approval_reason && isCorrection && (
                  <p className="pt-1 text-amber-700 dark:text-amber-300 font-medium">
                    Correction request sent: "{church.approval_reason}"
                  </p>
                )}
              </div>

              {/* Submitted Account Details (No member records ever shown) */}
              <div className="grid gap-3 sm:grid-cols-3 rounded-lg border bg-muted/20 p-3 text-xs">
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                    Contact Email
                  </span>
                  <span className="font-medium">{church.contact_email || "Not provided"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                    Contact Phone
                  </span>
                  <span className="font-medium">{church.contact_phone || "Not provided"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                    Trial Period
                  </span>
                  <span className="font-medium">Ends {fmtDate(church.trial_ends_at)}</span>
                </div>
              </div>
            </div>
          );
        })}

        {pendingList.length === 0 && (
          <div className="p-12 text-center text-sm text-muted-foreground space-y-2">
            <Check className="size-8 mx-auto text-emerald-600 mb-2" />
            <p className="font-semibold text-foreground text-base">Approval Queue is Clear</p>
            <p className="max-w-md mx-auto text-xs">
              All normal registrations are automatically verified and running. Any church flagged by
              risk checks will appear here for operator review.
            </p>
          </div>
        )}
      </div>

      {/* Reject Dialog */}
      <Dialog open={!!rejectDialog} onOpenChange={(o) => !o && setRejectDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject church registration</DialogTitle>
            <DialogDescription>
              Provide a required reason for closing {selectedForReject?.name}. This will be logged
              in the platform audit trail.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!rejectDialog || rejectReason.trim().length < 2) return;
              act.mutate(
                { type: "reject_church", tenant_id: rejectDialog, reason: rejectReason.trim() },
                { onSuccess: () => setRejectDialog(null) },
              );
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Rejection reason (required)</Label>
              <Textarea
                required
                minLength={2}
                maxLength={500}
                placeholder="e.g. Disposable domain and duplicate contact registration"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRejectDialog(null)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={act.isPending || rejectReason.trim().length < 2}
              >
                Confirm rejection
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Request Correction Dialog */}
      <Dialog open={!!correctionDialog} onOpenChange={(o) => !o && setCorrectionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request account correction</DialogTitle>
            <DialogDescription>
              The church administrator will see this message in their dashboard explaining what
              needs to be updated before full activation.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!correctionDialog || correctionReason.trim().length < 5) return;
              act.mutate(
                {
                  type: "request_correction",
                  tenant_id: correctionDialog,
                  reason: correctionReason.trim(),
                },
                { onSuccess: () => setCorrectionDialog(null) },
              );
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Correction requested (required)</Label>
              <Textarea
                required
                minLength={5}
                maxLength={500}
                placeholder="e.g. Please provide a verified permanent church contact phone and office email in Settings."
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCorrectionDialog(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={act.isPending || correctionReason.trim().length < 5}>
                Send correction request
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
