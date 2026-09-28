import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Calendar,
  Sparkles,
  Users,
  Target,
  Plus,
  Play,
  CheckCircle2,
  Tv,
  Pencil,
  Trash2,
  Lock,
  Unlock,
  ExternalLink,
  ChevronRight,
  Filter,
  BarChart3,
  CalendarDays,
  ShieldCheck,
  Flame,
  Info,
  Clock,
  ArrowUpRight,
  RefreshCw,
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
      { title: "Church Services & Attendance Tracking — Mene:Log" },
      {
        name: "description",
        content:
          "Track Sunday, Midweek, and Prayer attendance, and manage special church programs.",
      },
      { property: "og:title", content: "Church Services & Attendance Tracking — Mene:Log" },
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

type ServiceCategoryTab = "sunday" | "midweek" | "prayer" | "special" | "all";

export function Services() {
  const { tenant, membership, can } = useTenant();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const liveOn = can("watch_live");

  const [activeTab, setActiveTab] = useState<ServiceCategoryTab>("sunday");

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

  // Fetch all services with attendance counts
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

  // Consolidate & Reset to Clean Defaults (Sunday, Midweek, Prayer - No dates attached!)
  const resetToCleanDefaults = useMutation({
    mutationFn: async () => {
      if (!tenant) return;

      // 1. Check existing services
      const defaults = [
        { name: "Sunday Service", type: "sunday" },
        { name: "Midweek Service", type: "midweek" },
        { name: "Prayer Service", type: "prayer" },
      ];

      for (const def of defaults) {
        // Find if canonical default exists
        const canonical = services.find(
          (s) => s.is_default && (s.service_type === def.type || s.name === def.name),
        );

        if (!canonical) {
          // Check if any matching service exists to designate as canonical default
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
          // Ensure clean canonical name and open status
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

      // Remove any duplicate default instances created earlier
      const canonicalIds = new Set<string>();
      for (const def of defaults) {
        const found = (services ?? []).find(
          (s) => s.is_default && (s.service_type === def.type || s.name === def.name),
        );
        if (found) canonicalIds.add(found.id);
      }

      // Delete old duplicate non-canonical services with "Sunday Service", "Midweek Service", "Prayer Service"
      const duplicatesToDelete = services.filter((s) => {
        if (canonicalIds.has(s.id)) return false;
        const lower = s.name.toLowerCase();
        return (
          lower === "sunday service" ||
          lower === "midweek service" ||
          lower === "prayer service" ||
          lower.startsWith("sunday service") ||
          lower.startsWith("midweek service") ||
          lower.startsWith("prayer service")
        );
      });

      for (const dup of duplicatesToDelete) {
        await supabase.from("attendance").delete().eq("service_id", dup.id);
        await supabase.from("services").delete().eq("id", dup.id);
      }
    },
    onSuccess: () => {
      toast.success("Defaults consolidated: Sunday, Midweek, and Prayer services active");
      qc.invalidateQueries({ queryKey: ["services"] });
      qc.invalidateQueries({ queryKey: ["open-services"] });
      qc.invalidateQueries({ queryKey: ["public-open-services"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not reset default services"),
  });

  // Create new Custom / Special Service (HAS DATE ATTACHED!)
  const createCustomService = useMutation({
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
          service_date: formDate, // Only newly created services have dates attached!
          speaker: formSpeaker.trim() || null,
          description: formDescription.trim() || null,
          target_attendance: targetNum && !isNaN(targetNum) ? targetNum : null,
          stream_url: stream,
          is_open: true,
          is_default: false, // Custom services are not default templates and can be deleted
        })
        .select("id")
        .single();

      if (error) throw error;
      return data.id;
    },
    onSuccess: () => {
      toast.success("New service created and ready on check-in page!");
      setCreateOpen(false);
      resetForm();
      qc.invalidateQueries({ queryKey: ["services"] });
      qc.invalidateQueries({ queryKey: ["open-services"] });
      qc.invalidateQueries({ queryKey: ["public-open-services"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create service"),
  });

  // Update existing Service
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

      // Only custom services update date & theme
      if (!editing.is_default) {
        updateData.service_date = formDate;
        updateData.theme = formTheme.trim() || null;
        updateData.service_type = formCategory;
      }

      const { error } = await supabase.from("services").update(updateData).eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Service details updated");
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
      toast.success(is_open ? "Service opened for check-in" : "Service closed for check-in");
      qc.invalidateQueries({ queryKey: ["services"] });
      qc.invalidateQueries({ queryKey: ["open-services"] });
      qc.invalidateQueries({ queryKey: ["public-open-services"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update status"),
  });

  // Delete Service (Only for newly created services! Default templates protected)
  const deleteService = useMutation({
    mutationFn: async (svc: ServiceRecord) => {
      if (svc.is_default) {
        throw new Error(
          "Default services (Sunday Service, Midweek Service, Prayer Service) are permanent templates and cannot be deleted. You can toggle them Closed to disable check-in.",
        );
      }

      // Try RPC first
      try {
        const { error } = await supabase.rpc("delete_service", { p_service: svc.id });
        if (!error) return;
      } catch {
        // Direct cascade fallback
      }

      await supabase.from("attendance").delete().eq("service_id", svc.id);
      const { error } = await supabase.from("services").delete().eq("id", svc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Service deleted successfully");
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
      toast.success("Live stream settings saved");
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

  // Segregate default templates from admin-created services
  const defaultServices = useMemo(() => {
    // 3 canonical defaults: Sunday, Midweek, Prayer
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

  // Admin-created custom services (all non-defaults)
  const customServices = useMemo(() => {
    return services.filter((s) => !s.is_default);
  }, [services]);

  // Tab categorization
  const currentTabServices = useMemo(() => {
    if (activeTab === "sunday") {
      const items: ServiceRecord[] = [];
      if (defaultServices.sunday) items.push(defaultServices.sunday);
      items.push(
        ...customServices.filter(
          (s) => s.service_type === "sunday" || s.name.toLowerCase().includes("sunday"),
        ),
      );
      return items;
    }
    if (activeTab === "midweek") {
      const items: ServiceRecord[] = [];
      if (defaultServices.midweek) items.push(defaultServices.midweek);
      items.push(
        ...customServices.filter(
          (s) => s.service_type === "midweek" || s.name.toLowerCase().includes("midweek"),
        ),
      );
      return items;
    }
    if (activeTab === "prayer") {
      const items: ServiceRecord[] = [];
      if (defaultServices.prayer) items.push(defaultServices.prayer);
      items.push(
        ...customServices.filter(
          (s) => s.service_type === "prayer" || s.name.toLowerCase().includes("prayer"),
        ),
      );
      return items;
    }
    if (activeTab === "special") {
      return customServices.filter(
        (s) =>
          s.service_type !== "sunday" &&
          s.service_type !== "midweek" &&
          s.service_type !== "prayer" &&
          !s.name.toLowerCase().includes("sunday") &&
          !s.name.toLowerCase().includes("midweek") &&
          !s.name.toLowerCase().includes("prayer"),
      );
    }
    // "all"
    return services;
  }, [activeTab, defaultServices, customServices, services]);

  // Metrics for attendance
  const metrics = useMemo(() => {
    const sunAttendees =
      (defaultServices.sunday?.attendance[0]?.count ?? 0) +
      customServices
        .filter((s) => s.service_type === "sunday" || s.name.toLowerCase().includes("sunday"))
        .reduce((sum, s) => sum + (s.attendance[0]?.count ?? 0), 0);

    const midAttendees =
      (defaultServices.midweek?.attendance[0]?.count ?? 0) +
      customServices
        .filter((s) => s.service_type === "midweek" || s.name.toLowerCase().includes("midweek"))
        .reduce((sum, s) => sum + (s.attendance[0]?.count ?? 0), 0);

    const prayAttendees =
      (defaultServices.prayer?.attendance[0]?.count ?? 0) +
      customServices
        .filter((s) => s.service_type === "prayer" || s.name.toLowerCase().includes("prayer"))
        .reduce((sum, s) => sum + (s.attendance[0]?.count ?? 0), 0);

    const specialAttendees = customServices
      .filter(
        (s) =>
          s.service_type !== "sunday" &&
          s.service_type !== "midweek" &&
          s.service_type !== "prayer" &&
          !s.name.toLowerCase().includes("sunday") &&
          !s.name.toLowerCase().includes("midweek") &&
          !s.name.toLowerCase().includes("prayer"),
      )
      .reduce((sum, s) => sum + (s.attendance[0]?.count ?? 0), 0);

    return {
      sunday: sunAttendees,
      midweek: midAttendees,
      prayer: prayAttendees,
      special: specialAttendees,
      total: sunAttendees + midAttendees + prayAttendees + specialAttendees,
    };
  }, [defaultServices, customServices]);

  // Helper to format attached date for admin-created services
  const formatAttachedDate = (dateStr?: string | null) => {
    if (!dateStr) return null;
    const parts = dateStr.split("-").map(Number);
    const d =
      parts.length === 3 ? new Date(parts[0]!, parts[1]! - 1, parts[2]!) : new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
    const full = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return `${weekday}, ${full}`;
  };

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-eyebrow">Church Programs</span>
            <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider">
              {tenant?.tier.toUpperCase()} TIER
            </Badge>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink font-display">
            Services & Attendance Tracking
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
            <strong>Sunday Service</strong>, <strong>Midweek Service</strong>, and{" "}
            <strong>Prayer Service</strong> are permanent defaults ready on the check-in form.
            Create special or themed programs with specific dates that you can edit and delete at
            any time.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => resetToCleanDefaults.mutate()}
            disabled={resetToCleanDefaults.isPending}
            className="text-xs font-semibold"
            title="Consolidate services into Sunday, Midweek, and Prayer defaults"
          >
            <RefreshCw
              className={`size-3.5 mr-1.5 ${resetToCleanDefaults.isPending ? "animate-spin" : ""}`}
            />
            Ensure Defaults
          </Button>

          <Button
            size="sm"
            onClick={() => {
              resetForm();
              setFormCategory(activeTab === "all" ? "special" : activeTab);
              setCreateOpen(true);
            }}
            className="text-xs font-semibold shadow-sm"
          >
            <Plus className="size-4 mr-1.5" /> Create New Service
          </Button>
        </div>
      </div>

      {/* Hero Metric Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Sunday Service Metric */}
        <div
          onClick={() => setActiveTab("sunday")}
          className={`cursor-pointer rounded-2xl border p-4 transition-all hover:shadow-panel ${
            activeTab === "sunday"
              ? "border-primary bg-primary/[0.04] ring-1 ring-primary/30"
              : "border-border/80 bg-card/60"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Sunday Service
            </span>
            <span className="text-lg">☀️</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-ink">{metrics.sunday}</span>
            <span className="text-xs text-muted-foreground">attendees recorded</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Default permanent template</p>
        </div>

        {/* Midweek Service Metric */}
        <div
          onClick={() => setActiveTab("midweek")}
          className={`cursor-pointer rounded-2xl border p-4 transition-all hover:shadow-panel ${
            activeTab === "midweek"
              ? "border-primary bg-primary/[0.04] ring-1 ring-primary/30"
              : "border-border/80 bg-card/60"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Midweek Service
            </span>
            <span className="text-lg">📖</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-ink">{metrics.midweek}</span>
            <span className="text-xs text-muted-foreground">attendees recorded</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Default permanent template</p>
        </div>

        {/* Prayer Service Metric */}
        <div
          onClick={() => setActiveTab("prayer")}
          className={`cursor-pointer rounded-2xl border p-4 transition-all hover:shadow-panel ${
            activeTab === "prayer"
              ? "border-primary bg-primary/[0.04] ring-1 ring-primary/30"
              : "border-border/80 bg-card/60"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Prayer Service
            </span>
            <span className="text-lg">🙏</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-ink">{metrics.prayer}</span>
            <span className="text-xs text-muted-foreground">attendees recorded</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Default permanent template</p>
        </div>

        {/* Special Programs Metric */}
        <div
          onClick={() => setActiveTab("special")}
          className={`cursor-pointer rounded-2xl border p-4 transition-all hover:shadow-panel ${
            activeTab === "special"
              ? "border-primary bg-primary/[0.04] ring-1 ring-primary/30"
              : "border-border/80 bg-card/60"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Special Programs
            </span>
            <span className="text-lg">✨</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-ink">{metrics.special}</span>
            <span className="text-xs text-muted-foreground">attendees recorded</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Admin created with specific dates</p>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border/80 pb-3">
          {[
            { id: "sunday", label: "Sunday Services", icon: "☀️" },
            { id: "midweek", label: "Midweek Services", icon: "📖" },
            { id: "prayer", label: "Prayer Services", icon: "🙏" },
            { id: "special", label: "Special & Themed Programs", icon: "✨" },
            { id: "all", label: "All Services", icon: "📋" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as ServiceCategoryTab)}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-ink"
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Service Cards List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-24 rounded-2xl border border-border/60 bg-muted/20 animate-pulse"
              />
            ))}
          </div>
        ) : currentTabServices.length === 0 ? (
          <div className="surface border border-dashed p-10 text-center space-y-3">
            <Calendar className="mx-auto size-8 text-muted-foreground/60" />
            <p className="text-sm font-semibold text-ink">No services found in this category.</p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Click below to create a new service or initialize default templates.
            </p>
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                size="sm"
                onClick={() => {
                  setFormCategory(activeTab === "all" ? "special" : activeTab);
                  setCreateOpen(true);
                }}
                className="text-xs font-semibold"
              >
                <Plus className="size-4 mr-1.5" /> Create Service
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            {currentTabServices.map((s) => {
              const isDefault = s.is_default;
              const attachedDateStr = !isDefault ? formatAttachedDate(s.service_date) : null;
              const attendees = s.attendance[0]?.count ?? 0;
              const hasTarget = s.target_attendance && s.target_attendance > 0;
              const targetPct = hasTarget
                ? Math.min(100, Math.round((attendees / s.target_attendance!) * 100))
                : 0;

              return (
                <div
                  key={s.id}
                  className={`surface flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5 transition-all hover:border-primary/40 hover:shadow-panel ${
                    isDefault ? "border-l-4 border-l-primary" : ""
                  }`}
                >
                  {/* Left: Info */}
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-base text-ink tracking-tight truncate">
                        {s.name}
                      </h3>

                      {/* Attached Date badge for admin-created services ONLY */}
                      {attachedDateStr && (
                        <Badge
                          variant="secondary"
                          className="bg-primary/10 text-primary border-primary/20 text-xs font-semibold flex items-center gap-1"
                        >
                          <Calendar className="size-3" /> {attachedDateStr}
                        </Badge>
                      )}

                      {/* Theme badge if present */}
                      {s.theme && (
                        <Badge variant="outline" className="text-xs font-semibold text-primary">
                          "{s.theme}"
                        </Badge>
                      )}

                      {/* Permanent Default Badge */}
                      {isDefault ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground"
                        >
                          Permanent Default
                        </Badge>
                      ) : null}

                      {/* Open / Closed Status */}
                      <Badge
                        variant={s.is_open ? "default" : "outline"}
                        className={`text-[10px] uppercase font-bold ${
                          s.is_open ? "bg-emerald-600 hover:bg-emerald-600" : ""
                        }`}
                      >
                        {s.is_open ? "Open for Check-in" : "Closed"}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {isDefault ? (
                        <span className="text-muted-foreground">
                          Available anytime on public check-in
                        </span>
                      ) : null}
                      {s.speaker && (
                        <span>
                          Speaker: <strong className="text-ink">{s.speaker}</strong>
                        </span>
                      )}
                      {s.description && <span className="truncate max-w-sm">{s.description}</span>}
                    </div>

                    {/* Target attendance progress if set */}
                    {hasTarget && (
                      <div className="mt-2 pt-2 max-w-sm">
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Target className="size-3" /> Target: {s.target_attendance}
                          </span>
                          <span className="font-mono font-bold text-ink">{targetPct}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all duration-500"
                            style={{ width: `${targetPct}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right: Metrics & Actions */}
                  <div className="flex flex-wrap items-center gap-3 shrink-0 self-end sm:self-center">
                    {/* Attendee Counter Box */}
                    <div className="text-right px-3 py-1.5 rounded-xl bg-muted/40 border border-border/60">
                      <div className="flex items-center gap-1.5 justify-end">
                        <Users className="size-3.5 text-primary" />
                        <span className="text-lg font-bold font-mono text-ink">{attendees}</span>
                      </div>
                      <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                        Attendees
                      </span>
                    </div>

                    {/* Actions Group */}
                    <div className="flex items-center gap-1.5">
                      {/* Register Button */}
                      <Button asChild size="sm" className="text-xs font-semibold h-9 shadow-sm">
                        <Link
                          to="/attendance"
                          search={{ serviceId: s.id } as Record<string, unknown>}
                        >
                          Register <ArrowUpRight className="size-3.5 ml-1" />
                        </Link>
                      </Button>

                      {/* Toggle Open/Closed */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        title={s.is_open ? "Close Service" : "Open Service"}
                        onClick={() => toggleOpen.mutate({ id: s.id, is_open: !s.is_open })}
                        disabled={toggleOpen.isPending}
                      >
                        {s.is_open ? (
                          <Unlock className="size-4 text-emerald-600" />
                        ) : (
                          <Lock className="size-4 text-muted-foreground" />
                        )}
                      </Button>

                      {/* Edit Service */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground hover:text-foreground"
                        title="Edit Service Details"
                        onClick={() => openEdit(s)}
                      >
                        <Pencil className="size-4" />
                      </Button>

                      {/* Stream link */}
                      {liveOn && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-muted-foreground hover:text-foreground"
                          title="Stream link"
                          onClick={() =>
                            setLiveDialog({
                              id: s.id,
                              url: s.stream_url ?? "",
                              min: s.online_min_minutes ?? 20,
                            })
                          }
                        >
                          <Tv className="size-4" />
                        </Button>
                      )}

                      {/* Delete Service:
                          Only newly created services can be deleted!
                          Default templates show a disabled/protected state. */}
                      {isDefault ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-muted-foreground/30 hover:text-muted-foreground"
                          title="Default templates are permanent and cannot be deleted"
                          onClick={() => setDeleteTarget(s)}
                        >
                          <ShieldCheck className="size-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-destructive hover:bg-destructive/10"
                          title="Delete Service"
                          onClick={() => setDeleteTarget(s)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Service Modal (Admin creates new service with specific date) */}
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
                  : "Edit Service"
                : "Create New Service"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? editing.is_default
                  ? "Update minister, stream link, or target attendance for this default template."
                  : "Update date, name, speaker, or details for this service."
                : "Create a special service day or themed program. It will appear on your check-in page with its attached date."}
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (editing) updateService.mutate();
              else createCustomService.mutate();
            }}
            className="space-y-4 pt-2"
          >
            {/* Category selection (only when creating new service or editing custom service) */}
            {(!editing || !editing.is_default) && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Service Category</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: "sunday", label: "Sunday Themed", icon: "☀️" },
                    { id: "midweek", label: "Midweek Special", icon: "📖" },
                    { id: "prayer", label: "Prayer Vigil", icon: "🙏" },
                    { id: "special", label: "Special Program", icon: "✨" },
                  ].map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        setFormCategory(c.id as "sunday" | "midweek" | "prayer" | "special")
                      }
                      className={`rounded-xl border p-2.5 text-center text-xs font-semibold transition-all ${
                        formCategory === c.id
                          ? "border-primary bg-primary/10 text-primary shadow-sm"
                          : "border-border/80 bg-muted/20 text-muted-foreground hover:bg-muted/50"
                      }`}
                    >
                      <div className="text-base mb-0.5">{c.icon}</div>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Service Name */}
            <div className="space-y-1.5">
              <Label htmlFor="srv-name" className="text-xs font-semibold">
                Service / Program Name *
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

            {/* Date attached (Only for newly created or custom services! NOT for default templates) */}
            {(!editing || !editing.is_default) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="srv-date" className="text-xs font-semibold">
                    Service Date *
                  </Label>
                  <Input
                    id="srv-date"
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="h-10 rounded-xl font-mono text-sm"
                  />
                  {formDate && (
                    <p className="text-[11px] text-muted-foreground">
                      Attached date:{" "}
                      <strong className="text-ink">{formatAttachedDate(formDate)}</strong>
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="srv-theme" className="text-xs font-semibold">
                    Theme / Subtitle (optional)
                  </Label>
                  <Input
                    id="srv-theme"
                    placeholder="e.g. Divine Speed, Night of Power"
                    value={formTheme}
                    onChange={(e) => setFormTheme(e.target.value)}
                    className="h-10 rounded-xl"
                  />
                </div>
              </div>
            )}

            {/* Target and Speaker */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="srv-speaker" className="text-xs font-semibold">
                  Minister / Speaker (optional)
                </Label>
                <Input
                  id="srv-speaker"
                  placeholder="e.g. Pastor Paul, Guest Minister"
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
                  placeholder="e.g. 200"
                  value={formTarget}
                  onChange={(e) => setFormTarget(e.target.value)}
                  className="h-10 rounded-xl font-mono text-sm"
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="srv-desc" className="text-xs font-semibold">
                Description / Notes (optional)
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

            {/* Stream URL */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="srv-stream" className="text-xs font-semibold">
                  Watch Live Stream Link (optional)
                </Label>
                {!liveOn && (
                  <span className="text-[10px] text-amber-600 font-semibold">
                    (Standard/Premium feature)
                  </span>
                )}
              </div>
              <Input
                id="srv-stream"
                type="url"
                placeholder="https://youtube.com/live/... or https://facebook.com/..."
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
                disabled={createCustomService.isPending || updateService.isPending}
                className="font-semibold"
              >
                {editing ? "Save Changes" : "Create Service"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete / Safeguard Confirmation Dialog */}
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
                  <Trash2 className="size-5 text-destructive" /> Delete Service
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {deleteTarget?.is_default ? (
                <span>
                  <strong>"{deleteTarget.name}"</strong> is a permanent church default template.
                  Default services cannot be deleted so member check-in and QR codes remain
                  reliable.
                  <br />
                  <br />
                  If you want to temporarily disable check-ins, you can toggle it to{" "}
                  <strong>Closed</strong>.
                </span>
              ) : (
                <span>
                  Are you sure you want to delete the service{" "}
                  <strong>"{deleteTarget?.name}"</strong> ({deleteTarget?.service_date})?
                  <br />
                  <br />
                  This will remove the service and its attendance records. Member profiles remain
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
                <Lock className="size-3.5 mr-1.5" /> Close Service Instead
              </Button>
            ) : (
              <Button
                variant="destructive"
                disabled={deleteService.isPending}
                onClick={() => deleteTarget && deleteService.mutate(deleteTarget)}
              >
                Delete Service
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
                <Label className="text-xs font-semibold">
                  Minimum Watch Time to Count Attendance
                </Label>
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
                <span className="text-[11px] text-muted-foreground">Minutes</span>
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
