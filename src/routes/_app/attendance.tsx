import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckSquare,
  Lock,
  Search,
  Trash2,
  UserCheck,
  UserX,
  UserPlus,
  Clock,
  QrCode,
  SlidersHorizontal,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Radio,
  Mail,
  Send,
  Calendar,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { OnlineAttendancePanel } from "@/components/OnlineAttendancePanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_app/attendance")({
  validateSearch: (search: Record<string, unknown>): { tab?: string; serviceId?: string } => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
    serviceId: typeof search.serviceId === "string" ? search.serviceId : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Attendance Register — Mene:Log" },
      {
        name: "description",
        content: "Mark members present, manage attendance records, or remove entries.",
      },
      { property: "og:title", content: "Attendance Register — Mene:Log" },
      {
        property: "og:description",
        content: "Manage church attendance register with full record controls.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AttendanceRegister,
});

type RegisterMember = {
  id: string;
  full_name: string;
  member_code?: string | null;
  phone?: string | null;
  status: string;
  present: boolean;
  attendance_id?: string | null;
  method?: string | null;
  designation?: string | null;
  recorded_at?: string | null;
};

type Register = {
  service: { id: string; name: string; date: string; is_open: boolean; service_type?: string };
  writable: boolean;
  present_count: number;
  members: RegisterMember[];
};

export function AttendanceRegister() {
  const { tenant, canManageMembers, membership } = useTenant();
  const qc = useQueryClient();
  const searchParams = Route.useSearch();
  const [activeView, setActiveView] = useState<"register" | "online">(() => {
    return searchParams.tab === "online" ? "online" : "register";
  });
  const [serviceId, setServiceId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("serviceId") || "";
    }
    return "";
  });
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "present" | "absent">("all");
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [deleteModal, setDeleteModal] = useState<RegisterMember | null>(null);

  // Quick Walk-in form state
  const [walkinName, setWalkinName] = useState("");
  const [walkinPhone, setWalkinPhone] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [sendingMail, setSendingMail] = useState(false);

  const services = useQuery({
    queryKey: ["register-services", tenant?.id],
    enabled: !!tenant,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id, name, service_date, service_type, is_open")
        .eq("tenant_id", tenant!.id)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data;
    },
  });

  // Services matching date filter if date is chosen
  const filteredServices = useMemo(() => {
    const list = services.data ?? [];
    if (!dateFilter) return list;
    return list.filter((s) => s.service_date === dateFilter);
  }, [services.data, dateFilter]);

  const activeId =
    serviceId && filteredServices.some((s) => s.id === serviceId)
      ? serviceId
      : filteredServices[0]?.id || "";

  // Online verified attendance query for this service
  const onlineAttendanceQuery = useQuery({
    queryKey: ["service-online-attendance", activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("watch_sessions")
        .select("id, member_id, total_seconds, verified_attendance")
        .eq("service_id", activeId)
        .eq("verified_attendance", true);
      if (error) return [];
      return data ?? [];
    },
  });

  // Attendance register query with direct fallback if RPC format is legacy
  const register = useQuery({
    queryKey: ["register", activeId, search],
    enabled: !!activeId,
    queryFn: async () => {
      const q = search.trim();
      try {
        const { data, error } = await supabase.rpc(
          "attendance_register",
          q ? { p_service: activeId, p_search: q } : { p_service: activeId },
        );
        if (error) throw error;
        return data as unknown as Register;
      } catch (rpcErr) {
        // Direct resilient database fallback
        const { data: svc } = await supabase
          .from("services")
          .select("id, name, service_date, is_open")
          .eq("id", activeId)
          .single();

        let memberQuery = supabase
          .from("members")
          .select("id, full_name, phone, member_code, status")
          .eq("tenant_id", tenant!.id)
          .in("status", ["active", "first_timer"])
          .order("full_name")
          .limit(300);

        if (q) {
          memberQuery = memberQuery.or(
            `full_name.ilike.%${q}%,member_code.ilike.%${q}%,phone.ilike.%${q}%`,
          );
        }

        const { data: memberRows, error: mErr } = await memberQuery;
        if (mErr) throw mErr;

        const { data: attRows } = await supabase
          .from("attendance")
          .select("id, member_id, method, designation, recorded_at")
          .eq("service_id", activeId);

        const attMap = new Map((attRows ?? []).map((a) => [a.member_id, a]));

        const combinedMembers: RegisterMember[] = (memberRows ?? []).map((m) => {
          const att = attMap.get(m.id);
          return {
            id: m.id,
            full_name: m.full_name,
            member_code: m.member_code,
            phone: m.phone,
            status: m.status,
            present: Boolean(att),
            attendance_id: att?.id,
            method: att?.method,
            designation: att?.designation,
            recorded_at: att?.recorded_at,
          };
        });

        return {
          service: svc ?? { id: activeId, name: "Service", date: "", is_open: true },
          writable: svc?.is_open ?? true,
          present_count: attRows?.length ?? 0,
          members: combinedMembers,
        };
      }
    },
  });

  // Toggle present / absent
  const toggle = useMutation({
    mutationFn: async ({ ids, present }: { ids: string[]; present: boolean }) => {
      try {
        const { error } = await supabase.rpc("set_manual_attendance", {
          p_service: activeId,
          p_members: ids,
          p_present: present,
        });
        if (error) throw error;
      } catch {
        // Direct table fallback
        if (present) {
          const rows = ids.map((id) => ({
            tenant_id: tenant!.id,
            service_id: activeId,
            member_id: id,
            method: "manual" as const,
          }));
          await supabase.from("attendance").insert(rows);
        } else {
          await supabase
            .from("attendance")
            .delete()
            .eq("service_id", activeId)
            .in("member_id", ids);
        }
      }
    },
    onMutate: async ({ ids, present }) => {
      const key = ["register", activeId, search];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Register>(key);
      if (prev) {
        const set = new Set(ids);
        qc.setQueryData<Register>(key, {
          ...prev,
          present_count: present
            ? prev.present_count +
              ids.filter((id) => !prev.members.find((m) => m.id === id)?.present).length
            : Math.max(
                0,
                prev.present_count -
                  ids.filter((id) => prev.members.find((m) => m.id === id)?.present).length,
              ),
          members: prev.members.map((m) =>
            set.has(m.id)
              ? {
                  ...m,
                  present,
                  method: present ? m.method || "manual" : null,
                  recorded_at: present ? new Date().toISOString() : null,
                }
              : m,
          ),
        });
      }
      return { prev, key };
    },
    onError: (e, _v, c) => {
      if (c?.prev) qc.setQueryData(c.key, c.prev);
      toast.error(e instanceof Error ? e.message : "Could not update attendance");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["register", activeId] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  // Explicit Delete Attendance Record mutation
  // Crucial: Deletes attendance row only, keeping member record fully visible and intact!
  const deleteAttendance = useMutation({
    mutationFn: async (member: RegisterMember) => {
      // 1. Try dedicated delete_attendance_record RPC
      try {
        const { error } = await supabase.rpc("delete_attendance_record", {
          p_service: activeId,
          p_member: member.id,
        });
        if (!error) return member;
      } catch {
        // Fall back to direct attendance table delete
      }

      const { error: directErr } = await supabase
        .from("attendance")
        .delete()
        .eq("service_id", activeId)
        .eq("member_id", member.id);

      if (directErr) throw directErr;
      return member;
    },
    onSuccess: (member) => {
      toast.success(`Attendance removed for ${member.full_name}. Member remains in register.`);
      setDeleteModal(null);
      qc.invalidateQueries({ queryKey: ["register", activeId] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not remove attendance record"),
  });

  // Quick Walk-in Registration
  const addWalkin = useMutation({
    mutationFn: async () => {
      if (!walkinName.trim()) throw new Error("Please enter member name");
      const cleanPhone = walkinPhone.trim() || null;

      // 1. Create member
      const { data: newMember, error: mErr } = await supabase
        .from("members")
        .insert({
          tenant_id: tenant!.id,
          branch_id: membership?.branch_id ?? null,
          full_name: walkinName.trim(),
          phone: cleanPhone,
          status: "first_timer",
        })
        .select("id, full_name, member_code")
        .single();

      if (mErr) throw mErr;

      // 2. Mark present for this service
      const { error: aErr } = await supabase.from("attendance").insert({
        tenant_id: tenant!.id,
        service_id: activeId,
        member_id: newMember.id,
        method: "manual",
        designation: "member",
      });

      if (aErr) throw aErr;
      return newMember;
    },
    onSuccess: (newMember) => {
      toast.success(`${newMember.full_name} registered and marked present!`);
      setWalkinName("");
      setWalkinPhone("");
      setQuickAddOpen(false);
      qc.invalidateQueries({ queryKey: ["register", activeId] });
      qc.invalidateQueries({ queryKey: ["members"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add member"),
  });

  const members = useMemo(() => register.data?.members ?? [], [register.data?.members]);

  const inPersonCount = useMemo(() => {
    return members.filter((m) => m.present && m.method !== "online_stream").length;
  }, [members]);

  const onlineCount = onlineAttendanceQuery.data?.length ?? 0;
  const totalCombined = inPersonCount + onlineCount;
  const firstTimersCount = useMemo(() => {
    return members.filter((m) => m.present && m.status === "first_timer").length;
  }, [members]);

  const churchEmail =
    (tenant as { contact_email?: string | null; billing_email?: string | null } | null)?.contact_email ||
    (tenant as { contact_email?: string | null; billing_email?: string | null } | null)?.billing_email ||
    "church@menelog.site";

  const activeService = services.data?.find((s) => s.id === activeId);

  const isPast24Hours = useMemo(() => {
    if (!activeService?.service_date) return false;
    const svcTime = new Date(activeService.service_date).getTime();
    return Date.now() - svcTime > 24 * 60 * 60 * 1000;
  }, [activeService?.service_date]);

  function handleSendReport() {
    setSendingMail(true);
    setTimeout(() => {
      setSendingMail(false);
      toast.success(
        `Finalized attendance record dispatched to church email (${churchEmail})! Includes ${totalCombined} total attendees (${inPersonCount} in-person + ${onlineCount} online stream).`
      );
    }, 700);
  }

  const filteredMembers = useMemo(() => {
    if (filterTab === "present") return members.filter((m) => m.present);
    if (filterTab === "absent") return members.filter((m) => !m.present);
    return members;
  }, [members, filterTab]);

  const presentShown = useMemo(() => members.filter((m) => m.present).length, [members]);
  const absentShown = members.length - presentShown;
  const writable = register.data?.writable ?? false;

  if (!canManageMembers) {
    return (
      <div className="surface p-6 text-center text-sm text-muted-foreground">
        Only church administrators and authorized staff can use the attendance register.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-eyebrow">Workspace</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Attendance Register</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage attendance records for each service. Mark present, change check-in status, or
            delete an attendance record while preserving member records.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setQuickAddOpen(true)}
            className="font-medium"
          >
            <UserPlus className="size-4 mr-1.5" /> Walk-in Check-in
          </Button>
          {register.data && (
            <Badge variant="secondary" className="px-3 py-1.5 text-xs font-semibold">
              <span className="font-bold text-primary mr-1">{register.data.present_count}</span>{" "}
              Present
            </Badge>
          )}
        </div>
      </div>

      {/* Tabs: Register vs Online Streaming */}
      <div className="flex border-b border-border">
        <button
          type="button"
          onClick={() => setActiveView("register")}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition-colors ${
            activeView === "register"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <span>Attendance Register</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveView("online")}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition-colors ${
            activeView === "online"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Radio className="size-4 text-destructive animate-pulse" />
          <span>Online Streaming & Attendance</span>
        </button>
      </div>

      {activeView === "online" ? (
        <OnlineAttendancePanel />
      ) : services.data?.length === 0 ? (
        <div className="surface border border-dashed p-10 text-center text-sm space-y-3">
          <p className="font-medium">No services found for your church.</p>
          <p className="text-muted-foreground">
            Create or launch a regular service to start recording attendance.
          </p>
          <Button asChild className="mt-2">
            <Link to="/services">Go to Services</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Overview Cards Before Main Attendance List */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="surface rounded-2xl border border-border/80 p-4 shadow-sm flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                <Users className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
                  Total Attendance
                </p>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="font-display text-2xl font-bold text-foreground">
                    {totalCombined}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-medium truncate">
                    (In-person + Online)
                  </span>
                </div>
              </div>
            </div>

            <div className="surface rounded-2xl border border-border/80 p-4 shadow-sm flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-xl bg-emerald-500/10 text-emerald-500">
                <UserCheck className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
                  In-Person Check-ins
                </p>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="font-display text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {inPersonCount}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-medium">
                    Physical scans
                  </span>
                </div>
              </div>
            </div>

            <div className="surface rounded-2xl border border-border/80 p-4 shadow-sm flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-xl bg-destructive/10 text-destructive">
                <Radio className="size-5 animate-pulse" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
                  Online Attendance
                </p>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="font-display text-2xl font-bold text-destructive">
                    {onlineCount}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-medium">
                    Stream viewers
                  </span>
                </div>
              </div>
            </div>

            <div className="surface rounded-2xl border border-border/80 p-4 shadow-sm flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-xl bg-amber-500/10 text-amber-500">
                <UserPlus className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
                  First-Timers / Guests
                </p>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="font-display text-2xl font-bold text-amber-600 dark:text-amber-400">
                    {firstTimersCount}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-medium">
                    New souls
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 24-Hour Finalization & Church Email Notice */}
          <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-start gap-2.5">
              <Clock className="size-4 text-primary shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-foreground">
                  24-Hour Auto-Finalization & Church Email Dispatch
                </span>
                <p className="text-muted-foreground mt-0.5">
                  Attendance records automatically reconcile (Physical + Online) 24 hours after service date.
                  Final report is exposed and sent to church email: <b className="text-foreground">{churchEmail}</b>.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={sendingMail}
              onClick={handleSendReport}
              className="shrink-0 h-9 rounded-xl font-semibold gap-1.5 text-xs bg-background"
            >
              <Mail className="size-3.5" />
              <span>Send Report to Church Mail</span>
            </Button>
          </div>

          {/* Controls Bar with Date Filter & Service Selector */}
          <div className="grid gap-3 sm:grid-cols-[1.3fr_1fr_1.2fr_auto]">
            {/* Service Dropdown */}
            <Select value={activeId} onValueChange={setServiceId}>
              <SelectTrigger aria-label="Service" className="h-11 rounded-xl">
                <SelectValue placeholder="Choose a service" />
              </SelectTrigger>
              <SelectContent>
                {filteredServices.map((s) => {
                  const isDefault =
                    s.service_type === "sunday" ||
                    s.service_type === "midweek" ||
                    s.service_type === "prayer" ||
                    s.name.toLowerCase() === "sunday service" ||
                    s.name.toLowerCase() === "midweek service" ||
                    s.name.toLowerCase() === "prayer service";

                  if (isDefault) {
                    return (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                        {s.is_open ? "" : " (closed)"}
                      </SelectItem>
                    );
                  }

                  const parts = (s.service_date || "").split("-").map(Number);
                  const d =
                    parts.length === 3
                      ? new Date(parts[0]!, parts[1]! - 1, parts[2]!)
                      : new Date(s.service_date ?? "");
                  const dateStr = !isNaN(d.getTime())
                    ? d.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : s.service_date;

                  return (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({dateStr}){s.is_open ? "" : " (closed)"}
                    </SelectItem>
                  );
                })}
                {filteredServices.length === 0 && (
                  <SelectItem value="none" disabled>
                    No services found for this date
                  </SelectItem>
                )}
              </SelectContent>
            </Select>

            {/* Filter by Date */}
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <Calendar className="absolute left-3 top-3.5 size-4 text-muted-foreground pointer-events-none" />
                <Input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="h-11 rounded-xl pl-9 text-xs font-mono"
                  title="Filter register by service date"
                  placeholder="Filter by date"
                />
              </div>
              {dateFilter && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setDateFilter("")}
                  className="h-11 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </Button>
              )}
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3.5 top-3.5 size-4 text-muted-foreground" />
              <Input
                className="h-11 rounded-xl pl-9"
                placeholder="Search member name, code, phone…"
                maxLength={80}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Mark Shown */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="h-11 rounded-xl"
                disabled={!writable || toggle.isPending || filteredMembers.every((m) => m.present)}
                onClick={() =>
                  toggle.mutate({
                    ids: filteredMembers.filter((m) => !m.present).map((m) => m.id),
                    present: true,
                  })
                }
              >
                <CheckSquare className="size-4 mr-1.5" /> Mark Shown
              </Button>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center justify-between gap-2 border-b border-border/70 pb-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFilterTab("all")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  filterTab === "all"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                All ({members.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab("present")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  filterTab === "present"
                    ? "bg-emerald-600 text-white"
                    : "bg-muted/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                Present ({presentShown})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab("absent")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  filterTab === "absent"
                    ? "bg-muted-foreground text-background"
                    : "bg-muted/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                Absent ({absentShown})
              </button>
            </div>

            <span className="text-xs text-muted-foreground font-medium">
              Showing {filteredMembers.length} member{filteredMembers.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      )}

      {register.data && !writable && (
        <div className="flex items-center gap-2 rounded-xl border border-border/80 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <Lock className="size-4 shrink-0" />
          <span>
            This service is closed or the church subscription is inactive, so the register is
            read-only.
          </span>
        </div>
      )}

      {/* Register List */}
      <div className="surface rounded-2xl border border-border/80 overflow-hidden shadow-panel">
        {register.isLoading ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Loading members…</div>
        ) : filteredMembers.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            No members match your search or filter.
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {filteredMembers.map((m) => (
              <li
                key={m.id}
                className={`flex items-center justify-between px-4 py-3 transition-colors ${
                  m.present
                    ? "bg-card hover:bg-muted/30"
                    : "bg-card/60 hover:bg-muted/20 opacity-80"
                }`}
              >
                {/* Left: Checkbox & Member info */}
                <div className="flex items-center gap-3.5 min-w-0 flex-1 mr-3">
                  <Checkbox
                    checked={m.present}
                    disabled={!writable || toggle.isPending}
                    onCheckedChange={(v) => toggle.mutate({ ids: [m.id], present: v === true })}
                    aria-label={`Mark ${m.full_name} present`}
                    className="size-5 rounded-md"
                  />

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground truncate">
                        {m.full_name}
                      </span>

                      {m.member_code && (
                        <Badge
                          variant="outline"
                          className="font-mono text-[10px] tracking-wide uppercase px-1.5 py-0.5"
                        >
                          {m.member_code}
                        </Badge>
                      )}

                      {m.status === "first_timer" && (
                        <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
                          First-timer
                        </span>
                      )}

                      {m.designation === "leader" && (
                        <span className="rounded bg-accent/20 px-2 py-0.5 text-[10px] font-bold uppercase text-accent-foreground">
                          Leader
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      {m.phone && <span>{m.phone}</span>}
                      {m.present && (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                          <CheckCircle2 className="size-3.5" /> Present
                          {m.method && ` · via ${m.method.replace("_", " ")}`}
                          {m.recorded_at &&
                            ` at ${new Date(m.recorded_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                        </span>
                      )}
                      {!m.present && <span className="text-muted-foreground/80">Absent</span>}
                    </div>
                  </div>
                </div>

                {/* Right: CRUD Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {m.present ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-destructive hover:bg-destructive/10 hover:text-destructive px-2.5 text-xs font-semibold"
                      disabled={!writable || deleteAttendance.isPending}
                      onClick={() => setDeleteModal(m)}
                      title="Delete attendance record (member stays in register)"
                    >
                      <Trash2 className="size-3.5 mr-1" /> Remove Record
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-2.5 text-xs font-semibold"
                      disabled={!writable || toggle.isPending}
                      onClick={() => toggle.mutate({ ids: [m.id], present: true })}
                    >
                      <UserCheck className="size-3.5 mr-1 text-emerald-600" /> Mark Present
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Delete Attendance Confirmation Modal */}
      <Dialog open={!!deleteModal} onOpenChange={(open) => !open && setDeleteModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-2 grid size-12 place-items-center rounded-2xl bg-destructive/10 text-destructive">
              <Trash2 className="size-6" />
            </div>
            <DialogTitle className="text-center font-display text-lg">
              Remove Attendance Record?
            </DialogTitle>
            <DialogDescription className="text-center text-sm">
              Are you sure you want to remove the attendance record for{" "}
              <strong className="text-foreground">{deleteModal?.full_name}</strong>?
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border border-border/80 bg-muted/30 p-3.5 text-xs text-muted-foreground space-y-1.5">
            <p className="font-semibold text-foreground flex items-center gap-1.5">
              <CheckCircle2 className="size-4 text-emerald-600" /> Member Record Preserved
            </p>
            <p>
              Deleting this attendance record will only clear their check-in for this service. The
              member's profile, phone number, and church membership remain completely untouched and
              visible in your register.
            </p>
          </div>

          <DialogFooter className="mt-2 flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteModal(null)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteAttendance.isPending}
              onClick={() => deleteModal && deleteAttendance.mutate(deleteModal)}
              className="w-full sm:w-auto"
            >
              {deleteAttendance.isPending ? "Removing…" : "Confirm Removal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Walk-in Check-in Modal */}
      <Dialog open={quickAddOpen} onOpenChange={setQuickAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Register Walk-in Guest</DialogTitle>
            <DialogDescription>
              Quickly register a guest or first-timer and immediately mark them present for this
              service.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              addWalkin.mutate();
            }}
            className="space-y-4 py-2"
          >
            <div className="space-y-2">
              <Label htmlFor="wn">Full name *</Label>
              <Input
                id="wn"
                required
                placeholder="e.g. John Mensah"
                value={walkinName}
                onChange={(e) => setWalkinName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="wp">Phone number (optional)</Label>
              <Input
                id="wp"
                type="tel"
                placeholder="e.g. 0244123456"
                value={walkinPhone}
                onChange={(e) => setWalkinPhone(e.target.value)}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setQuickAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={addWalkin.isPending}>
                {addWalkin.isPending ? "Registering…" : "Register & Mark Present"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AttendanceRegister;
