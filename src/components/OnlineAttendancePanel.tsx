import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Radio,
  Clock,
  Users,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Video,
  Play,
  Calendar,
  Sparkles,
  Link2,
  Tv,
  Power,
  Sliders,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getOnlineAttendanceOverview } from "@/lib/watch.functions";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function OnlineAttendancePanel() {
  const { tenant, tier, can } = useTenant();
  const getOverview = useServerFn(getOnlineAttendanceOverview);
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState<string | undefined>(undefined);

  // Stream broadcast controls
  const [streamServiceId, setStreamServiceId] = useState<string>("");
  const [streamUrl, setStreamUrl] = useState<string>("");
  const [minMinutes, setMinMinutes] = useState<number>(20);

  const watchLiveEnabled = can("watch_live") || tier === "premium";

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["online-attendance-overview", tenant?.id, selectedServiceId],
    enabled: !!tenant?.id && watchLiveEnabled,
    refetchInterval: 5000,
    queryFn: () =>
      getOverview({
        data: {
          tenant_id: tenant!.id,
          service_id: selectedServiceId,
        },
      }),
  });

  // Query all services to configure streaming
  const allServicesQuery = useQuery({
    queryKey: ["church-services-for-stream", tenant?.id],
    enabled: !!tenant?.id && watchLiveEnabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id, name, service_date, is_live, stream_url, online_min_minutes, is_open")
        .eq("tenant_id", tenant!.id)
        .order("is_live", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data as Array<{
        id: string;
        name: string;
        service_date: string | null;
        is_live: boolean;
        stream_url: string | null;
        online_min_minutes: number;
        is_open: boolean;
      }>) ?? [];
    },
  });

  const availableServices = useMemo(() => allServicesQuery.data ?? [], [allServicesQuery.data]);

  // Initialize selected stream service when loaded
  useEffect(() => {
    if (!streamServiceId && availableServices.length > 0) {
      const activeLive = availableServices.find((s) => s.is_live);
      const chosen = activeLive || availableServices[0];
      setStreamServiceId(chosen.id);
      setStreamUrl(chosen.stream_url ?? "");
      setMinMinutes(chosen.online_min_minutes ?? 20);
    }
  }, [availableServices, streamServiceId]);

  const activeStreamService = availableServices.find((s) => s.id === streamServiceId);

  // Toggle Live mutation
  const toggleLive = useMutation({
    mutationFn: async ({
      id,
      is_live,
      url,
      min,
    }: {
      id: string;
      is_live: boolean;
      url?: string;
      min?: number;
    }) => {
      const updates: {
        is_live: boolean;
        stream_url?: string | null;
        online_min_minutes?: number;
      } = { is_live };
      if (url !== undefined) updates.stream_url = url.trim() || null;
      if (min !== undefined) updates.online_min_minutes = min;

      const { error } = await supabase.from("services").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      toast.success(
        vars.is_live
          ? "Service is now LIVE ONLINE! Members can stream and log attendance."
          : "Service has been set OFFLINE."
      );
      allServicesQuery.refetch();
      refetch();
      qc.invalidateQueries({ queryKey: ["services"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update stream status"),
  });

  const publicWatchUrl =
    typeof window !== "undefined" && tenant?.subdomain
      ? `${window.location.origin}/live/${tenant.subdomain}`
      : `https://menelog.site/live/${tenant?.subdomain ?? ""}`;

  function copyWatchLink() {
    navigator.clipboard.writeText(publicWatchUrl);
    setCopied(true);
    toast.success("Watch Live link copied! Share this with your church members.");
    setTimeout(() => setCopied(false), 2500);
  }

  if (!watchLiveEnabled) {
    return (
      <div className="surface rounded-2xl border border-dashed border-border/80 p-8 text-center space-y-4">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Radio className="size-6 text-primary" />
        </div>
        <div>
          <h3 className="font-display text-lg font-bold">Online Streaming & Attendance</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
            Upgrade your account to have access to this feature. Broadcast your services online,
            allow members to watch with their member code, and automatically record verified
            attendance.
          </p>
        </div>
        <Button asChild size="sm">
          <a href="/billing">Upgrade Account</a>
        </Button>
      </div>
    );
  }

  const services = data?.services ?? [];
  const activeViewers = data?.activeViewersCount ?? 0;
  const totalMinutes = data?.totalMinutesWatched ?? 0;
  const attendees = data?.onlineAttendees ?? [];

  return (
    <div className="space-y-6">
      {/* Top Banner: Watch Live Link & Real-time Live Counters */}
      <div className="surface rounded-2xl border border-border/80 p-5 shadow-panel">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
                <span className="relative inline-flex size-2.5 rounded-full bg-destructive" />
              </span>
              <h2 className="font-display text-base font-bold text-foreground">
                Online Streaming & Attendance Hub
              </h2>
              <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                Premium
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Members sign in using their member code (e.g. ML-1024) printed under their QR.
              Attendance is marked automatically once they hit your minimum watch time.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-xl border border-border bg-muted/40 px-3 py-1.5 text-xs font-mono">
              <span className="truncate max-w-[180px] sm:max-w-xs">{publicWatchUrl}</span>
              <button
                type="button"
                onClick={copyWatchLink}
                className="text-muted-foreground hover:text-foreground transition-colors p-1"
                title="Copy link"
              >
                {copied ? (
                  <Check className="size-3.5 text-emerald-500" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </button>
            </div>
            <Button
              asChild
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs font-semibold h-9"
            >
              <a href={publicWatchUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-3.5" /> Test Watch Page
              </a>
            </Button>
          </div>
        </div>

        {/* Live Metrics Grid */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-border/60 pt-4">
          <div className="rounded-xl border border-border/60 bg-background/50 p-3.5 flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-destructive/10 text-destructive">
              <Radio className="size-5 animate-pulse" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Live Viewers Now
              </p>
              <p className="font-display text-xl font-bold text-foreground">
                {isLoading ? "…" : activeViewers}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-background/50 p-3.5 flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Online Attendance Recorded
              </p>
              <p className="font-display text-xl font-bold text-foreground">
                {isLoading ? "…" : attendees.length}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-background/50 p-3.5 flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-emerald-500/10 text-emerald-500">
              <Clock className="size-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Total Stream Minutes
              </p>
              <p className="font-display text-xl font-bold text-foreground">
                {isLoading ? "…" : `${totalMinutes} min`}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Stream Link & Online/Offline Broadcast Control Center */}
      <div className="surface rounded-2xl border border-border/80 p-5 shadow-panel space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
          <div>
            <h3 className="font-display text-base font-bold text-foreground flex items-center gap-2">
              <Tv className="size-5 text-primary" />
              <span>Broadcast Stream & Live Controls</span>
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Paste your YouTube, Vimeo, or Facebook Live URL, and toggle the broadcast Online so members can watch and log attendance.
            </p>
          </div>

          {activeStreamService && (
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                  activeStreamService.is_live
                    ? "bg-destructive/15 text-destructive border border-destructive/30 animate-pulse"
                    : "bg-muted text-muted-foreground border border-border"
                }`}
              >
                <span
                  className={`size-2 rounded-full ${
                    activeStreamService.is_live ? "bg-destructive" : "bg-muted-foreground"
                  }`}
                />
                {activeStreamService.is_live ? "LIVE ONLINE NOW" : "STREAM OFFLINE"}
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          {/* Service Selector */}
          <div className="md:col-span-4 space-y-1.5">
            <Label htmlFor="stream-svc-select" className="text-xs font-semibold">
              Select Service to Stream
            </Label>
            <select
              id="stream-svc-select"
              value={streamServiceId}
              onChange={(e) => {
                const sId = e.target.value;
                setStreamServiceId(sId);
                const svc = availableServices.find((s) => s.id === sId);
                if (svc) {
                  setStreamUrl(svc.stream_url ?? "");
                  setMinMinutes(svc.online_min_minutes ?? 20);
                }
              }}
              className="flex h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {availableServices.map((svc) => (
                <option key={svc.id} value={svc.id}>
                  {svc.name} ({svc.service_date || "Permanent"}) {svc.is_live ? "🔴 [LIVE]" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Stream Link Input */}
          <div className="md:col-span-5 space-y-1.5">
            <Label htmlFor="stream-url-input" className="text-xs font-semibold">
              Stream Link (YouTube Live / Vimeo / Facebook)
            </Label>
            <div className="relative">
              <Link2 className="absolute left-3.5 top-3.5 size-4 text-muted-foreground" />
              <Input
                id="stream-url-input"
                type="url"
                value={streamUrl}
                onChange={(e) => setStreamUrl(e.target.value)}
                placeholder="https://youtube.com/live/your-stream-id or embed link"
                className="h-11 rounded-xl pl-10 text-xs font-mono"
              />
            </div>
          </div>

          {/* Min Watch Minutes */}
          <div className="md:col-span-3 space-y-1.5">
            <Label htmlFor="stream-min-minutes" className="text-xs font-semibold">
              Min Minutes to Count Present
            </Label>
            <Input
              id="stream-min-minutes"
              type="number"
              min={1}
              max={240}
              value={minMinutes}
              onChange={(e) => setMinMinutes(parseInt(e.target.value, 10) || 20)}
              className="h-11 rounded-xl text-xs font-mono"
            />
          </div>
        </div>

        {/* Action Buttons: Toggle Online / Offline */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <p className="text-[11px] text-muted-foreground">
            {activeStreamService?.is_live
              ? "🟢 Members navigating to the Watch Live link can currently enter their member ID and watch."
              : "⚪ Toggling Online allows members to watch and automatically log their view time."}
          </p>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={toggleLive.isPending || !activeStreamService}
              onClick={() => {
                if (!streamServiceId) return;
                toggleLive.mutate({
                  id: streamServiceId,
                  is_live: activeStreamService?.is_live ?? false,
                  url: streamUrl,
                  min: minMinutes,
                });
              }}
              className="h-10 rounded-xl text-xs font-semibold"
            >
              Save Link
            </Button>

            {activeStreamService?.is_live ? (
              <Button
                type="button"
                variant="destructive"
                disabled={toggleLive.isPending}
                onClick={() => {
                  toggleLive.mutate({
                    id: streamServiceId,
                    is_live: false,
                    url: streamUrl,
                    min: minMinutes,
                  });
                }}
                className="h-10 rounded-xl gap-2 text-xs font-semibold shadow-md"
              >
                <Power className="size-4" /> Take Stream Offline
              </Button>
            ) : (
              <Button
                type="button"
                disabled={toggleLive.isPending || !streamServiceId}
                onClick={() => {
                  if (!streamUrl.trim()) {
                    toast.error("Please paste your live stream link first.");
                    return;
                  }
                  toggleLive.mutate({
                    id: streamServiceId,
                    is_live: true,
                    url: streamUrl,
                    min: minMinutes,
                  });
                }}
                className="h-10 rounded-xl gap-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md"
              >
                <Radio className="size-4 animate-pulse" /> Go Live Online
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Services with Streaming Configured */}
      <div className="surface rounded-2xl border border-border/80 p-5 shadow-panel space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Video className="size-4 text-primary" />
            <span>Configured Service Streams</span>
          </h3>
          <Button size="sm" variant="ghost" className="text-xs h-8" onClick={() => refetch()}>
            Refresh
          </Button>
        </div>

        {services.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground space-y-2">
            <p>No services currently have streaming URLs configured.</p>
            <p>
              When creating or editing a service, add a YouTube, Vimeo, or Facebook Live stream URL
              to enable live broadcast and automatic member attendance tracking.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {services.map((svc) => (
              <div
                key={svc.id}
                onClick={() =>
                  setSelectedServiceId(selectedServiceId === svc.id ? undefined : svc.id)
                }
                className={`cursor-pointer rounded-xl border p-4 transition-all ${
                  selectedServiceId === svc.id
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : "border-border/80 bg-background/60 hover:bg-muted/30"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-sm text-foreground">{svc.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                      <Calendar className="size-3" /> {svc.service_date}
                    </p>
                  </div>
                  <Badge
                    variant={svc.is_open ? "default" : "outline"}
                    className={`text-[10px] capitalize ${
                      svc.is_open
                        ? "bg-emerald-600 hover:bg-emerald-600 text-white"
                        : "text-muted-foreground"
                    }`}
                  >
                    {svc.is_open ? "Live Now" : "Closed"}
                  </Badge>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground border-t border-border/50 pt-2.5">
                  <span>
                    Min required: <strong>{svc.online_min_minutes ?? 15} min</strong>
                  </span>
                  <span>
                    Attendance marked: <strong>{svc.attendeeCount ?? 0} members</strong>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Online Attendees Table */}
      <div className="surface rounded-2xl border border-border/80 overflow-hidden shadow-panel">
        <div className="p-4 border-b border-border/70 flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Users className="size-4 text-primary" />
            <span>Online Attendance Log ({attendees.length})</span>
          </h3>
          <span className="text-[11px] text-muted-foreground">
            Attendance recorded via Watch Live stream
          </span>
        </div>

        {attendees.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            No members have completed online attendance yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="p-3">Member Name</th>
                  <th className="p-3">Member Code</th>
                  <th className="p-3">Phone</th>
                  <th className="p-3">Recorded At</th>
                  <th className="p-3 text-right">Method</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {attendees.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                    <td className="p-3 font-semibold text-foreground">
                      {row.member?.full_name || "Unknown Member"}
                    </td>
                    <td className="p-3 font-mono font-medium text-primary">
                      {row.member?.member_code || "—"}
                    </td>
                    <td className="p-3 text-muted-foreground">{row.member?.phone || "—"}</td>
                    <td className="p-3 text-muted-foreground">
                      {new Date(row.recorded_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="p-3 text-right">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                        <Radio className="size-3" /> Online Stream
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
