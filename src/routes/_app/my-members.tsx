import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Cake,
  Download,
  MessageCircle,
  Phone,
  QrCode,
  Search,
  UserMinus,
  UserPlus,
  Users,
  CalendarCheck,
  GitBranch,
  Building2,
  Calendar,
  Clock,
  MapPin,
  Settings,
  CheckCircle2,
  ShieldAlert,
  ArrowRight,
  FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { labelledQr } from "@/lib/qr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_app/my-members")({
  head: () => ({
    meta: [
      { title: "My members & Leader Portal — Mene:Log" },
      {
        name: "description",
        content: "Leader dashboard: your group members, hierarchy attendance, subordinate leaders, and cell meeting tools.",
      },
      { property: "og:title", content: "My members & Leader Portal — Mene:Log" },
      { property: "og:description", content: "Leader portal for cell groups, subordinate hierarchy, and member care." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MyMembers,
});

type Person = { id: string; full_name: string; phone: string | null };
type Dash = {
  ok: boolean;
  church?: string;
  full_name?: string;
  absence_threshold: number;
  sundays_counted: number;
  stats: {
    members: number;
    first_timers_month: number;
    present_last_sunday: number;
    absent: number;
  };
  members: Array<
    Person & {
      email: string | null;
      status: string;
      joined_on: string;
      last_seen: string | null;
      residential_area: string | null;
    }
  >;
  first_timers: Array<Person & { joined_on: string; followup_status: string | null }>;
  absentees: Array<
    Person & {
      last_seen: string | null;
      last_outcome: string | null;
      last_note: string | null;
      last_contact: string | null;
    }
  >;
  demographics: Record<
    "gender" | "marital" | "age" | "location" | "occupation",
    Record<string, number>
  >;
  birthdays: Array<Person & { date_of_birth: string }>;
  my_streak: number;
};

type SubordinateLeader = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  group_name: string | null;
  meeting_day: string | null;
  meeting_time: string | null;
  meeting_venue: string | null;
  location: string | null;
  leader_types?: { id: string; name: string } | null;
};

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "never";
const wa = (phone: string) => `https://wa.me/${phone.replace(/\D/g, "").replace(/^0/, "233")}`;

export function MyMembers() {
  const { tenant } = useTenant();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"members" | "hierarchy" | "group" | "first" | "absent" | "demo">("members");
  const [logFor, setLogFor] = useState<Person | null>(null);
  const [outcome, setOutcome] = useState("called");
  const [note, setNote] = useState("");
  const [myQr, setMyQr] = useState<string | null>(null);

  // Edit Profile / Group Settings State
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [editGroupName, setEditGroupName] = useState("");
  const [editMeetingDay, setEditMeetingDay] = useState("");
  const [editMeetingTime, setEditMeetingTime] = useState("");
  const [editMeetingVenue, setEditMeetingVenue] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editLocation, setEditLocation] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["leader-dashboard"],
    queryFn: async () => {
      const { data: r, error } = await supabase.rpc("leader_dashboard");
      if (error) throw error;
      return r as unknown as Dash;
    },
  });

  // Query Current Leader Profile & Details
  const myProfileQuery = useQuery({
    queryKey: ["my-leader-profile", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from("leader_profiles")
        .select("id, full_name, email, phone, location, group_name, meeting_day, meeting_time, meeting_venue, reports_to_leader_id, leader_types(id, name)")
        .eq("user_id", user.id)
        .eq("tenant_id", tenant!.id)
        .maybeSingle();

      if (error) return null;

      // Populate edit states if empty
      if (data) {
        setEditGroupName(data.group_name ?? "");
        setEditMeetingDay(data.meeting_day ?? "");
        setEditMeetingTime(data.meeting_time ?? "");
        setEditMeetingVenue(data.meeting_venue ?? "");
        setEditPhone(data.phone ?? "");
        setEditLocation(data.location ?? "");
      }
      return data;
    },
  });

  const myProfile = myProfileQuery.data;

  // Query Superior Leader if current leader reports to someone
  const superiorLeaderQuery = useQuery({
    queryKey: ["superior-leader", myProfile?.reports_to_leader_id],
    enabled: !!myProfile?.reports_to_leader_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leader_profiles")
        .select("id, full_name, email, phone, group_name, leader_types(name)")
        .eq("id", myProfile!.reports_to_leader_id!)
        .maybeSingle();
      if (error) return null;
      return data;
    },
  });

  // Query Subordinate Leaders reporting to this leader
  const subordinatesQuery = useQuery({
    queryKey: ["subordinate-leaders", myProfile?.id],
    enabled: !!myProfile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leader_profiles")
        .select("id, full_name, email, phone, location, group_name, meeting_day, meeting_time, meeting_venue, leader_types(id, name)")
        .eq("reports_to_leader_id", myProfile!.id)
        .order("full_name");
      if (error) return [];
      return (data as SubordinateLeader[]) ?? [];
    },
  });

  const subordinates = subordinatesQuery.data ?? [];

  // Update Leader Profile & Group
  const updateProfile = useMutation({
    mutationFn: async () => {
      if (!myProfile?.id) throw new Error("Leader profile not found");
      const { error } = await supabase
        .from("leader_profiles")
        .update({
          group_name: editGroupName.trim() || null,
          meeting_day: editMeetingDay.trim() || null,
          meeting_time: editMeetingTime.trim() || null,
          meeting_venue: editMeetingVenue.trim() || null,
          phone: editPhone.trim() || null,
          location: editLocation.trim() || null,
        } as unknown as {
          phone?: string | null;
          location?: string | null;
        })
        .eq("id", myProfile.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Leader profile and group details updated!");
      setProfileModalOpen(false);
      qc.invalidateQueries({ queryKey: ["my-leader-profile"] });
      qc.invalidateQueries({ queryKey: ["leader-dashboard"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update profile"),
  });

  const log = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("leader_log_contact", {
        p_member: logFor!.id,
        p_outcome: outcome,
        p_note: note.slice(0, 500),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contact saved");
      setLogFor(null);
      setNote("");
      qc.invalidateQueries({ queryKey: ["leader-dashboard"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });

  const openQr = useMutation({
    mutationFn: async () => {
      const { data: r, error } = await supabase.rpc("leader_my_qr");
      if (error) throw error;
      const q = r as unknown as { token: string; full_name: string };
      return labelledQr(q.token, tenant?.name ?? data?.church ?? "", q.full_name, "Leader");
    },
    onSuccess: setMyQr,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not load your code"),
  });

  function exportMembersCsv() {
    if (!data?.members?.length) {
      toast.info("No members to export yet.");
      return;
    }
    const headers = ["Full Name", "Phone", "Email", "Status", "Joined On", "Residential Area", "Last Seen"];
    const rows = data.members.map((m) => [
      `"${m.full_name.replace(/"/g, '""')}"`,
      `"${m.phone ?? ""}"`,
      `"${m.email ?? ""}"`,
      `"${m.status}"`,
      `"${m.joined_on}"`,
      `"${m.residential_area ?? ""}"`,
      `"${m.last_seen ?? "Never"}"`,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${myProfile?.group_name || "leader"}-members.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Member database exported to CSV!");
  }

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.members ?? []).filter(
      (m) => !q || m.full_name.toLowerCase().includes(q) || (m.phone ?? "").includes(q),
    );
  }, [data, search]);

  if (isLoading)
    return <p className="p-8 text-center text-sm text-muted-foreground">Loading your leader dashboard…</p>;
  if (!data?.ok)
    return (
      <p className="surface p-8 text-center text-sm text-muted-foreground">
        This page is for registered leaders. Upgrade to have access to this feature.
      </p>
    );

  const stats = [
    { label: "My members", value: data.stats.members, icon: Users },
    { label: "Subordinate Leaders", value: subordinates.length, icon: GitBranch },
    { label: "Present last Sunday", value: data.stats.present_last_sunday, icon: CalendarCheck },
    {
      label: `Missed ${data.absence_threshold}+ Sundays`,
      value: data.stats.absent,
      icon: UserMinus,
    },
  ];

  const Contact = ({ p }: { p: Person }) =>
    p.phone ? (
      <span className="flex gap-1">
        <Button asChild size="icon" variant="ghost" className="size-8">
          <a href={`tel:${p.phone}`} aria-label={`Call ${p.full_name}`}>
            <Phone className="size-4" />
          </a>
        </Button>
        <Button asChild size="icon" variant="ghost" className="size-8">
          <a
            href={wa(p.phone)}
            target="_blank"
            rel="noreferrer"
            aria-label={`WhatsApp ${p.full_name}`}
          >
            <MessageCircle className="size-4" />
          </a>
        </Button>
      </span>
    ) : null;

  return (
    <div className="space-y-6">
      {/* Header with Group Name and Actions */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-eyebrow">{data.church}</p>
            {myProfile?.group_name && (
              <Badge variant="secondary" className="text-xs font-semibold">
                {myProfile.group_name}
              </Badge>
            )}
            {myProfile?.leader_types?.name && (
              <Badge variant="outline" className="text-xs">
                {myProfile.leader_types.name}
              </Badge>
            )}
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            Welcome, {data.full_name?.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Leader portal for your group, subordinate hierarchy attendance, and member care.
            You&apos;ve attended {data.my_streak} of the last 12 Sundays.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setProfileModalOpen(true)}
            className="h-9 gap-1.5 text-xs font-semibold"
          >
            <Settings className="size-3.5" /> Edit Profile & Group
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={exportMembersCsv}
            className="h-9 gap-1.5 text-xs font-semibold"
          >
            <FileSpreadsheet className="size-3.5" /> Export CSV
          </Button>

          <Button
            size="sm"
            onClick={() => openQr.mutate()}
            disabled={openQr.isPending}
            className="h-9 gap-1.5 text-xs font-semibold"
          >
            <QrCode className="size-3.5" /> My Leader QR Code
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <div key={label} className="surface rounded-2xl border border-border/80 p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold uppercase tracking-wider">
              {label}
              <Icon className="size-4 text-primary" />
            </div>
            <p className="mt-2 font-display text-3xl font-bold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      {/* Birthdays notice */}
      {data.birthdays.length > 0 && (
        <div className="surface rounded-2xl border border-border/80 p-4 shadow-sm space-y-2">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
            <Cake className="size-4 text-primary" /> Birthdays in the next 30 days
          </h2>
          <div className="flex flex-wrap gap-2">
            {data.birthdays.map((b) => (
              <span
                key={b.id}
                className="rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-xs font-medium text-foreground"
              >
                <b>{b.full_name}</b> · {fmt(b.date_of_birth)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {(
          [
            ["members", "My Members"],
            ["hierarchy", `Hierarchy & Subordinates (${subordinates.length})`],
            ["group", "Group & Cell Info"],
            ["first", "First-timers"],
            ["absent", "Absentees"],
            ["demo", "Demographics"],
          ] as const
        ).map(([k, l]) => (
          <Button
            key={k}
            size="sm"
            variant={tab === k ? "default" : "outline"}
            className="h-9 rounded-xl text-xs font-semibold"
            onClick={() => setTab(k)}
          >
            {l}
          </Button>
        ))}
      </div>

      {/* Tab: Members */}
      {tab === "members" && (
        <div className="surface rounded-2xl border border-border/80 overflow-hidden shadow-panel">
          <div className="relative border-b border-border/60 p-3">
            <Search className="absolute left-6 top-5 size-4 text-muted-foreground" />
            <Input
              className="pl-9 h-10 rounded-xl text-xs"
              placeholder="Search member name or phone…"
              maxLength={80}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {shown.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              No members match your search. Members who choose your name at check-in will appear here.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {shown.map((m) => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm hover:bg-muted/30 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">{m.full_name}</p>
                    <p className="text-xs capitalize text-muted-foreground mt-0.5">
                      <span className="font-medium text-foreground/80">{m.status.replace("_", " ")}</span>
                      {m.residential_area ? ` · ${m.residential_area}` : ""} · last seen{" "}
                      {fmt(m.last_seen)}
                    </p>
                  </div>
                  <Contact p={m} />
                  <Button size="sm" variant="outline" className="h-8 rounded-xl text-xs" onClick={() => setLogFor(m)}>
                    Log contact
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Tab: Hierarchy & Subordinate Leaders */}
      {tab === "hierarchy" && (
        <div className="space-y-4">
          {/* Superior Leader Banner */}
          {superiorLeaderQuery.data ? (
            <div className="rounded-2xl border border-border/80 bg-muted/40 p-4 flex items-center justify-between">
              <div>
                <span className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">
                  Your Supervising Leader
                </span>
                <p className="font-bold text-foreground text-sm mt-0.5">
                  {superiorLeaderQuery.data.full_name}{" "}
                  {superiorLeaderQuery.data.leader_types?.name ? `(${superiorLeaderQuery.data.leader_types.name})` : ""}
                </p>
                {superiorLeaderQuery.data.group_name && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Group: {superiorLeaderQuery.data.group_name}
                  </p>
                )}
              </div>
              {superiorLeaderQuery.data.phone && (
                <Button asChild size="sm" variant="outline" className="h-8 text-xs gap-1.5">
                  <a href={`tel:${superiorLeaderQuery.data.phone}`}>
                    <Phone className="size-3.5" /> Call Supervisor
                  </a>
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-border/80 bg-muted/30 p-4 text-xs text-muted-foreground">
              You report directly to the Senior Pastor / Church Administrator.
            </div>
          )}

          {/* Subordinates List */}
          <div className="surface rounded-2xl border border-border/80 p-5 shadow-panel space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div>
                <h2 className="font-bold text-base flex items-center gap-2">
                  <GitBranch className="size-4 text-primary" />
                  <span>Subordinate Leaders Under Your Care</span>
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Leaders reporting directly to you in your church hierarchy.
                </p>
              </div>
              <Badge variant="outline" className="font-mono text-xs">
                {subordinates.length} Leaders
              </Badge>
            </div>

            {subordinates.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground space-y-2">
                <GitBranch className="mx-auto size-8 text-muted-foreground/60" />
                <p className="font-semibold text-foreground">No subordinate leaders assigned yet</p>
                <p className="text-xs max-w-sm mx-auto">
                  When subordinate leaders (such as Cell Leaders) register or select you as their supervisor, their groups and attendance will appear here.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {subordinates.map((sub) => (
                  <div
                    key={sub.id}
                    className="rounded-xl border border-border/80 bg-card p-4 space-y-2.5 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-sm text-foreground block">{sub.full_name}</span>
                        <span className="text-xs text-muted-foreground">
                          {sub.leader_types?.name || "Leader"}
                        </span>
                      </div>
                      {sub.group_name && (
                        <Badge variant="secondary" className="text-[10px]">
                          {sub.group_name}
                        </Badge>
                      )}
                    </div>

                    <div className="border-t border-border/60 pt-2 text-xs text-muted-foreground space-y-1">
                      {sub.meeting_day && (
                        <div className="flex items-center gap-1.5">
                          <Calendar className="size-3 text-primary" />
                          <span>Meets: {sub.meeting_day} {sub.meeting_time ? `@ ${sub.meeting_time}` : ""}</span>
                        </div>
                      )}
                      {sub.meeting_venue && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="size-3 text-primary" />
                          <span>Venue: {sub.meeting_venue}</span>
                        </div>
                      )}
                    </div>

                    {sub.phone && (
                      <div className="pt-2 flex gap-2">
                        <Button asChild size="sm" variant="outline" className="h-8 text-xs flex-1 gap-1">
                          <a href={`tel:${sub.phone}`}>
                            <Phone className="size-3" /> Call
                          </a>
                        </Button>
                        <Button asChild size="sm" variant="outline" className="h-8 text-xs flex-1 gap-1">
                          <a href={wa(sub.phone)} target="_blank" rel="noreferrer">
                            <MessageCircle className="size-3" /> WhatsApp
                          </a>
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Group & Cell Profile */}
      {tab === "group" && (
        <div className="surface rounded-2xl border border-border/80 p-5 shadow-panel space-y-4">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div>
              <h2 className="font-bold text-base flex items-center gap-2">
                <Building2 className="size-4 text-primary" />
                <span>Group & Meeting Schedule</span>
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Meeting schedule and location for your cell / fellowship group.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setProfileModalOpen(true)} className="h-8 text-xs font-semibold">
              <Settings className="size-3.5 mr-1" /> Edit Group
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-border/70 p-4 space-y-1">
              <span className="text-[11px] font-bold text-muted-foreground uppercase">Group Name</span>
              <p className="text-base font-bold text-foreground">
                {myProfile?.group_name || "Not specified yet"}
              </p>
            </div>

            <div className="rounded-xl border border-border/70 p-4 space-y-1">
              <span className="text-[11px] font-bold text-muted-foreground uppercase">Meeting Day & Time</span>
              <p className="text-base font-bold text-foreground">
                {myProfile?.meeting_day
                  ? `${myProfile.meeting_day} ${myProfile.meeting_time ? `at ${myProfile.meeting_time}` : ""}`
                  : "Not set yet"}
              </p>
            </div>

            <div className="rounded-xl border border-border/70 p-4 space-y-1 sm:col-span-2">
              <span className="text-[11px] font-bold text-muted-foreground uppercase">Meeting Venue / Address</span>
              <p className="text-sm font-medium text-foreground">
                {myProfile?.meeting_venue || "No venue address recorded"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab: First-timers */}
      {tab === "first" && (
        <div className="surface rounded-2xl border border-border/80 overflow-hidden shadow-panel">
          {data.first_timers.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No first-timers yet.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {data.first_timers.map((f) => (
                <li key={f.id} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/30">
                  <div className="flex-1">
                    <p className="font-semibold text-foreground">{f.full_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Joined {fmt(f.joined_on)} · {f.followup_status ?? "new"}
                    </p>
                  </div>
                  <Contact p={f} />
                  <Button size="sm" variant="outline" className="h-8 rounded-xl text-xs" onClick={() => setLogFor(f)}>
                    Log contact
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Tab: Absentees */}
      {tab === "absent" && (
        <div className="surface rounded-2xl border border-border/80 overflow-hidden shadow-panel">
          {data.absentees.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Great news! None of your members have missed {data.absence_threshold}+ Sundays in a row.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {data.absentees.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm hover:bg-muted/30">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">{a.full_name}</p>
                    <p className="text-xs text-destructive mt-0.5">
                      Last seen {fmt(a.last_seen)}
                      {a.last_outcome ? ` · last contact: ${a.last_outcome}` : ""}
                    </p>
                    {a.last_note && <p className="mt-1 text-xs italic text-muted-foreground">&ldquo;{a.last_note}&rdquo;</p>}
                  </div>
                  <Contact p={a} />
                  <Button size="sm" variant="outline" className="h-8 rounded-xl text-xs" onClick={() => setLogFor(a)}>
                    Log contact
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Tab: Demographics */}
      {tab === "demo" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {(["gender", "marital", "age", "location", "occupation"] as const).map((k) => {
            const row = data.demographics[k] ?? {};
            const entries = Object.entries(row);
            const total = entries.reduce((s, [, v]) => s + v, 0);
            return (
              <div key={k} className="surface rounded-2xl border border-border/80 p-4 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground capitalize">
                  {k} breakdown
                </h3>
                {entries.length === 0 ? (
                  <p className="mt-3 text-xs text-muted-foreground">No data recorded.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {entries.map(([label, v]) => (
                      <div key={label} className="text-xs">
                        <div className="flex justify-between font-medium">
                          <span className="capitalize">{label}</span>
                          <span>{v} ({total ? Math.round((v / total) * 100) : 0}%)</span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${total ? (v / total) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Edit Leader Profile & Group */}
      <Dialog open={profileModalOpen} onOpenChange={setProfileModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Leader Profile & Group</DialogTitle>
            <DialogDescription>
              Update your group name, cell meeting schedule, venue, and contact details.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateProfile.mutate();
            }}
            className="space-y-3.5 pt-2"
          >
            <div className="space-y-1.5">
              <Label htmlFor="egroup" className="text-xs font-semibold">Group / Cell Name</Label>
              <Input
                id="egroup"
                placeholder="e.g. Grace Cell, PCF 1, Youth Fellowship"
                value={editGroupName}
                onChange={(e) => setEditGroupName(e.target.value)}
                className="h-10 rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="eday" className="text-xs font-semibold">Meeting Day</Label>
                <Input
                  id="eday"
                  placeholder="e.g. Wednesday"
                  value={editMeetingDay}
                  onChange={(e) => setEditMeetingDay(e.target.value)}
                  className="h-10 rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="etime" className="text-xs font-semibold">Meeting Time</Label>
                <Input
                  id="etime"
                  placeholder="e.g. 6:30 PM"
                  value={editMeetingTime}
                  onChange={(e) => setEditMeetingTime(e.target.value)}
                  className="h-10 rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="evenue" className="text-xs font-semibold">Meeting Venue / Address</Label>
              <Input
                id="evenue"
                placeholder="e.g. Church Hall or Member Residence"
                value={editMeetingVenue}
                onChange={(e) => setEditMeetingVenue(e.target.value)}
                className="h-10 rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ephone" className="text-xs font-semibold">Phone Number</Label>
                <Input
                  id="ephone"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="h-10 rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="eloc" className="text-xs font-semibold">Location / Area</Label>
                <Input
                  id="eloc"
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  className="h-10 rounded-xl"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setProfileModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateProfile.isPending}>
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Log Contact */}
      <Dialog open={!!logFor} onOpenChange={(o) => !o && setLogFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log contact — {logFor?.full_name}</DialogTitle>
            <DialogDescription>
              Your church admin sees this on the Follow-ups page.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            {["called", "visited", "messaged", "unreachable", "other"].map((o) => (
              <Button
                key={o}
                size="sm"
                variant={outcome === o ? "default" : "outline"}
                className="capitalize"
                onClick={() => setOutcome(o)}
              >
                {o}
              </Button>
            ))}
          </div>
          <Textarea
            placeholder="Short note (optional)"
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <DialogFooter>
            <Button disabled={log.isPending} onClick={() => log.mutate()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Leader QR */}
      <Dialog open={!!myQr} onOpenChange={(o) => !o && setMyQr(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>My leader QR code</DialogTitle>
            <DialogDescription>
              Show this at the door. Scans are recorded as leader attendance.
            </DialogDescription>
          </DialogHeader>
          {myQr && <img src={myQr} alt="Leader QR code" className="mx-auto w-64 rounded-md" />}
          <DialogFooter>
            <Button asChild>
              <a href={myQr ?? ""} download="my-leader-qr.png">
                <Download className="size-4" /> Download
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
