import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useTenant, type AppRole } from "@/hooks/useTenant";
import { inviteAccount } from "@/lib/accounts.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/accounts")({
  head: () => ({
    meta: [
      { title: "Accounts — Mene:Log" },
      {
        name: "description",
        content: "Invite admins, branch admins, leaders and ushers, and suspend access.",
      },
      { property: "og:title", content: "Accounts — Mene:Log" },
      { property: "og:description", content: "Invite and manage the people who can sign in." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Accounts,
});

const roleOptions: Array<{ value: AppRole; label: string; tiers: string[] }> = [
  { value: "church_admin", label: "Church admin", tiers: ["standard", "premium"] },
  { value: "branch_admin", label: "Branch admin", tiers: ["premium"] },
  { value: "leader", label: "Leader", tiers: ["standard", "premium"] },
  { value: "usher", label: "Usher / scanner", tiers: ["basic", "standard", "premium"] },
];

function Accounts() {
  const { tenant, tier, membership } = useTenant();
  const qc = useQueryClient();
  const invite = useServerFn(inviteAccount);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("usher");
  const [positionId, setPositionId] = useState("");

  const { data: accounts } = useQuery({
    queryKey: ["accounts", tenant?.id],
    enabled: !!tenant,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_users")
        .select("id, role, status, created_at, position_id, profiles:user_id(full_name, email)")
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
      toast.success("Invitation sent");
      setEmail("");
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not invite"),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "active" | "suspended" }) => {
      const { error } = await supabase.from("tenant_users").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounts"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update"),
  });

  const allowed = roleOptions.filter((r) => r.tiers.includes(tier ?? "basic"));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-eyebrow">Access</p>
        <h1 className="mt-2 text-2xl font-bold">Accounts</h1>
        <p className="text-sm text-muted-foreground">
          Members never log in. Only the people listed here can sign in, and only within your
          church.
        </p>
      </div>

      <form
        className="surface grid gap-4 p-5 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          send.mutate();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="iemail">Email address</Label>
          <Input
            id="iemail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="irole">Role</Label>
          <select
            id="irole"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
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
        <div className="space-y-2">
          <Label htmlFor="ipos">Group</Label>
          <select
            id="ipos"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={positionId}
            onChange={(e) => setPositionId(e.target.value)}
            disabled={role !== "leader"}
          >
            <option value="">—</option>
            {(positions ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.group_name}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={send.isPending}>
          <UserPlus className="size-4" /> Invite
        </Button>
      </form>

      <div className="surface divide-y divide-border">
        {(accounts ?? []).map((a) => {
          const profile = a.profiles as unknown as {
            full_name: string | null;
            email: string | null;
          } | null;
          return (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">
                  {profile?.full_name || profile?.email || "Invited user"}
                </p>
                <p className="text-sm text-muted-foreground">{profile?.email}</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="capitalize">
                  {a.role.replace("_", " ")}
                </Badge>
                <Badge variant={a.status === "active" ? "default" : "outline"}>{a.status}</Badge>
                {a.role !== "owner" && (
                  <Button
                    size="sm"
                    variant="outline"
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
