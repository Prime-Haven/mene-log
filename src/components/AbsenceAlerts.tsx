import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { UserX } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";

type Absent = {
  threshold: number;
  ready: boolean;
  members: Array<{
    id: string;
    full_name: string;
    phone: string | null;
    last_seen: string | null;
    in_followups: boolean;
  }>;
};

/** Dashboard card listing members who missed the last N Sundays. */
export function AbsenceAlerts() {
  const ctx = useTenant();
  const qc = useQueryClient();
  const tenant = ctx.tenant;
  const { data, isLoading } = useQuery({
    queryKey: ["absent-members", tenant?.id],
    enabled: !!tenant && ctx.canManageMembers,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("absent_members", { p_tenant: tenant!.id });
      if (error) throw error;
      return data as unknown as Absent;
    },
  });
  const add = useMutation({
    mutationFn: async (member: string) => {
      const { error } = await supabase.rpc("upsert_followup", {
        p_member: member,
        p_status: "new",
        p_leader: null as unknown as string,
        p_note: "",
        p_next: null as unknown as string,
        p_source: "absence",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Added to follow-ups");
      qc.invalidateQueries({ queryKey: ["absent-members"] });
      qc.invalidateQueries({ queryKey: ["followups"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add"),
  });
  if (!ctx.canManageMembers) return null;
  const canFollow = ctx.can("followups");

  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-panel)]">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <UserX className="size-4 text-destructive" /> Missing recently
        </h2>
        {data && (
          <span className="text-xs text-muted-foreground">
            Missed last {data.threshold} Sundays
          </span>
        )}
      </div>
      {isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">Checking…</p>
      ) : !data?.ready ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Alerts start once you've held {data?.threshold ?? 3} Sunday services.
        </p>
      ) : data.members.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Everyone has attended recently.</p>
      ) : (
        <ul className="mt-3 max-h-72 divide-y overflow-y-auto">
          {data.members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{m.full_name}</p>
                <p className="text-xs text-muted-foreground">
                  {m.last_seen
                    ? `Last seen ${new Date(m.last_seen).toLocaleDateString()}`
                    : "Never checked in"}
                  {m.phone ? ` · ${m.phone}` : ""}
                </p>
              </div>
              {canFollow &&
                (m.in_followups ? (
                  <Link to="/followups" className="text-xs font-semibold text-primary">
                    In follow-ups
                  </Link>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={add.isPending}
                    onClick={() => add.mutate(m.id)}
                  >
                    Follow up
                  </Button>
                ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
