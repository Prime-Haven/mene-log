import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  Lock,
  Pencil,
  Radio,
  Trash2,
  Unlock,
  Calendar,
  Sparkles,
  Users,
  Target,
  Plus,
  Play,
  CheckCircle2,
  Tv,
  ExternalLink,
  Flame,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_app/services")({
  head: () => ({
    meta: [
      { title: "Special Programs & Services — Mene:Log" },
      {
        name: "description",
        content: "Default services and special church programs created by administrators.",
      },
      { property: "og:title", content: "Services & Special Programs — Mene:Log" },
      {
        property: "og:description",
        content: "Create special church programs and record attendance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Services,
});

const DEFAULT_SERVICE_NAMES = [
  {
    name: "Sunday Service",
    day: "Every Sunday",
    icon: "☀️",
    color: "from-blue-500/10 to-indigo-500/10 border-blue-500/20",
  },
  {
    name: "Midweek Service",
    day: "Every Wednesday",
    icon: "📖",
    color: "from-emerald-500/10 to-teal-500/10 border-emerald-500/20",
  },
  {
    name: "Prayer Service",
    day: "Every Friday",
    icon: "🙏",
    color: "from-amber-500/10 to-orange-500/10 border-amber-500/20",
  },
];

export function Services() {
  const { tenant, membership, can } = useTenant();
  const navigate = useNavigate();
  const liveOn = can("watch_live");
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<"special" | "regular">("special");
  const [live, setLive] = useState<{ id: string; url: string; min: number } | null>(null);
  const [editing, setEditing] = useState<{
    id: string;
    name: string;
    date: string;
    description?: string;
  } | null>(null);

  // Form for creating a Special Program
  const [progName, setProgName] = useState("");
  const [progDate, setProgDate] = useState(new Date().toISOString().slice(0, 10));
  const [progSpeaker, setProgSpeaker] = useState("");
  const [progDescription, setProgDescription] = useState("");
  const [progTarget, setProgTarget] = useState("");
  const [progStreamUrl, setProgStreamUrl] = useState("");

  const { data: services, isLoading } = useQuery({
    queryKey: ["services", tenant?.id],
    enabled: !!tenant,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select(
          "id, name, service_date, is_open, stream_url, online_min_minutes, attendance(count), watch_sessions(count)",
        )
        .eq("tenant_id", tenant!.id)
        .order("service_date", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  // Ensure 3 default services for this week
  const ensureDefaults = useMutation({
    mutationFn: async () => {
      if (!tenant) return;
      const today = new Date().toISOString().slice(0, 10);
      const defaults = ["Sunday Service", "Midweek Service", "Prayer Service"];

      for (const defName of defaults) {
        // Check if exists for today or recently
        const exists = (services ?? []).some((s) => s.name.toLowerCase() === defName.toLowerCase());
        if (!exists) {
          await supabase.from("services").insert({
            tenant_id: tenant.id,
            branch_id: membership?.branch_id ?? null,
            name: defName,
            service_date: today,
            is_open: true,
          });
        }
      }
    },
    onSuccess: () => {
      toast.success("Default weekly services ready");
      qc.invalidateQueries({ queryKey: ["services"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not create default services"),
  });

  // Quick Launch a single default service for today
  const launchDefaultService = useMutation({
    mutationFn: async (serviceName: string) => {
      if (!tenant) return;
      const today = new Date().toISOString().slice(0, 10);

      // Check if open for today
      const existing = (services ?? []).find(
        (s) => s.name.toLowerCase() === serviceName.toLowerCase() && s.service_date === today,
      );

      if (existing) {
        if (!existing.is_open) {
          await supabase.from("services").update({ is_open: true }).eq("id", existing.id);
        }
        return existing.id;
      }

      const { data, error } = await supabase
        .from("services")
        .insert({
          tenant_id: tenant.id,
          branch_id: membership?.branch_id ?? null,
          name: serviceName,
          service_date: today,
          is_open: true,
        })
        .select("id")
        .single();

      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      toast.success("Service launched for today");
      qc.invalidateQueries({ queryKey: ["services"] });
      navigate({ to: "/attendance" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not launch service"),
  });

  // Create Special Program
  const createSpecialProgram = useMutation({
    mutationFn: async () => {
      if (!progName.trim()) throw new Error("Please enter program title");
      const { error } = await supabase.from("services").insert({
        tenant_id: tenant!.id,
        branch_id: membership?.branch_id ?? null,
        name: progName.trim(),
        service_date: progDate,
        is_open: true,
        stream_url: progStreamUrl.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Special program created and open for attendance!");
      setProgName("");
      setProgSpeaker("");
      setProgDescription("");
      setProgTarget("");
      setProgStreamUrl("");
      qc.invalidateQueries({ queryKey: ["services"] });
      setActiveTab("special");
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not create special program"),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, is_open }: { id: string; is_open: boolean }) => {
      const { error } = await supabase.from("services").update({ is_open }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["services"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update service"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("delete_service", { p_service: id });
      if (error) {
        // direct fallback
        await supabase.from("services").delete().eq("id", id);
      }
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
      if (url && !/^https:\/\/\S+$/i.test(url))
        throw new Error("Stream link must start with https://");
      const { error } = await supabase
        .from("services")
        .update({ stream_url: url || null, online_min_minutes: Math.max(1, Math.min(240, v.min)) })
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Live stream link saved");
      setLive(null);
      qc.invalidateQueries({ queryKey: ["services"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save live stream"),
  });

  // Segregate regular weekly services vs special programs
  const isDefaultName = (n: string) =>
    DEFAULT_SERVICE_NAMES.some((d) => n.toLowerCase().includes(d.name.toLowerCase()));

  const regularServices = (services ?? []).filter((s) => isDefaultName(s.name));
  const specialPrograms = (services ?? []).filter((s) => !isDefaultName(s.name));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-eyebrow">Church Programs</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Services & Special Programs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Default church services (Sunday Service, Midweek Service, Prayer Service) are ready for
            weekly check-ins, while this page lets admins create and record attendance for special
            events and conferences.
          </p>
        </div>
      </div>

      {/* Default Services Cards */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold font-display text-ink flex items-center gap-2">
              <Calendar className="size-4 text-primary" /> Default Weekly Services
            </h2>
            <p className="text-xs text-muted-foreground">
              Standard services for your church. Click to launch today's attendance capture.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="text-xs font-semibold"
            disabled={ensureDefaults.isPending}
            onClick={() => ensureDefaults.mutate()}
          >
            {ensureDefaults.isPending ? "Setting up…" : "Ensure Default Services"}
          </Button>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-3">
          {DEFAULT_SERVICE_NAMES.map((def) => {
            const currentService = regularServices.find((s) =>
              s.name.toLowerCase().includes(def.name.toLowerCase()),
            );
            const isOpen = currentService?.is_open ?? false;
            const attCount = Array.isArray(currentService?.attendance)
              ? ((currentService?.attendance[0] as { count: number } | undefined)?.count ?? 0)
              : 0;

            return (
              <div
                key={def.name}
                className={`surface rounded-2xl border p-4.5 bg-gradient-to-br ${def.color} shadow-sm transition-all hover:border-primary/40`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xl mb-1 block">{def.icon}</span>
                    <h3 className="font-display font-bold text-base text-foreground">{def.name}</h3>
                    <p className="text-xs font-medium text-muted-foreground mt-0.5">{def.day}</p>
                  </div>
                  {currentService && (
                    <Badge
                      variant={isOpen ? "default" : "outline"}
                      className="text-[10px] uppercase font-bold"
                    >
                      {isOpen ? "Open" : "Closed"}
                    </Badge>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between pt-3 border-t border-border/60">
                  <span className="text-xs text-muted-foreground font-semibold">
                    {attCount} recorded
                  </span>
                  <Button
                    size="sm"
                    className="h-8 text-xs font-semibold"
                    disabled={launchDefaultService.isPending}
                    onClick={() => launchDefaultService.mutate(def.name)}
                  >
                    <Play className="size-3 mr-1" /> Open Today
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Special Programs Creation Form */}
      <div className="surface rounded-2xl border border-border/80 p-5 shadow-panel space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold font-display text-ink flex items-center gap-2">
              <Sparkles className="size-4 text-primary" /> Create Special Program
            </h2>
            <p className="text-xs text-muted-foreground">
              Conferences, all-night vigils, crusades, youth rallies, and leadership meetings.
            </p>
          </div>
          <Badge variant="secondary" className="text-xs font-semibold">
            Admin Program
          </Badge>
        </div>

        <form
          className="grid gap-4 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            createSpecialProgram.mutate();
          }}
        >
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="spname" className="text-xs font-semibold">
              Program / Service Name *
            </Label>
            <Input
              id="spname"
              placeholder="e.g. Annual Convention, Youth Camp, Praise Night"
              value={progName}
              onChange={(e) => setProgName(e.target.value)}
              required
              className="h-10 rounded-xl"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="spdate" className="text-xs font-semibold">
              Date *
            </Label>
            <Input
              id="spdate"
              type="date"
              value={progDate}
              onChange={(e) => setProgDate(e.target.value)}
              required
              className="h-10 rounded-xl"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="spstream" className="text-xs font-semibold">
              Stream Link (optional for Watch Live)
            </Label>
            <Input
              id="spstream"
              placeholder="https://youtube.com/live/... or https://facebook.com/..."
              value={progStreamUrl}
              onChange={(e) => setProgStreamUrl(e.target.value)}
              className="h-10 rounded-xl"
            />
          </div>

          <div className="flex items-end">
            <Button
              type="submit"
              disabled={createSpecialProgram.isPending || !progName.trim()}
              className="h-10 w-full rounded-xl font-semibold"
            >
              <Plus className="size-4 mr-1.5" /> Create Program
            </Button>
          </div>
        </form>
      </div>

      {/* Tabs: Special Programs vs Regular Services */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 border-b border-border/70 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab("special")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-bold font-display transition-all ${
              activeTab === "special"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            Special Programs ({specialPrograms.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("regular")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-bold font-display transition-all ${
              activeTab === "regular"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            Regular Services History ({regularServices.length})
          </button>
        </div>

        {/* Special Programs List */}
        {activeTab === "special" && (
          <div className="space-y-3">
            {specialPrograms.length === 0 ? (
              <div className="surface border border-dashed p-10 text-center text-sm text-muted-foreground">
                No special programs created yet. Use the form above to add a conference, crusade, or
                special event.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {specialPrograms.map((p) => {
                  const attCount = Array.isArray(p.attendance)
                    ? ((p.attendance[0] as { count: number } | undefined)?.count ?? 0)
                    : 0;

                  return (
                    <div
                      key={p.id}
                      className="surface rounded-2xl border border-border/80 p-4.5 shadow-sm space-y-3 flex flex-col justify-between"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="inline-flex items-center gap-1 rounded bg-accent/20 px-2 py-0.5 text-[10px] font-bold uppercase text-accent-foreground mb-1">
                              <Sparkles className="size-3" /> Special Program
                            </span>
                            <h3 className="font-display font-bold text-base text-foreground leading-snug">
                              {p.name}
                            </h3>
                            <p className="text-xs text-muted-foreground mt-0.5">{p.service_date}</p>
                          </div>
                          <Badge
                            variant={p.is_open ? "default" : "outline"}
                            className="text-[10px] uppercase"
                          >
                            {p.is_open ? "Open" : "Closed"}
                          </Badge>
                        </div>

                        {p.stream_url && (
                          <div className="flex items-center gap-1.5 text-xs text-primary truncate font-medium">
                            <Radio className="size-3 shrink-0" />
                            <span className="truncate">{p.stream_url}</span>
                          </div>
                        )}
                      </div>

                      <div className="pt-3 border-t border-border/60 flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-foreground">
                          {attCount} Attendees
                        </span>

                        <div className="flex items-center gap-1.5">
                          <Button
                            asChild
                            size="sm"
                            variant="default"
                            className="h-8 text-xs font-semibold"
                          >
                            <Link to="/attendance">Record Attendance</Link>
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            className="size-8 p-0"
                            onClick={() => toggle.mutate({ id: p.id, is_open: !p.is_open })}
                            title={p.is_open ? "Close Service" : "Open Service"}
                          >
                            {p.is_open ? (
                              <Unlock className="size-3.5 text-success" />
                            ) : (
                              <Lock className="size-3.5 text-muted-foreground" />
                            )}
                          </Button>

                          {liveOn && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="size-8 p-0"
                              onClick={() =>
                                setLive({
                                  id: p.id,
                                  url: p.stream_url ?? "",
                                  min: p.online_min_minutes ?? 20,
                                })
                              }
                              title="Set Stream URL"
                            >
                              <Tv className="size-3.5" />
                            </Button>
                          )}

                          <Button
                            size="sm"
                            variant="ghost"
                            className="size-8 p-0 text-destructive hover:bg-destructive/10"
                            onClick={() => {
                              if (confirm(`Delete special program "${p.name}"?`))
                                remove.mutate(p.id);
                            }}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Regular Services History List */}
        {activeTab === "regular" && (
          <div className="surface rounded-2xl border border-border/80 overflow-hidden shadow-panel">
            <ul className="divide-y divide-border/60">
              {regularServices.map((s) => {
                const count = Array.isArray(s.attendance)
                  ? ((s.attendance[0] as { count: number } | undefined)?.count ?? 0)
                  : 0;

                return (
                  <li
                    key={s.id}
                    className="flex items-center justify-between p-4 hover:bg-muted/20 transition-colors"
                  >
                    <div>
                      <p className="font-semibold text-sm text-foreground">{s.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.service_date} · {count} attendees
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant={s.is_open ? "default" : "outline"} className="text-xs">
                        {s.is_open ? "Open" : "Closed"}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggle.mutate({ id: s.id, is_open: !s.is_open })}
                      >
                        {s.is_open ? "Close" : "Re-open"}
                      </Button>
                      <Button asChild size="sm">
                        <Link to="/attendance">Register</Link>
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* Live Stream Dialog */}
      <Dialog open={!!live} onOpenChange={(open) => !open && setLive(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Watch Live Settings</DialogTitle>
            <DialogDescription>
              Link a YouTube or Facebook Live stream. Members watching will be marked present
              automatically.
            </DialogDescription>
          </DialogHeader>

          {live && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveLive.mutate(live);
              }}
              className="space-y-4 py-2"
            >
              <div className="space-y-1.5">
                <Label htmlFor="sturl">Stream URL</Label>
                <Input
                  id="sturl"
                  placeholder="https://youtube.com/watch?v=..."
                  value={live.url}
                  onChange={(e) => setLive({ ...live, url: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="stmin">Minimum Watch Minutes for Attendance</Label>
                <Input
                  id="stmin"
                  type="number"
                  min={1}
                  max={240}
                  value={live.min}
                  onChange={(e) => setLive({ ...live, min: Number(e.target.value) })}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setLive(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saveLive.isPending}>
                  Save Stream
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default Services;
