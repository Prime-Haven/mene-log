import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Sun,
  BookOpen,
  Flame,
  Calendar,
  CalendarDays,
  Users,
  Target,
  Plus,
  Pencil,
  Trash2,
  Lock,
  Unlock,
  Tv,
  Search,
  ArrowUpRight,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
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
      { title: "Church Services & Programs — Mene:Log" },
      {
        name: "description",
        content:
          "Manage weekly church services, Sunday, Midweek, and Prayer attendance, and special church programs.",
      },
      { property: "og:title", content: "Church Services & Programs — Mene:Log" },
      {
        property: "og:description",
        content:
          "Permanent Sunday, Midweek, and Prayer services with full admin controls for custom programs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Services,
});

type ServiceRecord = {
  id: string;
  name: string;
  service_date?: string | null;
  service_type: string;
  theme?: string | null;
  description?: string | null;
  speaker?: string | null;
  target_attendance?: number | null;
  is_open: boolean;
  is_default: boolean;
  stream_url?: string | null;
  online_min_minutes: number;
  created_at: string;
  attendance: { count: number }[];
};

export function Services() {
  const { tenant, membership, can } = useTenant();
  const qc = useQueryClient();
  const liveOn = can("watch_live");

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "special" | "sunday" | "midweek" | "prayer">(
    "all",
  );

  // Create Service Dialog State
  const [createOpen, setCreateOpen] = useState(false);
  const [formCategory, setFormCategory] = useState<"sunday" | "midweek" | "prayer" | "special">(
    "special",
  );
  const [formName, setFormName] = useState("");
  const [formTheme, setFormTheme] = useState("");
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formSpeaker, setFormSpeaker] = useState("");
  const [formTarget, setFormTarget] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formStreamUrl, setFormStreamUrl] = useState("");

  // Edit Service State
  const [editing, setEditing] = useState<ServiceRecord | null>(null);

  // Delete Service State
  const [deleteTarget, setDeleteTarget] = useState<ServiceRecord | null>(null);

  // Live Stream Dialog State
  const [liveDialog, setLiveDialog] = useState<{ id: string; url: string; min: number } | null>(
    null,
  );

  // Fetch all services
  const { data: services = [], isLoading } = useQuery({
    queryKey: ["services", tenant?.id],
    enabled: !!tenant,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select(
          "id, name, service_date, service_type, theme, description, speaker, target_attendance, is_open, is_default, stream_url, online_min_minutes, created_at, attendance(count)",
        )
        .eq("tenant_id", tenant!.id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data as unknown as ServiceRecord[]) ?? [];
    },
  });

  // Consolidate & Ensure Default Services
  const ensureDefaults = useMutation({
    mutationFn: async () => {
      if (!tenant) return;

      const defaults = [
        { name: "Sunday Service", type: "sunday" },
        { name: "Midweek Service", type: "midweek" },
        { name: "Prayer Service", type: "prayer" },
      ];

      for (const def of defaults) {
        const canonical = services.find(
          (s) => s.is_default && (s.service_type === def.type || s.name === def.name),
        );

        if (!canonical) {
          const match = services.find(
            (s) =>
              s.service_type === def.type || s.name.toLowerCase().includes(def.name.toLowerCase()),
          );
          if (match) {
            await supabase
              .from("services")
              .update({
                name: def.name,
                service_type: def.type,
                is_default: true,
                is_open: true,
                theme: null,
              })
              .eq("id", match.id);
          } else {
            await supabase.from("services").insert({
              tenant_id: tenant.id,
              name: def.name,
              service_type: def.type,
              is_default: true,
              is_open: true,
            });
          }
        } else {
          await supabase
            .from("services")
            .update({
              name: def.name,
              service_type: def.type,
              is_default: true,
              is_open: true,
            })
            .eq("id", canonical.id);
        }
      }
    },
    onSuccess: () => {
      toast.success("Default weekly services ready and open");
      qc.invalidateQueries({ queryKey: ["services"] });
      qc.invalidateQueries({ queryKey: ["open-services"] });
      qc.invalidateQueries({ queryKey: ["public-open-services"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not initialize default services"),
  });

  // Create new Custom Service
  const createService = useMutation({
    mutationFn: async () => {
      if (!tenant) throw new Error("Church account unavailable");
      const title = formName.trim();
      if (!title) throw new Error("Please enter a service or program name");

      const targetNum = formTarget.trim() ? parseInt(formTarget.trim(), 10) : null;
      const stream = formStreamUrl.trim() || null;

      const { data, error } = await supabase
        .from("services")
        .insert({
          tenant_id: tenant.id,
          branch_id: membership?.branch_id ?? null,
          name: title,
          service_type: formCategory,
          theme: formTheme.trim() || null,
          service_date: formDate,
          speaker: formSpeaker.trim() || null,
          description: formDescription.trim() || null,
          target_attendance: targetNum && !isNaN(targetNum) ? targetNum : null,
          stream_url: stream,
          is_open: true,
          is_default: false,
        })
        .select("id")
        .single();

      if (error) throw error;
      return data.id;
    },
    onSuccess: () => {
      toast.success("New program created and published to check-in page");
      setCreateOpen(false);
      resetForm();
      qc.invalidateQueries({ queryKey: ["services"] });
      qc.invalidateQueries({ queryKey: ["open-services"] });
      qc.invalidateQueries({ queryKey: ["public-open-services"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create service"),
  });

  // Update Service
  const updateService = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const title = formName.trim();
      if (!title) throw new Error("Service name cannot be empty");

      const targetNum = formTarget.trim() ? parseInt(formTarget.trim(), 10) : null;
      const stream = formStreamUrl.trim() || null;

      const updateData: Record<string, unknown> = {
        name: title,
        speaker: formSpeaker.trim() || null,
        description: formDescription.trim() || null,
        target_attendance: targetNum && !isNaN(targetNum) ? targetNum : null,
        stream_url: stream,
      };

      if (!editing.is_default) {
        updateData.service_date = formDate;
        updateData.theme = formTheme.trim() || null;
        updateData.service_type = formCategory;
      }

      const { error } = await supabase.from("services").update(updateData).eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Service updated");
      setEditing(null);
      resetForm();
      qc.invalidateQueries({ queryKey: ["services"] });
      qc.invalidateQueries({ queryKey: ["open-services"] });
      qc.invalidateQueries({ queryKey: ["public-open-services"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update service"),
  });

  // Toggle Service Open / Closed
  const toggleOpen = useMutation({
    mutationFn: async ({ id, is_open }: { id: string; is_open: boolean }) => {
      const { error } = await supabase.from("services").update({ is_open }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { is_open }) => {
      toast.success(is_open ? "Service opened for check-in" : "Service closed");
      qc.invalidateQueries({ queryKey: ["services"] });
      qc.invalidateQueries({ queryKey: ["open-services"] });
      qc.invalidateQueries({ queryKey: ["public-open-services"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update status"),
  });

  // Delete Service (For admin-created services)
  const deleteService = useMutation({
    mutationFn: async (svc: ServiceRecord) => {
      if (svc.is_default) {
        throw new Error(
          "Default weekly services are permanent and cannot be deleted. You can toggle them closed to stop check-ins.",
        );
      }

      try {
        const { error } = await supabase.rpc("delete_service", { p_service: svc.id });
        if (!error) return;
      } catch {
        // Fallback
      }

      await supabase.from("attendance").delete().eq("service_id", svc.id);
      const { error: delErr } = await supabase.from("services").delete().eq("id", svc.id);
      if (delErr) throw delErr;
    },
    onSuccess: () => {
      toast.success("Service deleted");
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["services"] });
      qc.invalidateQueries({ queryKey: ["open-services"] });
      qc.invalidateQueries({ queryKey: ["public-open-services"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not delete service"),
  });

  // Live Stream Save
  const saveLiveStream = useMutation({
    mutationFn: async (v: { id: string; url: string; min: number }) => {
      const url = v.url.trim();
      if (url && !/^https:\/\/\S+$/i.test(url)) {
        throw new Error("Stream link must start with https://");
      }
      const { error } = await supabase
        .from("services")
        .update({
          stream_url: url || null,
          online_min_minutes: Math.max(1, Math.min(240, v.min)),
        })
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Stream settings saved");
      setLiveDialog(null);
      qc.invalidateQueries({ queryKey: ["services"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save live stream"),
  });

  function resetForm() {
    setFormCategory("special");
    setFormName("");
    setFormTheme("");
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormSpeaker("");
    setFormTarget("");
    setFormDescription("");
    setFormStreamUrl("");
  }

  function openEdit(svc: ServiceRecord) {
    setEditing(svc);
    let cat: "sunday" | "midweek" | "prayer" | "special" = "special";
    const lower = svc.name.toLowerCase();
    if (svc.service_type === "sunday" || lower.includes("sunday")) cat = "sunday";
    else if (svc.service_type === "midweek" || lower.includes("midweek")) cat = "midweek";
    else if (svc.service_type === "prayer" || lower.includes("prayer")) cat = "prayer";

    setFormCategory(cat);
    setFormName(svc.name);
    setFormTheme(svc.theme ?? "");
    setFormDate(svc.service_date ?? new Date().toISOString().slice(0, 10));
    setFormSpeaker(svc.speaker ?? "");
    setFormTarget(svc.target_attendance ? String(svc.target_attendance) : "");
    setFormDescription(svc.description ?? "");
    setFormStreamUrl(svc.stream_url ?? "");
  }

  // Identify canonical default services
  const defaultServices = useMemo(() => {
    const sun = services.find(
      (s) =>
        s.is_default && (s.service_type === "sunday" || s.name.toLowerCase().includes("sunday")),
    );
    const mid = services.find(
      (s) =>
        s.is_default && (s.service_type === "midweek" || s.name.toLowerCase().includes("midweek")),
    );
    const pray = services.find(
      (s) =>
        s.is_default && (s.service_type === "prayer" || s.name.toLowerCase().includes("prayer")),
    );

    return {
      sunday: sun,
      midweek: mid,
      prayer: pray,
    };
  }, [services]);

  // Admin-created custom programs
  const customServices = useMemo(() => {
    return services.filter((s) => !s.is_default);
  }, [services]);

  // Filtered list of custom services
  const filteredCustom = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customServices.filter((s) => {
      if (filterType !== "all") {
        if (filterType === "sunday" && s.service_type !== "sunday") return false;
        if (filterType === "midweek" && s.service_type !== "midweek") return false;
        if (filterType === "prayer" && s.service_type !== "prayer") return false;
        if (
          filterType === "special" &&
          (s.service_type === "sunday" ||
            s.service_type === "midweek" ||
            s.service_type === "prayer")
        )
          return false;
      }
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.theme ?? "").toLowerCase().includes(q) ||
        (s.speaker ?? "").toLowerCase().includes(q) ||
        (s.service_date ?? "").includes(q)
      );
    });
  }, [customServices, search, filterType]);

  const formatAttachedDate = (dateStr?: string | null) => {
    if (!dateStr) return "—";
    const parts = dateStr.split("-").map(Number);
    const d =
      parts.length === 3 ? new Date(parts[0]!, parts[1]! - 1, parts[2]!) : new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-eyebrow">Program Operations</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink font-display">Services</h1>
          <p className="text-sm text-muted-foreground">
            Manage permanent weekly service check-ins and special church programs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => ensureDefaults.mutate()}
            disabled={ensureDefaults.isPending}
            className="text-xs"
            title="Consolidate and check defaults"
          >
            <RefreshCw
              className={`size-3.5 mr-1.5 ${ensureDefaults.isPending ? "animate-spin" : ""}`}
            />
            Ensure Defaults
          </Button>

          <Button
            size="sm"
            onClick={() => {
              resetForm();
              setCreateOpen(true);
            }}
            className="text-xs font-semibold"
          >
            <Plus className="size-4 mr-1.5" /> Create Service
          </Button>
        </div>
      </div>

      {/* 3 Permanent Weekly Services Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Weekly Services
          </h2>
          <span className="text-xs text-muted-foreground font-mono">
            Always ready on public check-in
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {/* Sunday Service Card */}
          <div className="surface p-4 border border-border/80 flex flex-col justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-primary/10 p-1.5 text-primary">
                    <Sun className="size-4" />
                  </div>
                  <h3 className="font-bold text-sm text-ink">Sunday Service</h3>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    defaultServices.sunday &&
                    toggleOpen.mutate({
                      id: defaultServices.sunday.id,
                      is_open: !defaultServices.sunday.is_open,
                    })
                  }
                  className="text-xs font-medium cursor-pointer transition-opacity hover:opacity-80"
                  title="Toggle check-in status"
                >
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                      defaultServices.sunday?.is_open
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-muted-foreground"
                    }`}
                  >
                    <span
                      className={`size-2 rounded-full ${
                        defaultServices.sunday?.is_open
                          ? "bg-emerald-500"
                          : "bg-muted-foreground/40"
                      }`}
                    />
                    {defaultServices.sunday?.is_open ? "Open" : "Closed"}
                  </span>
                </button>
              </div>

              <p className="text-xs text-muted-foreground pt-1">
                Permanent template for all Sunday worship check-ins.
              </p>
            </div>

            <div className="flex items-center justify-between border-t border-border/60 pt-3">
              <div>
                <span className="text-lg font-bold font-mono text-ink">
                  {defaultServices.sunday?.attendance[0]?.count ?? 0}
                </span>
                <span className="text-xs text-muted-foreground ml-1.5">attendees</span>
              </div>

              <div className="flex items-center gap-1">
                {defaultServices.sunday && (
                  <>
                    <Button asChild size="sm" variant="outline" className="h-8 text-xs font-medium">
                      <Link
                        to="/attendance"
                        search={{ serviceId: defaultServices.sunday.id } as Record<string, unknown>}
                      >
                        Register <ArrowUpRight className="size-3 ml-1" />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-foreground"
                      title="Edit"
                      onClick={() => openEdit(defaultServices.sunday!)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Midweek Service Card */}
          <div className="surface p-4 border border-border/80 flex flex-col justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-primary/10 p-1.5 text-primary">
                    <BookOpen className="size-4" />
                  </div>
                  <h3 className="font-bold text-sm text-ink">Midweek Service</h3>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    defaultServices.midweek &&
                    toggleOpen.mutate({
                      id: defaultServices.midweek.id,
                      is_open: !defaultServices.midweek.is_open,
                    })
                  }
                  className="text-xs font-medium cursor-pointer transition-opacity hover:opacity-80"
                  title="Toggle check-in status"
                >
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                      defaultServices.midweek?.is_open
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-muted-foreground"
                    }`}
                  >
                    <span
                      className={`size-2 rounded-full ${
                        defaultServices.midweek?.is_open
                          ? "bg-emerald-500"
                          : "bg-muted-foreground/40"
                      }`}
                    />
                    {defaultServices.midweek?.is_open ? "Open" : "Closed"}
                  </span>
                </button>
              </div>

              <p className="text-xs text-muted-foreground pt-1">
                Permanent template for Bible studies and midweek services.
              </p>
            </div>

            <div className="flex items-center justify-between border-t border-border/60 pt-3">
              <div>
                <span className="text-lg font-bold font-mono text-ink">
                  {defaultServices.midweek?.attendance[0]?.count ?? 0}
                </span>
                <span className="text-xs text-muted-foreground ml-1.5">attendees</span>
              </div>

              <div className="flex items-center gap-1">
                {defaultServices.midweek && (
                  <>
                    <Button asChild size="sm" variant="outline" className="h-8 text-xs font-medium">
                      <Link
                        to="/attendance"
                        search={
                          { serviceId: defaultServices.midweek.id } as Record<string, unknown>
                        }
                      >
                        Register <ArrowUpRight className="size-3 ml-1" />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-foreground"
                      title="Edit"
                      onClick={() => openEdit(defaultServices.midweek!)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Prayer Service Card */}
          <div className="surface p-4 border border-border/80 flex flex-col justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-primary/10 p-1.5 text-primary">
                    <Flame className="size-4" />
                  </div>
                  <h3 className="font-bold text-sm text-ink">Prayer Service</h3>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    defaultServices.prayer &&
                    toggleOpen.mutate({
                      id: defaultServices.prayer.id,
                      is_open: !defaultServices.prayer.is_open,
                    })
                  }
                  className="text-xs font-medium cursor-pointer transition-opacity hover:opacity-80"
                  title="Toggle check-in status"
                >
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                      defaultServices.prayer?.is_open
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-muted-foreground"
                    }`}
                  >
                    <span
                      className={`size-2 rounded-full ${
                        defaultServices.prayer?.is_open
                          ? "bg-emerald-500"
                          : "bg-muted-foreground/40"
                      }`}
                    />
                    {defaultServices.prayer?.is_open ? "Open" : "Closed"}
                  </span>
                </button>
              </div>

              <p className="text-xs text-muted-foreground pt-1">
                Permanent template for prayer meetings, vigils, and intercession.
              </p>
            </div>

            <div className="flex items-center justify-between border-t border-border/60 pt-3">
              <div>
                <span className="text-lg font-bold font-mono text-ink">
                  {defaultServices.prayer?.attendance[0]?.count ?? 0}
                </span>
                <span className="text-xs text-muted-foreground ml-1.5">attendees</span>
              </div>

              <div className="flex items-center gap-1">
                {defaultServices.prayer && (
                  <>
                    <Button asChild size="sm" variant="outline" className="h-8 text-xs font-medium">
                      <Link
                        to="/attendance"
                        search={{ serviceId: defaultServices.prayer.id } as Record<string, unknown>}
                      >
                        Register <ArrowUpRight className="size-3 ml-1" />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-foreground"
                      title="Edit"
                      onClick={() => openEdit(defaultServices.prayer!)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Special & Custom Programs Section */}
      <div className="space-y-4 pt-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-ink">Special Programs & Events</h2>
            <p className="text-xs text-muted-foreground">
              Programs created with attached dates. These appear in the check-in form and can be
              edited or deleted.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search programs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-48 sm:w-64 pl-8 text-xs"
              />
            </div>

            <div className="flex rounded-lg border border-border/80 bg-muted/40 p-0.5">
              {(
                [
                  { id: "all", label: "All" },
                  { id: "special", label: "Special" },
                  { id: "sunday", label: "Sunday" },
                  { id: "midweek", label: "Midweek" },
                  { id: "prayer", label: "Prayer" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterType(tab.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    filterType === tab.id
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Programs Table */}
        <div className="surface overflow-x-auto border border-border/80">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/20">
              <tr className="text-left text-xs font-semibold text-muted-foreground">
                <th className="px-4 py-3">Program Name</th>
                <th className="px-4 py-3">Attached Date</th>
                <th className="px-4 py-3">Speaker / Minister</th>
                <th className="px-4 py-3">Attendance</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground">
                    Loading programs…
                  </td>
                </tr>
              ) : filteredCustom.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <Calendar className="mx-auto size-7 text-muted-foreground/40 mb-2" />
                    <p className="text-xs font-medium text-ink">No special programs found</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Create an event, convention, or themed program with an attached date.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3 text-xs"
                      onClick={() => {
                        resetForm();
                        setCreateOpen(true);
                      }}
                    >
                      <Plus className="size-3.5 mr-1" /> Create Program
                    </Button>
                  </td>
                </tr>
              ) : (
                filteredCustom.map((s) => {
                  const attendees = s.attendance[0]?.count ?? 0;
                  const hasTarget = s.target_attendance && s.target_attendance > 0;
                  return (
                    <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-ink">{s.name}</div>
                        {s.theme && (
                          <div className="text-xs text-primary font-medium mt-0.5">"{s.theme}"</div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {formatAttachedDate(s.service_date)}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-ink">{s.speaker || "—"}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 font-mono text-xs">
                          <span className="font-bold text-ink">{attendees}</span>
                          {hasTarget && (
                            <span className="text-muted-foreground">/ {s.target_attendance}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <button
                          type="button"
                          onClick={() => toggleOpen.mutate({ id: s.id, is_open: !s.is_open })}
                          className="inline-flex items-center gap-1.5 text-xs font-medium hover:opacity-80"
                          title="Toggle check-in status"
                        >
                          <span
                            className={`size-2 rounded-full ${
                              s.is_open ? "bg-emerald-500" : "bg-muted-foreground/40"
                            }`}
                          />
                          <span
                            className={
                              s.is_open
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-muted-foreground"
                            }
                          >
                            {s.is_open ? "Open" : "Closed"}
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            asChild
                            size="sm"
                            variant="ghost"
                            className="h-8 text-xs font-medium"
                          >
                            <Link
                              to="/attendance"
                              search={{ serviceId: s.id } as Record<string, unknown>}
                            >
                              Register <ArrowUpRight className="size-3 ml-1" />
                            </Link>
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-foreground"
                            title="Edit"
                            onClick={() => openEdit(s)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>

                          {liveOn && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-muted-foreground hover:text-foreground"
                              title="Stream link"
                              onClick={() =>
                                setLiveDialog({
                                  id: s.id,
                                  url: s.stream_url ?? "",
                                  min: s.online_min_minutes ?? 20,
                                })
                              }
                            >
                              <Tv className="size-3.5" />
                            </Button>
                          )}

                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive hover:bg-destructive/10"
                            title="Delete Program"
                            onClick={() => setDeleteTarget(s)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Modal */}
      <Dialog
        open={createOpen || !!editing}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false);
            setEditing(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display font-bold text-lg">
              {editing
                ? editing.is_default
                  ? `Edit ${editing.name}`
                  : "Edit Program"
                : "Create Program"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? editing.is_default
                  ? "Update details, speaker, or target for this default weekly template."
                  : "Update date, name, or speaker for this program."
                : "Create a special program with an attached date for your church check-in."}
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (editing) updateService.mutate();
              else createService.mutate();
            }}
            className="space-y-4 pt-2"
          >
            {/* Category selection */}
            {(!editing || !editing.is_default) && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Category</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: "special", label: "Special Event" },
                    { id: "sunday", label: "Sunday Themed" },
                    { id: "midweek", label: "Midweek Special" },
                    { id: "prayer", label: "Prayer Vigil" },
                  ].map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        setFormCategory(c.id as "sunday" | "midweek" | "prayer" | "special")
                      }
                      className={`rounded-lg border p-2 text-center text-xs font-medium transition-all ${
                        formCategory === c.id
                          ? "border-primary bg-primary/10 text-primary font-semibold"
                          : "border-border/80 bg-muted/20 text-muted-foreground hover:bg-muted/40"
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Service Name */}
            <div className="space-y-1.5">
              <Label htmlFor="srv-name" className="text-xs font-semibold">
                Program Name *
              </Label>
              <Input
                id="srv-name"
                required
                disabled={editing?.is_default}
                placeholder="e.g. Miracle Night Vigil, Youth Convention, Harvest Sunday"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="h-10 rounded-xl"
              />
            </div>

            {/* Attached Date (Only for non-default services) */}
            {(!editing || !editing.is_default) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="srv-date" className="text-xs font-semibold">
                    Attached Date *
                  </Label>
                  <Input
                    id="srv-date"
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="h-10 rounded-xl font-mono text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="srv-theme" className="text-xs font-semibold">
                    Theme / Subtitle (optional)
                  </Label>
                  <Input
                    id="srv-theme"
                    placeholder="e.g. Divine Acceleration"
                    value={formTheme}
                    onChange={(e) => setFormTheme(e.target.value)}
                    className="h-10 rounded-xl"
                  />
                </div>
              </div>
            )}

            {/* Speaker & Target */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="srv-speaker" className="text-xs font-semibold">
                  Minister / Speaker (optional)
                </Label>
                <Input
                  id="srv-speaker"
                  placeholder="e.g. Pastor Paul"
                  value={formSpeaker}
                  onChange={(e) => setFormSpeaker(e.target.value)}
                  className="h-10 rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="srv-target" className="text-xs font-semibold">
                  Target Attendance (optional)
                </Label>
                <Input
                  id="srv-target"
                  type="number"
                  min={1}
                  placeholder="e.g. 250"
                  value={formTarget}
                  onChange={(e) => setFormTarget(e.target.value)}
                  className="h-10 rounded-xl font-mono text-sm"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="srv-desc" className="text-xs font-semibold">
                Notes / Description (optional)
              </Label>
              <Textarea
                id="srv-desc"
                rows={2}
                placeholder="Order of service or notes for ushers…"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                className="rounded-xl"
              />
            </div>

            {/* Stream Link */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="srv-stream" className="text-xs font-semibold">
                  Live Stream URL (optional)
                </Label>
                {!liveOn && (
                  <span className="text-[10px] text-muted-foreground">Standard/Premium tier</span>
                )}
              </div>
              <Input
                id="srv-stream"
                type="url"
                placeholder="https://youtube.com/live/..."
                value={formStreamUrl}
                onChange={(e) => setFormStreamUrl(e.target.value)}
                className="h-10 rounded-xl font-mono text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCreateOpen(false);
                  setEditing(null);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createService.isPending || updateService.isPending}
                className="font-semibold"
              >
                {editing ? "Save Changes" : "Create Program"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Program Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display font-bold text-lg flex items-center gap-2">
              {deleteTarget?.is_default ? (
                <>
                  <ShieldCheck className="size-5 text-primary" /> Permanent Default Service
                </>
              ) : (
                <>
                  <Trash2 className="size-5 text-destructive" /> Delete Program
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {deleteTarget?.is_default ? (
                <span>
                  <strong>"{deleteTarget.name}"</strong> is a permanent church default template. It
                  cannot be deleted so member check-in stays reliable. You can toggle it to{" "}
                  <strong>Closed</strong> to stop check-ins.
                </span>
              ) : (
                <span>
                  Are you sure you want to delete <strong>"{deleteTarget?.name}"</strong> (
                  {formatAttachedDate(deleteTarget?.service_date)})?
                  <br />
                  <br />
                  This will remove the program and its attendance records. Member profiles remain
                  safe.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {deleteTarget?.is_default ? "Close" : "Cancel"}
            </Button>
            {deleteTarget?.is_default ? (
              <Button
                variant="secondary"
                onClick={() => {
                  if (deleteTarget) {
                    toggleOpen.mutate({ id: deleteTarget.id, is_open: false });
                    setDeleteTarget(null);
                  }
                }}
              >
                <Lock className="size-3.5 mr-1.5" /> Close Service
              </Button>
            ) : (
              <Button
                variant="destructive"
                disabled={deleteService.isPending}
                onClick={() => deleteTarget && deleteService.mutate(deleteTarget)}
              >
                Delete Program
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Live Stream Configuration Dialog */}
      <Dialog open={!!liveDialog} onOpenChange={(open) => !open && setLiveDialog(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display font-bold text-lg flex items-center gap-2">
              <Tv className="size-5 text-primary" /> Watch Live Stream
            </DialogTitle>
            <DialogDescription>
              Link a YouTube or Facebook Live stream for this service.
            </DialogDescription>
          </DialogHeader>

          {liveDialog && (
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Stream Link (HTTPS)</Label>
                <Input
                  value={liveDialog.url}
                  onChange={(e) => setLiveDialog({ ...liveDialog, url: e.target.value })}
                  placeholder="https://youtube.com/watch?v=..."
                  className="h-10 rounded-xl font-mono text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Minimum Watch Time (Minutes)</Label>
                <Input
                  type="number"
                  min={1}
                  max={240}
                  value={liveDialog.min}
                  onChange={(e) =>
                    setLiveDialog({ ...liveDialog, min: parseInt(e.target.value, 10) || 20 })
                  }
                  className="h-10 rounded-xl font-mono text-sm"
                />
              </div>

              <DialogFooter className="pt-2">
                <Button variant="outline" onClick={() => setLiveDialog(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => liveDialog && saveLiveStream.mutate(liveDialog)}
                  disabled={saveLiveStream.isPending}
                >
                  Save Stream
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
