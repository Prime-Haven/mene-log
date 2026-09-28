import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  UserPlus,
  Shield,
  ShieldAlert,
  Sparkles,
  Building2,
  UserCheck,
  CheckCircle2,
  UserX,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useTenant, type AppRole } from "@/hooks/useTenant";
import { inviteAccount } from "@/lib/accounts.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { planLabel } from "@/lib/pricing";

export const Route = createFileRoute("/_app/accounts")({
  head: () => ({
    meta: [
      { title: "Team & Staff Accounts — Mene:Log" },
      {
        name: "description",
        content:
          "Invite administrators, branch managers, leaders and ushers with tiered permissions.",
      },
      { property: "og:title", content: "Team Accounts — Mene:Log" },
      { property: "og:description", content: "Manage staff roles and access for your church." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Accounts,
});

const roleOptions: Array<{ value: AppRole; label: string; desc: string; tiers: string[] }> = [
  {
    value: "church_admin",
    label: "Church Admin",
    desc: "Full administrative access to services, reports, and data",
    tiers: ["standard", "premium"],
  },
  {
    value: "branch_admin",
    label: "Branch Admin",
    desc: "Manage specific branch services and local attendance",
    tiers: ["premium"],
  },
  {
    value: "leader",
    label: "Cell / Group Leader",
    desc: "Assigned to pastoral groups, care follow-ups, and members",
    tiers: ["standard", "premium"],
  },
  {
    value: "usher",
    label: "Usher / Scanner",
    desc: "At-the-door QR scanning and manual check-in access",
    tiers: ["basic", "standard", "premium"],
  },
];

export function Accounts() {
  const { tenant, tier, membership } = useTenant();
  const qc = useQueryClient();
  const invite = useServerFn(inviteAccount);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("usher");
  const [positionId, setPositionId] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["accounts", tenant?.id],
    enabled: !!tenant,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_users")
        .select("id, role, status, created_at, position_id, profiles:user_id(full_name, email)")
        .eq("tenant_id", tenant!.id)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: positions } = useQuery({
    queryKey: ["positions", tenant?.id],
    enabled: !!tenant,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("positions")
        .select("id, group_name")
        .eq("tenant_id", tenant!.id)
        .order("group_name");
      if (error) throw error;
      return data;
    },
  });

  const send = useMutation({
    mutationFn: async () => {
      const result = await invite({
        data: {
          tenant_id: tenant!.id,
          email: email.trim(),
          role,
          branch_id: membership?.branch_id ?? null,
          position_id: positionId || null,
        },
      });
      if (!result.ok) throw new Error(result.message);
      return result;
    },
    onSuccess: () => {
      toast.success("Invitation sent successfully");
      setEmail("");
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not invite account"),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "active" | "suspended" }) => {
      const { error } = await supabase.from("tenant_users").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Account status updated");
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update account"),
  });

  const allowed = roleOptions.filter((r) => r.tiers.includes(tier ?? "basic"));

  const filteredAccounts = (accounts ?? []).filter((a) => {
    if (filterRole === "all") return true;
    return a.role === filterRole;
  });

  return (
    <div className="space-y-7">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-eyebrow">Access Control</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Staff & Team Accounts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Members never log in. Only authorized staff and ushers can sign in to your church
            workspace.
          </p>
        </div>

        <Badge
          variant="outline"
          className="border-primary/30 bg-primary/10 text-primary font-display font-semibold px-3 py-1 text-xs"
        >
          <Sparkles className="size-3 mr-1 text-primary" /> {planLabel(tier ?? "basic")} Package
        </Badge>
      </div>

      {/* Invite Account Card */}
      <div className="surface rounded-2xl border border-border/80 p-5 shadow-panel space-y-4">
        <div>
          <h2 className="font-display text-base font-bold text-ink flex items-center gap-2">
            <UserPlus className="size-4 text-primary" /> Invite Team Member
          </h2>
          <p className="text-xs text-muted-foreground">
            Enter an email address and choose their role. They will receive an email invitation with
            instructions to join.
          </p>
        </div>

        <form
          className="grid gap-4 sm:grid-cols-[1.5fr_1.2fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            send.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="iemail" className="text-xs font-semibold">
              Email Address *
            </Label>
            <Input
              id="iemail"
              type="email"
              placeholder="e.g. usher@church.org"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-10 rounded-xl"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="irole" className="text-xs font-semibold">
              Assigned Role *
            </Label>
            <select
              id="irole"
              className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm font-medium focus:ring-2 focus:ring-primary/20"
              value={role}
              onChange={(e) => setRole(e.target.value as AppRole)}
            >
              {allowed.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ipos" className="text-xs font-semibold">
              Group / Cell (Leaders only)
            </Label>
            <select
              id="ipos"
              className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm font-medium disabled:opacity-50 focus:ring-2 focus:ring-primary/20"
              value={positionId}
              onChange={(e) => setPositionId(e.target.value)}
              disabled={role !== "leader"}
            >
              <option value="">None / Unassigned</option>
              {(positions ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.group_name}
                </option>
              ))}
            </select>
          </div>

          <Button
            type="submit"
            disabled={send.isPending || !email.trim()}
            className="h-10 rounded-xl font-semibold px-5"
          >
            <UserPlus className="size-4 mr-1.5" /> Invite
          </Button>
        </form>
      </div>

      {/* Role Explanations */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {roleOptions.map((ro) => {
          const isEligible = ro.tiers.includes(tier ?? "basic");
          return (
            <div
              key={ro.value}
              className={`rounded-2xl border p-4 text-xs space-y-1.5 transition-all ${
                isEligible
                  ? "bg-card border-border/80 text-foreground shadow-sm"
                  : "bg-muted/40 border-dashed border-border/60 text-muted-foreground opacity-75"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold font-display text-sm text-foreground">{ro.label}</span>
                {isEligible ? (
                  <Badge
                    variant="secondary"
                    className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"
                  >
                    Active
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    Requires Upgrade
                  </Badge>
                )}
              </div>
              <p className="leading-relaxed">{ro.desc}</p>
            </div>
          );
        })}
      </div>

      {/* Accounts List */}
      <div className="surface rounded-2xl border border-border/80 overflow-hidden shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 p-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Filter by Role:
            </span>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="h-8 rounded-lg border border-input bg-background px-2.5 text-xs font-medium"
            >
              <option value="all">All Roles ({(accounts ?? []).length})</option>
              <option value="owner">Owners</option>
              <option value="church_admin">Church Admins</option>
              <option value="branch_admin">Branch Admins</option>
              <option value="leader">Leaders</option>
              <option value="usher">Ushers / Scanners</option>
            </select>
          </div>

          <span className="text-xs font-medium text-muted-foreground">
            {filteredAccounts.length} team member{filteredAccounts.length === 1 ? "" : "s"}
          </span>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Loading accounts…</div>
        ) : filteredAccounts.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            No accounts match this filter.
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {filteredAccounts.map((a) => {
              const profile = a.profiles as unknown as {
                full_name: string | null;
                email: string | null;
              } | null;

              return (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-muted/20 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-foreground">
                      {profile?.full_name || profile?.email || "Invited User"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{profile?.email}</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <Badge
                      variant="secondary"
                      className="capitalize text-xs font-semibold px-2.5 py-1"
                    >
                      {a.role.replace("_", " ")}
                    </Badge>

                    <Badge
                      variant={a.status === "active" ? "default" : "outline"}
                      className={`text-xs capitalize ${
                        a.status === "active"
                          ? "bg-emerald-600 hover:bg-emerald-600 text-white"
                          : "text-muted-foreground"
                      }`}
                    >
                      {a.status}
                    </Badge>

                    {a.role !== "owner" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs font-semibold"
                        onClick={() =>
                          setStatus.mutate({
                            id: a.id,
                            status: a.status === "active" ? "suspended" : "active",
                          })
                        }
                      >
                        {a.status === "active" ? "Suspend" : "Restore"}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default Accounts;
