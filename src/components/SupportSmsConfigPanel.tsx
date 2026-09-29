import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  MessageSquare,
  ShieldCheck,
  Send,
  Save,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Building2,
  RefreshCw,
  Phone,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  getSupportSmsConfig,
  saveSupportSmsConfig,
  testSupportSmsConfig,
} from "@/lib/support.functions";

interface SupportSmsConfigPanelProps {
  tenantId: string;
  className?: string;
  onSaved?: () => void;
}

export function SupportSmsConfigPanel({
  tenantId,
  className = "",
  onSaved,
}: SupportSmsConfigPanelProps) {
  const qc = useQueryClient();
  const getConfigFn = useServerFn(getSupportSmsConfig);
  const saveConfigFn = useServerFn(saveSupportSmsConfig);
  const testConfigFn = useServerFn(testSupportSmsConfig);

  // Selected scope: 'tenant' or branch id
  const [selectedScope, setSelectedScope] = useState<string>("tenant");

  // Local state for the active scope
  const [enabled, setEnabled] = useState(true);
  const [recipientsText, setRecipientsText] = useState("");
  const [isTesting, setIsTesting] = useState(false);

  // Fetch current settings
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["support-sms-config", tenantId],
    queryFn: () => getConfigFn({ data: { tenant_id: tenantId } }),
    enabled: !!tenantId,
  });

  // Sync state whenever scope or data changes
  useEffect(() => {
    if (!data) return;
    if (selectedScope === "tenant") {
      setEnabled(data.tenant.enabled);
      setRecipientsText(data.tenant.recipients || data.defaultPhone || "");
    } else {
      const branch = data.branches.find((b) => b.id === selectedScope);
      if (branch) {
        setEnabled(branch.enabled);
        setRecipientsText(branch.recipients || "");
      }
    }
  }, [data, selectedScope]);

  // Parse comma-separated numbers for validation display
  const parsedNumbers = useMemo(() => {
    return recipientsText
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((num) => {
        const clean = num.replace(/[^\d+]/g, "");
        const isValid =
          (clean.startsWith("+") && clean.length >= 10 && clean.length <= 16) ||
          (clean.startsWith("0") && clean.length >= 10 && clean.length <= 11) ||
          (clean.length >= 9 && clean.length <= 15);
        return {
          raw: num,
          clean,
          isValid,
        };
      });
  }, [recipientsText]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const branchId = selectedScope === "tenant" ? null : selectedScope;
      return saveConfigFn({
        data: {
          tenant_id: tenantId,
          branch_id: branchId,
          enabled,
          recipients: recipientsText,
        },
      });
    },
    onSuccess: () => {
      toast.success(
        selectedScope === "tenant"
          ? "Church support SMS settings saved successfully."
          : "Branch support SMS settings saved successfully.",
      );
      qc.invalidateQueries({ queryKey: ["support-sms-config", tenantId] });
      onSaved?.();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to save support SMS settings.");
    },
  });

  // Handle test SMS
  async function handleSendTest() {
    const validRecipients = parsedNumbers.filter((p) => p.isValid).map((p) => p.clean);
    if (validRecipients.length === 0) {
      toast.error("Please enter at least one valid recipient phone number before testing.");
      return;
    }

    setIsTesting(true);
    try {
      const res = await testConfigFn({
        data: {
          tenant_id: tenantId,
          recipients: validRecipients,
        },
      });

      if (res.ok) {
        toast.success(
          `Test SMS sent using sender ID "Mene Log" to ${validRecipients.length} recipient${validRecipients.length > 1 ? "s" : ""}.`,
        );
      } else {
        toast.error(res.error || "Could not dispatch test SMS. Verify provider settings.");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error sending test SMS.";
      toast.error(message);
    } finally {
      setIsTesting(false);
    }
  }

  if (isLoading) {
    return (
      <div className={`p-6 rounded-2xl border bg-card/60 backdrop-blur-sm ${className}`}>
        <div className="flex items-center gap-3 text-muted-foreground animate-pulse text-sm">
          <RefreshCw className="h-4 w-4 animate-spin text-primary" />
          Loading SMS notification preferences...
        </div>
      </div>
    );
  }

  const branches = data?.branches ?? [];
  const activeBranch = branches.find((b) => b.id === selectedScope);

  return (
    <div className={`rounded-2xl border bg-card p-6 shadow-sm space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Support Ticket SMS Alerts</h3>
              <p className="text-xs text-muted-foreground">
                Instant SMS notifications whenever support tickets are opened or updated.
              </p>
            </div>
          </div>
        </div>

        {/* Sender ID status badge */}
        <div className="flex items-center gap-2 self-start sm:self-center px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/20 text-xs">
          <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
          <span className="text-muted-foreground font-medium">Sender ID:</span>
          <span className="font-bold text-foreground font-mono">Mene Log</span>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold uppercase tracking-wider ml-1">
            Verified
          </span>
        </div>
      </div>

      {/* Scope Selector: Main Church or specific branch */}
      {branches.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Configure Notifications For
          </Label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedScope("tenant")}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
                selectedScope === "tenant"
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-border"
              }`}
            >
              <Building2 className="h-3.5 w-3.5" />
              <span>Main Church Account</span>
            </button>

            {branches.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setSelectedScope(b.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
                  selectedScope === b.id
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-border"
                }`}
              >
                <Phone className="h-3.5 w-3.5" />
                <span>
                  {b.name} {b.city ? `(${b.city})` : ""}
                </span>
                {b.isDefault && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/20">Default</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Master Toggle */}
      <div className="flex items-center justify-between p-4 rounded-xl border bg-muted/20">
        <div className="space-y-0.5 pr-4">
          <Label
            htmlFor="support-sms-toggle"
            className="text-sm font-semibold text-foreground cursor-pointer"
          >
            Enable SMS Notifications
          </Label>
          <p className="text-xs text-muted-foreground">
            {selectedScope === "tenant"
              ? "Send SMS alerts for tickets created across the church to configured numbers."
              : `Send customized SMS alerts specifically for tickets originating from ${activeBranch?.name ?? "this branch"}.`}
          </p>
        </div>
        <Switch id="support-sms-toggle" checked={enabled} onCheckedChange={setEnabled} />
      </div>

      {/* Recipient Phone Numbers Input */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="support-recipients" className="text-sm font-semibold text-foreground">
            Recipient Phone Numbers
          </Label>
          <span className="text-xs text-muted-foreground">Multiple numbers separated by comma</span>
        </div>

        <Input
          id="support-recipients"
          type="text"
          value={recipientsText}
          onChange={(e) => setRecipientsText(e.target.value)}
          placeholder="e.g. 0244123456, 0550160237, +233201112233"
          className="h-11 rounded-xl bg-background font-mono text-sm"
          disabled={!enabled}
        />

        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <HelpCircle className="h-3.5 w-3.5 shrink-0" />
          Supports Ghanaian local formats (e.g. <code className="font-mono">024...</code>) and
          international formats (e.g. <code className="font-mono">+233...</code>). In addition to
          these numbers, the Mene:Log technical hotline (+233550160237) is always notified of urgent
          system requests.
        </p>

        {/* Real-time Parsed Numbers Preview */}
        {parsedNumbers.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {parsedNumbers.map((p, i) => (
              <span
                key={i}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-medium border ${
                  p.isValid
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                    : "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400"
                }`}
              >
                {p.isValid ? (
                  <CheckCircle2 className="h-3 w-3 shrink-0" />
                ) : (
                  <AlertCircle className="h-3 w-3 shrink-0" />
                )}
                <span>{p.raw}</span>
                {!p.isValid && <span className="text-[10px] opacity-75">(incomplete)</span>}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={handleSendTest}
          disabled={isTesting || !enabled || parsedNumbers.length === 0}
          className="w-full sm:w-auto rounded-xl gap-2 h-10 border-dashed"
        >
          {isTesting ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4 text-primary" />
          )}
          <span>Send Test SMS</span>
        </Button>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="w-full sm:w-auto rounded-xl gap-2 h-10 font-semibold px-6 shadow-sm"
          >
            {saveMutation.isPending ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            <span>Save Preferences</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
