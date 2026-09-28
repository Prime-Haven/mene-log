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
          "Track Sunday, Midweek, and Prayer attendance by date or period, and manage special church programs.",
      },
      { property: "og:title", content: "Church Services & Attendance Tracking — Mene:Log" },
      {
        property: "og:description",
        content: "Manage weekly church services, special programs, and track attendance by period.",
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
  service_date: string;
  service_type: string;
  theme?: string | null;
  description?: string | null;
  speaker?: string | null;
  target_attendance?: number | null;
  is_open: boolean;
  is_default: boolean;
  stream_url?: string | null;
  online_min_minutes: number;
  attendance: { count: number }[];
  watch_sessions: { count: number }[];
};

type ServiceCategoryTab = "all" | "sunday" | "midweek" | "prayer" | "special";
type PeriodFilter = "all" | "this_week" | "this_month" | "last_30_days";

export function Services() {
  const { tenant, membership, can, role } = useTenant();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const liveOn = can("watch_live");

  const [activeTab, setActiveTab] = useState<ServiceCategoryTab>("sunday");
  const [period, setPeriod] = useState<PeriodFilter>("all");

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
          "id, name, service_date, service_type, theme, description, speaker, target_attendance, is_open, is_default, stream_url, online_min_minutes, attendance(count), watch_sessions(count)",
        )
        .eq("tenant_id", tenant!.id)
        .order("service_date", { ascending: false })
        .limit(150);

      if (error) throw error;
      return (data as unknown as ServiceRecord[]) ?? [];
    },
  });

  // Ensure default Sunday, Midweek, and Prayer services are created/available
  const ensureDefaults = useMutation({
    mutationFn: async () => {
      if (!tenant) return;
      try {
        await supabase.rpc("ensure_default_services", { p_tenant: tenant.id });
      } catch {
        // Fallback direct ensure
        const today = new Date();
        const getDow = (target: number) => {
          let diff = target - today.getDay();
          if (diff < 0) diff += 7;
          const d = new Date(today);
          d.setDate(today.getDate() + diff);
          return d.toISOString().slice(0, 10);
        };

        const defs = [
          { name: "Sunday Service", type: "sunday", date: getDow(0) },
          { name: "Midweek Service", type: "midweek", date: getDow(3) },
          { name: "Prayer Service", type: "prayer", date: getDow(5) },
        ];

        for (const def of defs) {
          const exists = services.some(
            (s) =>
              s.service_type === def.type || s.name.toLowerCase().includes(def.name.toLowerCase()),
          );
          if (!exists) {
            await supabase.from("services").insert({
              tenant_id: tenant.id,
              branch_id: membership?.branch_id ?? null,
              name: def.name,
              service_type: def.type,
              service_date: def.date,
              is_open: true,
              is_default: true,
            });
          }
        }
      }
    },
    onSuccess: () => {
      toast.success("Default weekly services ready");
      qc.invalidateQueries({ queryKey: ["services"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not initialize default services"),
  });

  // Launch service for today and navigate to attendance register
  const launchToday = useMutation({
    mutationFn: async (svc: { name: string; type: string }) => {
      if (!tenant) return;
      const today = new Date().toISOString().slice(0, 10);

      // Check if existing service matches for today
      const existing = services.find(
        (s) =>
          (s.service_type === svc.type || s.name.toLowerCase() === svc.name.toLowerCase()) &&
          s.service_date === today,
      );

      if (existing) {
        if (!existing.is_open) {
          await supabase.from("services").update({ is_open: true }).eq("id", existing.id);
        }
        return existing.id;
      }

      // Create new service instance for today
      const { data, error } = await supabase
        .from("services")
        .insert({
          tenant_id: tenant.id,
          branch_id: membership?.branch_id ?? null,
          name: svc.name,
          service_type: svc.type,
          service_date: today,
          is_open: true,
          is_default: true,
        })
        .select("id")
        .single();

      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      toast.success("Service opened for today!");
      qc.invalidateQueries({ queryKey: ["services"] });
      if (id) {
        navigate({ to: "/attendance", search: { serviceId: id } as Record<string, unknown> });
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not open service"),
  });

  // Create new Special / Themed Service
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
    onSuccess: (newId) => {
      toast.success("Service created and ready on check-in page!");
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

      const { error } = await supabase
        .from("services")
        .update({
          name: title,
          service_type: formCategory,
          theme: formTheme.trim() || null,
          service_date: formDate,
          speaker: formSpeaker.trim() || null,
          description: formDescription.trim() || null,
          target_attendance: targetNum && !isNaN(targetNum) ? targetNum : null,
          stream_url: stream,
        })
        .eq("id", editing.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Service details updated");
      setEditing(null);
      resetForm();
      qc.invalidateQueries({ queryKey: ["services"] });
      qc.invalidateQueries({ queryKey: ["open-services"] });
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
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update service status"),
  });

  // Delete Service (Safeguards default services, removes special programs with check-ins)
  const deleteService = useMutation({
    mutationFn: async (svc: ServiceRecord) => {
      if (svc.is_default) {
        throw new Error(
          "Default weekly service templates (Sunday, Midweek, Prayer) are permanent. You can toggle them closed to stop check-ins.",
        );
      }

      // Try delete_service RPC
      try {
        const { error } = await supabase.rpc("delete_service", { p_service: svc.id });
        if (!error) return;
      } catch {
        // Fall back to deleting attendance then service
      }

      await supabase.from("attendance").delete().eq("service_id", svc.id);
      const { error: svcDelErr } = await supabase.from("services").delete().eq("id", svc.id);
      if (svcDelErr) throw svcDelErr;
    },
    onSuccess: () => {
      toast.success("Service removed successfully");
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["services"] });
      qc.invalidateQueries({ queryKey: ["open-services"] });
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
    const lowerName = svc.name.toLowerCase();
    if (svc.service_type === "sunday" || lowerName.includes("sunday")) cat = "sunday";
    else if (
      svc.service_type === "midweek" ||
      lowerName.includes("midweek") ||
      lowerName.includes("wednesday")
    )
      cat = "midweek";
    else if (
      svc.service_type === "prayer" ||
      lowerName.includes("prayer") ||
      lowerName.includes("friday")
    )
      cat = "prayer";

    setFormCategory(cat);
    setFormName(svc.name);
    setFormTheme(svc.theme ?? "");
    setFormDate(svc.service_date);
    setFormSpeaker(svc.speaker ?? "");
    setFormTarget(svc.target_attendance ? String(svc.target_attendance) : "");
    setFormDescription(svc.description ?? "");
    setFormStreamUrl(svc.stream_url ?? "");
  }

  // Filter services by period
  const periodFilteredServices = useMemo(() => {
    if (period === "all") return services;
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    return services.filter((s) => {
      const sDate = new Date(s.service_date);
      if (period === "this_week") {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        return sDate >= startOfWeek && sDate <= endOfWeek;
      }
      if (period === "this_month") {
        return sDate.getFullYear() === now.getFullYear() && sDate.getMonth() === now.getMonth();
      }
      if (period === "last_30_days") {
        const thirtyAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return sDate >= thirtyAgo;
      }
      return true;
    });
  }, [services, period]);

  // Categorize services into tabs
  const categorized = useMemo(() => {
    const isSunday = (s: ServiceRecord) =>
      s.service_type === "sunday" || s.name.toLowerCase().includes("sunday");
    const isMidweek = (s: ServiceRecord) =>
      s.service_type === "midweek" ||
      s.name.toLowerCase().includes("midweek") ||
      s.name.toLowerCase().includes("wednesday");
    const isPrayer = (s: ServiceRecord) =>
      s.service_type === "prayer" ||
      s.name.toLowerCase().includes("prayer") ||
      s.name.toLowerCase().includes("friday");

    const sundays = periodFilteredServices.filter(isSunday);
    const midweeks = periodFilteredServices.filter((s) => !isSunday(s) && isMidweek(s));
    const prayers = periodFilteredServices.filter(
      (s) => !isSunday(s) && !isMidweek(s) && isPrayer(s),
    );
    const specials = periodFilteredServices.filter(
      (s) => !isSunday(s) && !isMidweek(s) && !isPrayer(s),
    );

    return {
      all: periodFilteredServices,
      sunday: sundays,
      midweek: midweeks,
      prayer: prayers,
      special: specials,
    };
  }, [periodFilteredServices]);

  // Overall and category metrics
  const metrics = useMemo(() => {
    const calc = (arr: ServiceRecord[]) => {
      const total = arr.reduce((acc, s) => acc + (s.attendance[0]?.count ?? 0), 0);
      const count = arr.length;
      const avg = count > 0 ? Math.round(total / count) : 0;
      return { total, avg, count };
    };

    return {
      sunday: calc(categorized.sunday),
      midweek: calc(categorized.midweek),
      prayer: calc(categorized.prayer),
      special: calc(categorized.special),
      all: calc(categorized.all),
    };
  }, [categorized]);

  // Format date helper with explicit Day of the Week
  const formatDateWithDay = (dateStr: string) => {
    const parts = dateStr.split("-").map(Number);
    const d =
      parts.length === 3 ? new Date(parts[0]!, parts[1]! - 1, parts[2]!) : new Date(dateStr);
    const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
    const fullDate = d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return { weekday, fullDate };
  };

  const currentTabList = categorized[activeTab];

  return (
    <div className="space-y-8">
      {/* Top Header & Fast Action */}
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
            Track weekly attendance for Sunday, Midweek, and Prayer services per day or period.
            Administrators have full data control to create themed and special programs that sync
            instantly to your church check-in page.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => ensureDefaults.mutate()}
            disabled={ensureDefaults.isPending}
            className="text-xs font-semibold"
          >
            <CalendarDays className="size-4 mr-1.5 text-primary" /> Reset Weekly Defaults
          </Button>

          <Button
            size="sm"
            onClick={() => {
              resetForm();
              setCreateOpen(true);
            }}
            className="text-xs font-semibold shadow-sm"
          >
            <Plus className="size-4 mr-1.5" /> Create Service / Program
          </Button>
        </div>
      </div>

      {/* Tier Administrator Control Banner */}
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary shrink-0">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-ink">
              Administrator Data & Service Control Enabled
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              You have complete authority over attendance records, services, themes, and member
              check-ins for this church. All created services appear on your public check-in page at{" "}
              <span className="font-mono text-ink">/c/{tenant?.subdomain}</span>.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button asChild variant="secondary" size="sm" className="text-xs font-medium">
            <Link to="/attendance">
              <Users className="size-3.5 mr-1.5" /> Full Attendance Register
            </Link>
          </Button>
        </div>
      </div>

      {/* Hero Metric Cards per Service Type */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Sunday Attendance Card */}
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
              Sunday Services
            </span>
            <span className="text-lg">☀️</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-ink">{metrics.sunday.total}</span>
            <span className="text-xs text-muted-foreground">total attendees</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Avg: <span className="font-semibold text-ink">{metrics.sunday.avg}</span> / Sunday (
            {metrics.sunday.count} held)
          </p>
        </div>

        {/* Midweek Attendance Card */}
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
              Midweek Services
            </span>
            <span className="text-lg">📖</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-ink">{metrics.midweek.total}</span>
            <span className="text-xs text-muted-foreground">total attendees</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Avg: <span className="font-semibold text-ink">{metrics.midweek.avg}</span> / service (
            {metrics.midweek.count} held)
          </p>
        </div>

        {/* Prayer Attendance Card */}
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
              Prayer Services
            </span>
            <span className="text-lg">🙏</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-ink">{metrics.prayer.total}</span>
            <span className="text-xs text-muted-foreground">total attendees</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Avg: <span className="font-semibold text-ink">{metrics.prayer.avg}</span> / prayer (
            {metrics.prayer.count} held)
          </p>
        </div>

        {/* Special Programs Card */}
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
            <span className="text-2xl font-bold font-mono text-ink">{metrics.special.total}</span>
            <span className="text-xs text-muted-foreground">total attendees</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {metrics.special.count} special programs recorded
          </p>
        </div>
      </div>

      {/* Filter and Category Tabs Bar */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/80 pb-3">
          {/* Service Category Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              {
                id: "sunday",
                label: "Sunday Services",
                icon: "☀️",
                count: categorized.sunday.length,
              },
              {
                id: "midweek",
                label: "Midweek Services",
                icon: "📖",
                count: categorized.midweek.length,
              },
              {
                id: "prayer",
                label: "Prayer Services",
                icon: "🙏",
                count: categorized.prayer.length,
              },
              {
                id: "special",
                label: "Special Programs",
                icon: "✨",
                count: categorized.special.length,
              },
              { id: "all", label: "All Services", icon: "📋", count: categorized.all.length },
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
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                    activeTab === tab.id
                      ? "bg-white/20 text-white"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Period Filter (Day, Week, Month, All) */}
          <div className="flex items-center gap-1.5 self-start sm:self-auto">
            <Filter className="size-3.5 text-muted-foreground mr-1" />
            <span className="text-xs font-semibold text-muted-foreground">Period:</span>
            {(
              [
                { id: "all", label: "All Time" },
                { id: "this_week", label: "This Week" },
                { id: "this_month", label: "This Month" },
                { id: "last_30_days", label: "30 Days" },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  period === p.id
                    ? "bg-ink text-paper font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Quick Launch Buttons for Sunday, Midweek, Prayer */}
        {(activeTab === "sunday" || activeTab === "midweek" || activeTab === "prayer") && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-muted/20 p-3.5">
            <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
              <Clock className="size-4 text-primary" />
              <span>
                Ready to take attendance today? Click to ensure today's register is active and open.
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="text-xs font-semibold h-8"
              disabled={launchToday.isPending}
              onClick={() => {
                const map = {
                  sunday: { name: "Sunday Service", type: "sunday" },
                  midweek: { name: "Midweek Service", type: "midweek" },
                  prayer: { name: "Prayer Service", type: "prayer" },
                };
                const sel = map[activeTab as "sunday" | "midweek" | "prayer"];
                if (sel) launchToday.mutate(sel);
              }}
            >
              <Play className="size-3.5 mr-1.5 fill-primary text-primary" /> Open{" "}
              {activeTab === "sunday" ? "Sunday" : activeTab === "midweek" ? "Midweek" : "Prayer"}{" "}
              Service Today
            </Button>
          </div>
        )}

        {/* Service List Cards */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-28 rounded-2xl border border-border/60 bg-muted/20 animate-pulse"
              />
            ))}
          </div>
        ) : currentTabList.length === 0 ? (
          <div className="surface border border-dashed p-10 text-center space-y-3">
            <Calendar className="mx-auto size-8 text-muted-foreground/60" />
            <p className="text-sm font-semibold text-ink">
              No services found for {activeTab === "all" ? "this period" : `${activeTab} services`}.
            </p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              {activeTab === "special"
                ? "Create a conference, vigil, youth meeting, or themed service day to record attendance."
                : "Initialize your weekly service defaults or launch a service for today."}
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
            {currentTabList.map((s) => {
              const { weekday, fullDate } = formatDateWithDay(s.service_date);
              const attendees = s.attendance[0]?.count ?? 0;
              const hasTarget = s.target_attendance && s.target_attendance > 0;
              const targetPct = hasTarget
                ? Math.min(100, Math.round((attendees / s.target_attendance!) * 100))
                : 0;

              return (
                <div
                  key={s.id}
                  className="surface flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5 transition-all hover:border-primary/40 hover:shadow-panel"
                >
                  {/* Left: Info */}
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-base text-ink tracking-tight truncate">
                        {s.name}
                      </h3>
                      {s.theme && (
                        <Badge
                          variant="secondary"
                          className="bg-primary/10 text-primary border-primary/20 text-xs font-semibold"
                        >
                          "{s.theme}"
                        </Badge>
                      )}
                      {s.is_default && (
                        <Badge variant="outline" className="text-[10px] uppercase font-mono">
                          Permanent Template
                        </Badge>
                      )}
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
                      <span className="flex items-center gap-1 font-medium text-ink">
                        <Calendar className="size-3.5 text-primary" /> {weekday}, {fullDate}
                      </span>
                      {s.speaker && (
                        <span>
                          Speaker: <strong className="text-ink">{s.speaker}</strong>
                        </span>
                      )}
                      {s.description && <span className="truncate max-w-xs">{s.description}</span>}
                    </div>

                    {/* Progress against target attendance if set */}
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

                    {/* Action Group */}
                    <div className="flex items-center gap-1.5">
                      {/* View Register Link */}
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
                        title="Edit Service"
                        onClick={() => openEdit(s)}
                      >
                        <Pencil className="size-4" />
                      </Button>

                      {/* Live Stream URL */}
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

                      {/* Delete Service (or protected modal for default) */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-9 w-9 ${
                          s.is_default
                            ? "text-muted-foreground/40 hover:text-muted-foreground"
                            : "text-destructive hover:bg-destructive/10"
                        }`}
                        title={s.is_default ? "Default template is permanent" : "Delete Service"}
                        onClick={() => setDeleteTarget(s)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Edit Service Modal */}
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
              {editing ? "Edit Service / Program" : "Create Service / Program"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Update service details, theme, speaker, and target attendance."
                : "Create a regular weekly service or special dubbed program. It will be open for check-ins immediately."}
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
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Service Type / Category</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: "sunday", label: "Sunday", icon: "☀️" },
                  { id: "midweek", label: "Midweek", icon: "📖" },
                  { id: "prayer", label: "Prayer", icon: "🙏" },
                  { id: "special", label: "Special", icon: "✨" },
                ].map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setFormCategory(c.id as "sunday" | "midweek" | "prayer" | "special");
                      if (!editing && !formName) {
                        if (c.id === "sunday") setFormName("Sunday Service");
                        else if (c.id === "midweek") setFormName("Midweek Service");
                        else if (c.id === "prayer") setFormName("Prayer Service");
                      }
                    }}
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

            {/* Service Title */}
            <div className="space-y-1.5">
              <Label htmlFor="srv-name" className="text-xs font-semibold">
                Service / Program Name *
              </Label>
              <Input
                id="srv-name"
                required
                placeholder="e.g. Sunday Service, Miracle Night, Youth Convention"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="h-10 rounded-xl"
              />
            </div>

            {/* Theme / Dubbed subtitle */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="srv-theme" className="text-xs font-semibold">
                  Theme / Dubbed Title (optional)
                </Label>
                <span className="text-[11px] text-muted-foreground">e.g. "Overflowing Grace"</span>
              </div>
              <Input
                id="srv-theme"
                placeholder="e.g. Divine Abundance, Night of Power, Awakening"
                value={formTheme}
                onChange={(e) => setFormTheme(e.target.value)}
                className="h-10 rounded-xl"
              />
            </div>

            {/* Date and Target Grid */}
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
                <p className="text-[11px] text-muted-foreground">
                  Falls on:{" "}
                  <strong className="text-ink">{formatDateWithDay(formDate).weekday}</strong>
                </p>
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

            {/* Speaker */}
            <div className="space-y-1.5">
              <Label htmlFor="srv-speaker" className="text-xs font-semibold">
                Minister / Speaker (optional)
              </Label>
              <Input
                id="srv-speaker"
                placeholder="e.g. Pastor Paul, Guest Speaker"
                value={formSpeaker}
                onChange={(e) => setFormSpeaker(e.target.value)}
                className="h-10 rounded-xl"
              />
            </div>

            {/* Description / Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="srv-desc" className="text-xs font-semibold">
                Description / Order of Service (optional)
              </Label>
              <Textarea
                id="srv-desc"
                rows={2}
                placeholder="Notes about the service or event requirements…"
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
                disabled={createService.isPending || updateService.isPending}
                className="font-semibold"
              >
                {editing ? "Save Changes" : "Create & Launch"}
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
                  <Trash2 className="size-5 text-destructive" /> Delete Service Record
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {deleteTarget?.is_default ? (
                <span>
                  <strong>"{deleteTarget.name}"</strong> is a permanent weekly church template.
                  Default services cannot be deleted so member QR cards, check-in history, and
                  regular schedules remain consistent.
                  <br />
                  <br />
                  To temporarily disable check-ins for this service, you can simply toggle it to{" "}
                  <strong>Closed</strong>.
                </span>
              ) : (
                <span>
                  Are you sure you want to delete the special program{" "}
                  <strong>"{deleteTarget?.name}"</strong> ({deleteTarget?.service_date})? This will
                  remove the service and associated attendance records. Member profiles and phone
                  numbers remain completely safe.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {deleteTarget?.is_default ? "Understood" : "Cancel"}
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
              Link a YouTube or Facebook Live stream. Members who watch for the minimum duration
              will be automatically marked present!
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
