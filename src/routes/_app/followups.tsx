import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { UpgradePanel } from "@/components/FeatureGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_app/followups")({
  head: () => ({
    meta: [
      { title: "First-timer follow-ups — Mene:Log" },
      { name: "description", content: "Follow up with first-timers and absent members." },
      { property: "og:title", content: "First-timer follow-ups — Mene:Log" },
      { property: "og:description", content: "Follow up with first-timers and absent members." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Followups,
});

export const FOLLOWUP_STATUSES = [
  ["new", "New"],
  ["contacted", "Contacted"],
  ["visited", "Visited"],
  ["joined", "Joined"],
  ["not_interested", "Not interested"],
] as const;

type Row = {
  member_id: string;
  full_name: string;
  phone: string | null;
  joined_on: string;
  followup_id: string | null;
  status: string;
  assigned_leader_id: string | null;
  leader_name: string | null;
  note: string | null;
  next_contact_on: string | null;
  source: string;
};

function Followups() {
  const ctx = useTenant();
  const { tenant } = ctx;
  const [filter, setFilter] = useState("open");

  const list = useQuery({
    queryKey: ["followups", tenant?.id],
    enabled: !!tenant && ctx.can("followups"),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_followups", { p_tenant: tenant!.id });
      if (error) throw error;
      return data as unknown as Row[];
    },
  });
  const leaders = useQuery({
    queryKey: ["followup-leaders", tenant?.id],
    enabled: !!tenant && ctx.can("followups"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leader_profiles")
        .select("id, full_name")
        .eq("tenant_id", tenant!.id)
        .eq("status", "active")
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  if (!ctx.can("followups")) return <UpgradePanel feature="followups" canUpgrade={ctx.isOwner} />;

  const today = new Date().toISOString().slice(0, 10);
  const rows = (list.data ?? []).filter((r) =>
    filter === "all"
      ? true
      : filter === "open"
        ? !["joined", "not_interested"].includes(r.status)
        : r.status === filter,
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-eyebrow">People</p>
          <h1 className="mt-2 text-2xl font-bold">Follow-ups</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            First-timers and members you've added from absence alerts.
          </p>
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-44" aria-label="Filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Still open</SelectItem>
            <SelectItem value="all">Everyone</SelectItem>
            {FOLLOWUP_STATUSES.map(([v, l]) => (
              <SelectItem key={v} value={v}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {list.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nobody needs a follow-up right now.
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((r) => (
            <FollowupCard
              key={r.member_id}
              row={r}
              overdue={
                !!r.next_contact_on &&
                r.next_contact_on < today &&
                !["joined", "not_interested"].includes(r.status)
              }
              leaders={leaders.data ?? []}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FollowupCard({
  row,
  overdue,
  leaders,
}: {
  row: Row;
  overdue: boolean;
  leaders: Array<{ id: string; full_name: string }>;
}) {
  const qc = useQueryClient();
  const [status, setStatus] = useState(row.status);
  const [leader, setLeader] = useState(row.assigned_leader_id ?? "none");
  const [note, setNote] = useState(row.note ?? "");
  const [next, setNext] = useState(row.next_contact_on ?? "");
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("upsert_followup", {
        p_member: row.member_id,
        p_status: status,
        p_leader: (leader === "none" ? null : leader) as string,
        p_note: note.trim().slice(0, 1000),
        p_next: (next || null) as string,
        p_source: row.followup_id ? row.source : row.source || "first_timer",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Follow-up saved");
      qc.invalidateQueries({ queryKey: ["followups"] });
      qc.invalidateQueries({ queryKey: ["absent-members"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });
  return (
    <div className={`rounded-lg border bg-card p-4 ${overdue ? "border-destructive/50" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{row.full_name}</p>
          <p className="text-xs text-muted-foreground">
            {row.phone ?? "No phone"} · joined {row.joined_on}
            {row.source === "absence" ? " · from absence alert" : ""}
          </p>
        </div>
        {overdue && (
          <span className="rounded bg-destructive/10 px-2 py-0.5 text-[10px] font-bold uppercase text-destructive">
            Overdue
          </span>
        )}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FOLLOWUP_STATUSES.map(([v, l]) => (
              <SelectItem key={v} value={v}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={leader} onValueChange={setLeader}>
          <SelectTrigger aria-label="Leader">
            <SelectValue placeholder="Assign leader" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No leader</SelectItem>
            {leaders.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          aria-label="Next contact"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
      </div>
      <Textarea
        className="mt-2"
        rows={2}
        maxLength={1000}
        placeholder="Note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Button size="sm" className="mt-2" disabled={save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
