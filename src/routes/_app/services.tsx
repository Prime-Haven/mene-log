import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Lock, Pencil, Radio, Trash2, Unlock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_app/services")({
  head: () => ({
    meta: [
      { title: "Services — Mene:Log" },
      { name: "description", content: "Create services and open or close them for attendance capture." },
      { property: "og:title", content: "Services — Mene:Log" },
      { property: "og:description", content: "Create and manage your church services." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Services,
});

function Services() {
  const { tenant, membership, can } = useTenant();
  const liveOn = can("watch_live");
  const [live, setLive] = useState<{ id: string; url: string; min: number } | null>(null);
  const qc = useQueryClient();
  const [name, setName] = useState("Sunday Service");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [editing, setEditing] = useState<{ id: string; name: string; date: string } | null>(null);

  const { data: services } = useQuery({
    queryKey: ["services", tenant?.id],
    enabled: !!tenant,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id, name, service_date, is_open, stream_url, online_min_minutes, attendance(count), watch_sessions(count)")
        .order("service_date", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("services").insert({
        tenant_id: tenant!.id,
        branch_id: membership?.branch_id ?? null,
        name,
        service_date: date,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Service created");
      qc.invalidateQueries({ queryKey: ["services"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create service"),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, is_open }: { id: string; is_open: boolean }) => {
      const { error } = await supabase.from("services").update({ is_open }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["services"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update service"),
  });

  const rename = useMutation({
    mutationFn: async ({ id, name: newName, date: newDate }: { id: string; name: string; date: string }) => {
      const { error } = await supabase.rpc("rename_service", {
        p_service: id,
        p_name: newName,
        p_date: newDate,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setEditing(null);
      toast.success("Service updated");
      qc.invalidateQueries({ queryKey: ["services"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update service"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("delete_service", { p_service: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Service deleted");
      qc.invalidateQueries({ queryKey: ["services"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not delete service"),
  });

  const saveLive = useMutation({
    mutationFn: async (v: { id: string; url: string; min: number }) => {
      const url = v.url.trim();
      if (url && !/^https:\/\/\S+$/i.test(url)) throw new Error("Stream link must start with https://");
      const { error } = await supabase
        .from("services")
        .update({ stream_url: url || null, online_min_minutes: Math.max(1, Math.min(240, v.min)) })
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Live stream saved");
      setLive(null);
      qc.invalidateQueries({ queryKey: ["services"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save live stream"),
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-eyebrow">Attendance</p>
        <h1 className="mt-2 text-2xl font-bold">Services</h1>
        <p className="text-sm text-muted-foreground">
          Attendance is recorded against a service. Close a service to stop further scans, or delete
          one you created by mistake.
        </p>
      </div>

      <form
        className="surface grid gap-4 p-5 sm:grid-cols-[1fr_auto_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="sname">Service name</Label>
          <Input id="sname" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sdate">Date</Label>
          <Input id="sdate" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <Button type="submit" disabled={create.isPending}>
          Add service
        </Button>
      </form>

      <div className="surface divide-y divide-border">
        {(services ?? []).map((s) => {
          const count = (s.attendance as unknown as Array<{ count: number }>)?.[0]?.count ?? 0;
          const isEditing = editing?.id === s.id;
          return (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              {isEditing ? (
                <form
                  className="flex flex-1 flex-wrap items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    rename.mutate({ id: s.id, name: editing.name, date: editing.date });
                  }}
                >
                  <Input
                    className="max-w-56"
                    value={editing.name}
                    maxLength={80}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    required
                  />
                  <Input
                    className="max-w-44"
                    type="date"
                    value={editing.date}
                    onChange={(e) => setEditing({ ...editing, date: e.target.value })}
                    required
                  />
                  <Button type="submit" size="sm" disabled={rename.isPending}>Save</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                </form>
              ) : (
                <>
                  <div>
                    <p className="font-semibold">{s.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {s.service_date} · {count} recorded
                      {liveOn && s.stream_url && (
                        <> · {(s.watch_sessions as unknown as Array<{ count: number }>)?.[0]?.count ?? 0} watched online</>
                      )}
                    </p>
                    {live?.id === s.id && (
                      <form
                        className="mt-3 flex flex-wrap items-end gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          saveLive.mutate(live);
                        }}
                      >
                        <div className="space-y-1">
                          <Label className="text-xs">Stream link (YouTube, Vimeo, Facebook…)</Label>
                          <Input className="w-72" value={live.url} placeholder="https://youtube.com/live/…" onChange={(e) => setLive({ ...live, url: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Minutes to count as present</Label>
                          <Input className="w-28" type="number" min={1} max={240} value={live.min} onChange={(e) => setLive({ ...live, min: Number(e.target.value) })} />
                        </div>
                        <Button type="submit" size="sm" disabled={saveLive.isPending}>Save</Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setLive(null)}>Cancel</Button>
                      </form>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {liveOn && (
                      <Button
                        variant={s.stream_url ? "default" : "outline"}
                        size="sm"
                        onClick={() => setLive({ id: s.id, url: s.stream_url ?? "", min: s.online_min_minutes })}
                      >
                        <Radio className="size-4" /> {s.stream_url ? "Live on" : "Go live"}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggle.mutate({ id: s.id, is_open: !s.is_open })}
                    >
                      {s.is_open ? (
                        <>
                          <Lock className="size-4" /> Close
                        </>
                      ) : (
                        <>
                          <Unlock className="size-4" /> Reopen
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditing({ id: s.id, name: s.name, date: s.service_date })}
                    >
                      <Pencil className="size-4" /> Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive"
                      disabled={remove.isPending}
                      onClick={() => {
                        const warning = count
                          ? `Delete "${s.name}"? ${count} attendance record${count === 1 ? "" : "s"} for this service will also be removed. This cannot be undone.`
                          : `Delete "${s.name}"? This cannot be undone.`;
                        if (window.confirm(warning)) remove.mutate(s.id);
                      }}
                    >
                      <Trash2 className="size-4" /> Delete
                    </Button>
                  </div>
                </>
              )}
            </div>
          );
        })}
        {(services ?? []).length === 0 && (
          <p className="p-6 text-center text-sm text-muted-foreground">No services yet.</p>
        )}
      </div>
    </div>
  );
}
