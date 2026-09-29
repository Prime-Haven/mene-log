import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { UpgradePanel } from "@/components/FeatureGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_app/structure")({
  head: () => ({
    meta: [
      { title: "Leadership structure — Mene:Log" },
      {
        name: "description",
        content: "Name your leadership levels and create the groups beneath them.",
      },
      { property: "og:title", content: "Leadership structure — Mene:Log" },
      {
        property: "og:description",
        content: "Define your church's own leadership levels and groups.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Structure,
});

function Structure() {
  const ctx = useTenant();
  const { tenant, tier } = ctx;
  const qc = useQueryClient();
  const [levelName, setLevelName] = useState("");
  const [groupName, setGroupName] = useState("");
  const [levelId, setLevelId] = useState("");
  const [parentId, setParentId] = useState("");

  const { data: levels } = useQuery({
    queryKey: ["levels", tenant?.id],
    enabled: !!tenant,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("structure_levels")
        .select("id, name, rank")
        .order("rank");
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
        .select("id, group_name, level_id, parent_id, members(count)")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const addLevel = useMutation({
    mutationFn: async () => {
      const rank = (levels?.length ?? 0) + 1;
      if (tier !== "premium" && rank > 1) {
        throw new Error("Multiple leadership levels are locked on your current plan. Upgrade your account to unlock this feature.");
      }
      const { error } = await supabase
        .from("structure_levels")
        .insert({ tenant_id: tenant!.id, name: levelName.trim(), rank });
      if (error) throw error;
    },
    onSuccess: () => {
      setLevelName("");
      toast.success("Level added");
      qc.invalidateQueries({ queryKey: ["levels"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add level"),
  });

  const addPosition = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("positions").insert({
        tenant_id: tenant!.id,
        level_id: levelId,
        parent_id: parentId || null,
        group_name: groupName.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setGroupName("");
      toast.success("Group created");
      qc.invalidateQueries({ queryKey: ["positions"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create group"),
  });

  if (!ctx.isLoading && !ctx.can("structure")) {
    return <UpgradePanel feature="structure" canUpgrade={ctx.isOwner} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-eyebrow">Organisation</p>
        <h1 className="mt-2 text-2xl font-bold">Leadership structure</h1>
        <p className="text-sm text-muted-foreground">
          Use your church's own words — cell, unit, ministry, zone. Level 1 is the lowest.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="surface p-5">
          <h2 className="text-base font-semibold">Levels</h2>
          <ul className="mt-3 divide-y divide-border text-sm">
            {(levels ?? []).map((l) => (
              <li key={l.id} className="flex justify-between py-2">
                <span>{l.name}</span>
                <span className="text-muted-foreground">Rank {l.rank}</span>
              </li>
            ))}
            {(levels ?? []).length === 0 && (
              <li className="py-2 text-muted-foreground">No levels defined.</li>
            )}
          </ul>
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addLevel.mutate();
            }}
          >
            <Input
              placeholder="Cell Leader"
              value={levelName}
              onChange={(e) => setLevelName(e.target.value)}
              required
              maxLength={60}
            />
            <Button type="submit" disabled={addLevel.isPending}>
              <Plus className="size-4" /> Add
            </Button>
          </form>
          {tier !== "premium" && (
            <p className="mt-2 text-xs text-muted-foreground">
              Your plan supports a single leadership level. Upgrade your account to unlock full multi-level hierarchy.
            </p>
          )}
        </div>

        <div className="surface p-5">
          <h2 className="text-base font-semibold">Groups</h2>
          <ul className="mt-3 divide-y divide-border text-sm">
            {(positions ?? []).map((p) => (
              <li key={p.id} className="flex justify-between py-2">
                <span>{p.group_name}</span>
                <span className="text-muted-foreground">
                  {(p.members as unknown as Array<{ count: number }>)?.[0]?.count ?? 0} members
                </span>
              </li>
            ))}
            {(positions ?? []).length === 0 && (
              <li className="py-2 text-muted-foreground">No groups yet.</li>
            )}
          </ul>

          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              addPosition.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="gname">Group name</Label>
              <Input
                id="gname"
                placeholder="Adenta Cell"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                required
                maxLength={80}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="glevel">Level</Label>
                <select
                  id="glevel"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={levelId}
                  onChange={(e) => setLevelId(e.target.value)}
                  required
                >
                  <option value="">Select</option>
                  {(levels ?? []).map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="gparent">Reports to</Label>
                <select
                  id="gparent"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                  disabled={tier !== "premium"}
                >
                  <option value="">Nobody (top level)</option>
                  {(positions ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.group_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <Button type="submit" disabled={addPosition.isPending || !levelId}>
              Create group
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
