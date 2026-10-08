import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, RefreshCw, Trash2, UserCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UpgradePanel } from "@/components/FeatureGate";
import { PageTransition, StaggerItem, StaggerList } from "@/components/Animated";

export const Route = createFileRoute("/_app/leaders")({
  head: () => ({
    meta: [
      { title: "Leaders — Mene:Log" },
      {
        name: "description",
        content: "Create leader roles, share your access code and see every registered leader.",
      },
      { property: "og:title", content: "Leaders — Mene:Log" },
      { property: "og:description", content: "Manage leader roles and accounts for your church." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LeadersPage,
});

function LeadersPage() {
  const { tenant, isAdmin, isOwner, can } = useTenant();
  const qc = useQueryClient();
  const [typeName, setTypeName] = useState("");
  const [code, setCode] = useState("");

  const types = useQuery({
    queryKey: ["leader-types", tenant?.id],
    enabled: !!tenant,
    queryFn: async () => {
      const { data, error } = await supabase.from("leader_types").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const leaders = useQuery({
    queryKey: ["leader-profiles", tenant?.id],
    enabled: !!tenant && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leader_profiles")
        .select("id, full_name, email, phone, location, status, created_at, leader_types(name)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const access = useQuery({
    queryKey: ["leader-access", tenant?.id],
    enabled: !!tenant && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_leader_access")
        .select("code, updated_at")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const addType = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("leader_types")
        .insert({ tenant_id: tenant!.id, name: typeName.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      setTypeName("");
      toast.success("Leader role added");
      qc.invalidateQueries({ queryKey: ["leader-types"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add that role"),
  });

  const removeType = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leader_types").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leader-types"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not remove that role"),
  });

  const saveCode = useMutation({
    mutationFn: async (value: string) => {
      const { data, error } = await supabase.rpc("set_leader_access_code", {
        p_tenant: tenant!.id,
        p_code: value,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (value) => {
      setCode("");
      toast.success(`Access code set to ${value}`);
      qc.invalidateQueries({ queryKey: ["leader-access"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not set the code"),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "active" | "suspended" }) => {
      const { error } = await supabase.from("leader_profiles").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leader-profiles"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update that leader"),
  });

  if (!isAdmin) {
    return (
      <p className="surface p-8 text-center text-sm text-muted-foreground">
        Administrator access required.
      </p>
    );
  }

  if (!can("leaders")) {
    return <UpgradePanel feature="leaders" canUpgrade={isOwner} />;
  }

  return (
    <PageTransition className="space-y-6">
      <div>
        <p className="text-eyebrow">People</p>
        <h1 className="mt-2 font-display text-2xl font-bold">Leaders</h1>
        <p className="text-sm text-muted-foreground">
          Choose the leader roles your church uses, share one access code, and members can pick
          their leader when they check in.
        </p>
      </div>

      <div data-tour="page-leaders-access" className="surface space-y-4 p-5">
        <div className="flex items-center gap-2">
          <KeyRound className="size-4 text-primary" />
          <h2 className="font-display font-bold">Leader access code</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Leaders must type this code to register on your check-in page. Share it only with your
          leadership team.
        </p>
        <p className="rounded-xl border border-border bg-secondary px-4 py-3 font-mono text-lg font-semibold">
          {access.data?.code ?? "Not set yet"}
        </p>
        <div className="flex flex-wrap gap-2">
          <Input
            className="max-w-56"
            placeholder="Set your own code"
            value={code}
            maxLength={24}
            onChange={(e) => setCode(e.target.value)}
          />
          <Button
            onClick={() => saveCode.mutate(code)}
            disabled={saveCode.isPending || code.trim().length < 6}
          >
            Save code
          </Button>
          <Button
            variant="outline"
            onClick={() => saveCode.mutate("")}
            disabled={saveCode.isPending}
          >
            <RefreshCw className="size-4" /> Generate one for me
          </Button>
        </div>
      </div>

      <div className="surface space-y-4 p-5">
        <h2 className="font-display font-bold">Types of leader</h2>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addType.mutate();
          }}
        >
          <div className="min-w-48 flex-1 space-y-2">
            <Label htmlFor="typeName" className="sr-only">
              Role name
            </Label>
            <Input
              id="typeName"
              placeholder="Cell leader, Usher head, Youth pastor…"
              value={typeName}
              maxLength={60}
              onChange={(e) => setTypeName(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={addType.isPending}>
            Add role
          </Button>
        </form>
        <StaggerList className="flex flex-wrap gap-2">
          {(types.data ?? []).map((type) => (
            <StaggerItem key={type.id}>
              <span className="flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1.5 text-sm font-semibold">
                {type.name}
                <button
                  type="button"
                  aria-label={`Remove ${type.name}`}
                  onClick={() => removeType.mutate(type.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </span>
            </StaggerItem>
          ))}
          {(types.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No roles yet. Add the first one above.</p>
          )}
        </StaggerList>
      </div>

      <div className="surface divide-y divide-border">
        <div className="flex items-center gap-2 p-5">
          <UserCheck className="size-4 text-primary" />
          <h2 className="font-display font-bold">Registered leaders</h2>
        </div>
        {(leaders.data ?? []).map((leader) => (
          <div key={leader.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="font-semibold">{leader.full_name}</p>
              <p className="truncate text-sm text-muted-foreground">
                {(leader.leader_types as { name: string } | null)?.name ?? "No role"} ·{" "}
                {leader.email ?? "no email"}
                {leader.location ? ` · ${leader.location}` : ""}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setStatus.mutate({
                  id: leader.id,
                  status: leader.status === "active" ? "suspended" : "active",
                })
              }
            >
              {leader.status === "active" ? "Suspend" : "Restore"}
            </Button>
          </div>
        ))}
        {(leaders.data ?? []).length === 0 && (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No leaders have registered yet. Send them your check-in link and the access code.
          </p>
        )}
      </div>
    </PageTransition>
  );
}
