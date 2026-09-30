import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  Network,
  Plus,
  ArrowRight,
  GitBranch,
  Shield,
  Trash2,
  Users,
  CheckCircle2,
  Sparkles,
  Layers,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { UpgradePanel } from "@/components/FeatureGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/structure")({
  head: () => ({
    meta: [
      { title: "Leadership structure & Hierarchy — Mene:Log" },
      {
        name: "description",
        content: "Configure your church leadership roles, reporting hierarchy, and group structure.",
      },
      { property: "og:title", content: "Leadership structure & Hierarchy — Mene:Log" },
      {
        property: "og:description",
        content: "Define your church's leadership roles and configure who reports to whom.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Structure,
});

type LeaderTypeRecord = {
  id: string;
  name: string;
  reports_to_type_id: string | null;
  level_rank?: number | null;
  parent?: { id: string; name: string } | null;
};

export function Structure() {
  const ctx = useTenant();
  const { tenant, tier, can } = useTenant();
  const qc = useQueryClient();

  // Leader Role Hierarchy Form State
  const [roleName, setRoleName] = useState("");
  const [reportsToTypeId, setReportsToTypeId] = useState<string>("");

  // Group Form State
  const [groupName, setGroupName] = useState("");
  const [groupLeaderTypeId, setGroupLeaderTypeId] = useState("");

  // Query Leader Types with Hierarchy
  const leaderTypesQuery = useQuery({
    queryKey: ["leader-types-hierarchy", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leader_types")
        .select("id, name, reports_to_type_id, level_rank")
        .eq("tenant_id", tenant!.id)
        .order("name");
      if (error) throw error;

      const types = (data ?? []) as LeaderTypeRecord[];
      const map = new Map(types.map((t) => [t.id, t]));
      return types.map((t) => ({
        ...t,
        parent: t.reports_to_type_id ? map.get(t.reports_to_type_id) ?? null : null,
      }));
    },
  });

  // Query Leaders and their groups
  const leaderProfilesQuery = useQuery({
    queryKey: ["leader-profiles-structure", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leader_profiles")
        .select("id, full_name, email, phone, group_name, reports_to_leader_id, leader_types(id, name)")
        .eq("tenant_id", tenant!.id)
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Add Leader Type with Hierarchy Configuration
  const addLeaderType = useMutation({
    mutationFn: async () => {
      const name = roleName.trim();
      if (!name) throw new Error("Role name is required");

      const existingCount = leaderTypesQuery.data?.length ?? 0;
      if (tier !== "premium" && existingCount >= 3) {
        throw new Error("Multiple leadership hierarchy levels are available on Premium. Upgrade to add unlimited roles.");
      }

      // Try inserting into leader_types with reports_to_type_id
      try {
        const { error } = await supabase.from("leader_types").insert({
          tenant_id: tenant!.id,
          name,
          reports_to_type_id: reportsToTypeId || null,
        } as unknown as { tenant_id: string; name: string });
        if (error) throw error;
      } catch {
        // Fallback for basic schema without reports_to_type_id column yet
        const { error } = await supabase.from("leader_types").insert({
          tenant_id: tenant!.id,
          name,
        });
        if (error) throw error;
      }

      // Also sync to structure_levels for backwards compatibility
      try {
        await supabase.from("structure_levels").insert({
          tenant_id: tenant!.id,
          name,
          rank: existingCount + 1,
        });
      } catch {
        // non-blocking
      }
    },
    onSuccess: () => {
      setRoleName("");
      setReportsToTypeId("");
      toast.success("Leader role and reporting hierarchy saved!");
      qc.invalidateQueries({ queryKey: ["leader-types-hierarchy"] });
      qc.invalidateQueries({ queryKey: ["leader-types"] });
      qc.invalidateQueries({ queryKey: ["public-leader-types"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save leader role"),
  });

  // Update reports_to relationship for an existing role
  const updateHierarchy = useMutation({
    mutationFn: async ({ id, reportsTo }: { id: string; reportsTo: string | null }) => {
      const { error } = await supabase
        .from("leader_types")
        .update({ reports_to_type_id: reportsTo } as unknown as { name?: string })
        .eq("id", id)
        .eq("tenant_id", tenant!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Hierarchy updated successfully!");
      qc.invalidateQueries({ queryKey: ["leader-types-hierarchy"] });
      qc.invalidateQueries({ queryKey: ["public-leader-types"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update hierarchy"),
  });

  // Delete Leader Type
  const deleteLeaderType = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("leader_types")
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenant!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role removed");
      qc.invalidateQueries({ queryKey: ["leader-types-hierarchy"] });
      qc.invalidateQueries({ queryKey: ["public-leader-types"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not delete role"),
  });

  if (!ctx.isLoading && !can("structure") && tier === "free") {
    return <UpgradePanel feature="structure" canUpgrade={ctx.isOwner} />;
  }

  const leaderTypes = leaderTypesQuery.data ?? [];
  const leaders = leaderProfilesQuery.data ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-eyebrow">Organization & Leadership</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Leadership Structure & Hierarchy</h1>
        <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
          Configure which type of leader reports to which type of leader (for example, Cell Leader reports to PCF Leader).
          This hierarchy automatically guides new leaders during registration and structures attendance reports.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Column: Configure Leader Roles & Reporting Rules */}
        <div className="lg:col-span-6 space-y-6">
          <div className="surface rounded-2xl border border-border/80 p-5 shadow-panel space-y-5">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div>
                <h2 className="text-base font-bold flex items-center gap-2">
                  <GitBranch className="size-4 text-primary" />
                  <span>Configured Leadership Roles</span>
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Define roles and choose who each role reports to.
                </p>
              </div>
              <Badge variant="outline" className="text-xs font-mono">
                {leaderTypes.length} Roles
              </Badge>
            </div>

            {leaderTypes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/80 p-6 text-center text-sm text-muted-foreground space-y-2">
                <Network className="mx-auto size-8 text-muted-foreground/60" />
                <p className="font-semibold text-foreground">No leadership roles defined yet</p>
                <p className="text-xs">
                  Add roles below like &ldquo;PCF Leader&rdquo; and &ldquo;Cell Leader&rdquo; to build your hierarchy.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border/60 space-y-1">
                {leaderTypes.map((type) => (
                  <li key={type.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-foreground">{type.name}</span>
                        {type.parent ? (
                          <span className="inline-flex items-center gap-1 text-[11px] rounded-full bg-primary/10 text-primary px-2.5 py-0.5 font-medium">
                            <span>Reports to</span>
                            <ArrowRight className="size-3" />
                            <b>{type.parent.name}</b>
                          </span>
                        ) : (
                          <span className="text-[11px] rounded-full bg-muted text-muted-foreground px-2 py-0.5 font-medium">
                            Top Level (Direct to Senior Pastor)
                          </span>
                        )}
                      </div>

                      {/* Quick Reporting Re-assigner */}
                      <div className="mt-2 flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground text-[11px]">Change reports to:</span>
                        <select
                          value={type.reports_to_type_id ?? ""}
                          onChange={(e) =>
                            updateHierarchy.mutate({
                              id: type.id,
                              reportsTo: e.target.value || null,
                            })
                          }
                          className="h-7 rounded-lg border border-input bg-background px-2 text-[11px] font-medium"
                        >
                          <option value="">None (Top Level)</option>
                          {leaderTypes
                            .filter((other) => other.id !== type.id)
                            .map((other) => (
                              <option key={other.id} value={other.id}>
                                {other.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>

                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteLeaderType.mutate(type.id)}
                      className="size-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 self-end sm:self-center"
                      title="Delete role"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {/* Add New Leader Type Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addLeaderType.mutate();
              }}
              className="rounded-xl border border-border/80 bg-muted/30 p-4 space-y-3.5 pt-4"
            >
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Add New Leadership Role
              </h3>

              <div className="space-y-1.5">
                <Label htmlFor="rname" className="text-xs font-semibold">
                  Role Name
                </Label>
                <Input
                  id="rname"
                  placeholder="e.g. Cell Leader, PCF Leader, Zonal Pastor"
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  required
                  maxLength={60}
                  className="h-10 rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rreports" className="text-xs font-semibold">
                  This Leader Reports To
                </Label>
                <select
                  id="rreports"
                  value={reportsToTypeId}
                  onChange={(e) => setReportsToTypeId(e.target.value)}
                  className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-medium"
                >
                  <option value="">Nobody (Top Level / Senior Pastor)</option>
                  {leaderTypes.map((lt) => (
                    <option key={lt.id} value={lt.id}>
                      {lt.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground">
                  Leaders registering for this role on the check-in page will automatically be prompted to choose their superior.
                </p>
              </div>

              <Button
                type="submit"
                disabled={addLeaderType.isPending || !roleName.trim()}
                className="w-full h-10 rounded-xl font-semibold gap-1.5"
              >
                <Plus className="size-4" /> Save Leadership Role
              </Button>
            </form>
          </div>
        </div>

        {/* Right Column: Visual Hierarchy Flow & Group Overview */}
        <div className="lg:col-span-6 space-y-6">
          {/* Visual Hierarchy Diagram */}
          <div className="surface rounded-2xl border border-border/80 p-5 shadow-panel space-y-4">
            <h2 className="text-base font-bold flex items-center gap-2 border-b border-border/60 pb-3">
              <Layers className="size-4 text-primary" />
              <span>Leadership Hierarchy Chain of Command</span>
            </h2>

            {leaderTypes.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                Add roles to see the visual chain of command.
              </p>
            ) : (
              <div className="space-y-3 py-2">
                {leaderTypes.map((type, idx) => {
                  const subordinates = leaderTypes.filter((t) => t.reports_to_type_id === type.id);
                  return (
                    <div
                      key={type.id}
                      className="rounded-xl border border-border/70 bg-card p-3.5 shadow-sm space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="grid size-6 place-items-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                            {idx + 1}
                          </span>
                          <span className="font-bold text-sm text-foreground">{type.name}</span>
                        </div>
                        {type.parent ? (
                          <Badge variant="secondary" className="text-[10px]">
                            Reports to {type.parent.name}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400">
                            Executive / Top Level
                          </Badge>
                        )}
                      </div>

                      {subordinates.length > 0 && (
                        <div className="pl-6 border-l-2 border-primary/30 mt-2 space-y-1">
                          <p className="text-[11px] font-semibold text-muted-foreground">
                            Leaders directly reporting to this role:
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {subordinates.map((sub) => (
                              <span
                                key={sub.id}
                                className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium"
                              >
                                <ArrowRight className="size-3 text-primary" />
                                {sub.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Active Leaders & Groups breakdown */}
          <div className="surface rounded-2xl border border-border/80 p-5 shadow-panel space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <h2 className="text-base font-bold flex items-center gap-2">
                <Users className="size-4 text-primary" />
                <span>Active Registered Leaders & Groups</span>
              </h2>
              <span className="text-xs text-muted-foreground">{leaders.length} Active</span>
            </div>

            {leaders.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                No registered leaders yet. Share your church check-in link with your team.
              </p>
            ) : (
              <ul className="divide-y divide-border/60 max-h-72 overflow-y-auto pr-1 text-xs">
                {leaders.map((ldr) => (
                  <li key={ldr.id} className="py-2.5 flex items-center justify-between gap-2">
                    <div>
                      <span className="font-semibold text-foreground text-sm block">{ldr.full_name}</span>
                      <div className="flex items-center gap-2 text-muted-foreground mt-0.5">
                        <span>{(ldr.leader_types as { name?: string } | null)?.name || "Leader"}</span>
                        {ldr.group_name && <span>· Group: <b>{ldr.group_name}</b></span>}
                      </div>
                    </div>
                    {ldr.reports_to_leader_id && (
                      <Badge variant="outline" className="text-[10px]">
                        Has Assigned Supervisor
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
