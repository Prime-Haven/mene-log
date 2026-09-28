import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useRef, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import {
  CheckCircle2,
  AlertCircle,
  XCircle,
  Search,
  Keyboard,
  Camera,
  RotateCcw,
  Sparkles,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const CameraScanner = lazy(() => import("@/components/CameraScanner"));

export const Route = createFileRoute("/_app/scan")({
  head: () => ({
    meta: [
      { title: "Scan & Check-in — Mene:Log" },
      {
        name: "description",
        content: "Scan member QR codes or enter member codes to record attendance.",
      },
      { property: "og:title", content: "Scan & Check-in — Mene:Log" },
      {
        property: "og:description",
        content: "Record attendance by scanning QR or typing member code.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Scan,
});

type Result = {
  ok: boolean;
  name?: string;
  code?: string;
  duplicate?: boolean;
  already_present?: boolean;
  message: string;
};

type RecentCheckin = {
  name: string;
  code?: string;
  time: string;
  duplicate: boolean;
};

export function Scan() {
  const { tenant } = useTenant();
  const [serviceId, setServiceId] = useState<string>("");
  const [result, setResult] = useState<Result | null>(null);
  const [inputCode, setInputCode] = useState("");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"camera" | "manual_code">("camera");
  const [recent, setRecent] = useState<RecentCheckin[]>([]);
  const busy = useRef(false);

  const { data: services } = useQuery({
    queryKey: ["open-services", tenant?.id],
    enabled: !!tenant,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id, name, service_date")
        .eq("is_open", true)
        .order("service_date", { ascending: false })
        .limit(20);
      if (error) throw error;
      if (data?.[0] && !serviceId) setServiceId(data[0].id);
      return data;
    },
  });

  const { data: matches } = useQuery({
    queryKey: ["member-search", tenant?.id, query],
    enabled: !!tenant && query.trim().length > 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("members")
        .select("id, full_name, phone, member_code")
        .ilike("full_name", `%${query.trim()}%`)
        .limit(8);
      if (error) throw error;
      return data;
    },
  });

  // Client-side fallback if RPC is unavailable or raises constraint errors
  async function clientFallbackCheckin(tokenOrCode: string, targetServiceId: string) {
    if (!tenant) throw new Error("Church account unavailable");
    const clean = tokenOrCode.trim();

    // 1. Search member by member_code, id, or phone
    const { data: foundMembers, error: memberErr } = await supabase
      .from("members")
      .select("id, full_name, member_code, branch_id, position_id, is_leader")
      .eq("tenant_id", tenant.id)
      .or(
        `member_code.ilike.${clean},member_code.ilike.ML-${clean.replace(/^ml-/i, "")},phone.eq.${clean},id.eq.${clean.length === 36 ? clean : "00000000-0000-0000-0000-000000000000"}`,
      )
      .limit(1);

    if (memberErr || !foundMembers || foundMembers.length === 0) {
      return {
        ok: false,
        message: "Member code not found. Check the code or search by name below.",
      };
    }

    const member = foundMembers[0]!;

    // 2. Check if already recorded present
    const { data: existingAtt } = await supabase
      .from("attendance")
      .select("id, recorded_at")
      .eq("service_id", targetServiceId)
      .eq("member_id", member.id)
      .maybeSingle();

    if (existingAtt) {
      return {
        ok: true,
        member_name: member.full_name,
        member_code: member.member_code ?? clean,
        duplicate: true,
        already_present: true,
        message: `${member.full_name} is already marked present for this service`,
      };
    }

    // 3. Record new attendance
    const { error: insertErr } = await supabase.from("attendance").insert({
      tenant_id: tenant.id,
      service_id: targetServiceId,
      member_id: member.id,
      branch_id: member.branch_id,
      position_id: member.position_id,
      method: "scan",
      designation: member.is_leader ? "leader" : "member",
    });

    if (insertErr) {
      // If concurrent insert occurred, treat as duplicate
      if (insertErr.code === "23505" || insertErr.message?.includes("conflict")) {
        return {
          ok: true,
          member_name: member.full_name,
          member_code: member.member_code ?? clean,
          duplicate: true,
          already_present: true,
          message: `${member.full_name} is already marked present for this service`,
        };
      }
      throw insertErr;
    }

    return {
      ok: true,
      member_name: member.full_name,
      member_code: member.member_code ?? clean,
      duplicate: false,
      already_present: false,
      message: "Attendance recorded successfully",
    };
  }

  async function handleToken(token: string) {
    if (busy.current || !serviceId) return;
    const cleanToken = token.trim();
    if (!cleanToken) return;

    busy.current = true;
    try {
      let res: {
        ok: boolean;
        member_name?: string;
        member_code?: string;
        duplicate?: boolean;
        already_present?: boolean;
        designation?: string;
        reason?: string;
        message?: string;
      } | null = null;

      // Try primary database RPC
      try {
        const { data, error } = await supabase.rpc("resolve_scan", {
          p_token: cleanToken,
          p_service: serviceId,
        });

        if (!error && data) {
          res = data as unknown as typeof res;
        }
      } catch {
        res = null;
      }

      // If RPC failed or wasn't decisive, execute resilient client fallback
      if (!res || (!res.ok && res.reason !== "out_of_scope")) {
        res = await clientFallbackCheckin(cleanToken, serviceId);
      }

      if (!res.ok) {
        setResult({
          ok: false,
          code: cleanToken,
          message:
            res.message ||
            (res.reason === "out_of_scope" ? "Not in your assigned group" : "Code not recognised"),
        });
      } else {
        const isDuplicate = Boolean(res.duplicate || res.already_present);
        const name = res.member_name || "Member";
        const code = res.member_code || cleanToken;

        setResult({
          ok: true,
          name,
          code,
          duplicate: isDuplicate,
          already_present: isDuplicate,
          message: isDuplicate
            ? `${name} is already marked present for this service`
            : "Attendance recorded successfully",
        });

        // Add to recent feed
        setRecent((prev) => [
          {
            name,
            code,
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            duplicate: isDuplicate,
          },
          ...prev.slice(0, 4),
        ]);
      }
    } catch (e) {
      setResult({
        ok: false,
        message:
          e instanceof Error ? e.message : "Scanning failed. Try typing the member code below.",
      });
    } finally {
      setTimeout(() => {
        busy.current = false;
      }, 900);
    }
  }

  async function manual(memberId: string) {
    if (!serviceId) return;
    try {
      const { data, error } = await supabase.rpc("manual_attendance", {
        p_member: memberId,
        p_service: serviceId,
      });

      if (error) {
        // Direct fallback
        const { data: existing } = await supabase
          .from("attendance")
          .select("id")
          .eq("service_id", serviceId)
          .eq("member_id", memberId)
          .maybeSingle();

        if (existing) {
          toast.info("Member is already marked present");
        } else {
          await supabase.from("attendance").insert({
            tenant_id: tenant!.id,
            service_id: serviceId,
            member_id: memberId,
            method: "manual",
          });
          toast.success("Attendance recorded successfully");
        }
      } else {
        const res = data as unknown as { duplicate: boolean };
        if (res.duplicate) {
          toast.info("Member is already marked present");
        } else {
          toast.success("Attendance recorded successfully");
        }
      }
      setQuery("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record attendance");
    }
  }

  function handleManualCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!inputCode.trim()) return;
    handleToken(inputCode.trim());
    setInputCode("");
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      {/* Header */}
      <div>
        <p className="text-eyebrow">At the door</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Scan & Check-in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Scan QR codes with the camera or type the member code to record attendance.
        </p>
      </div>

      {/* Service Selection */}
      <div className="surface p-4">
        <label
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          htmlFor="svc"
        >
          Active Service
        </label>
        <select
          id="svc"
          className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-medium focus:ring-2 focus:ring-primary/20"
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
        >
          <option value="">Select an open service</option>
          {(services ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} — {s.service_date}
            </option>
          ))}
        </select>
        {(services ?? []).length === 0 && (
          <p className="mt-2 text-sm text-destructive">
            No open service. Please open or create a service first in the Services tab.
          </p>
        )}
      </div>

      {/* Check-in Mode Selector */}
      <div className="flex rounded-xl border border-border/80 bg-muted/40 p-1">
        <button
          type="button"
          onClick={() => setMode("camera")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition-all ${
            mode === "camera"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Camera className="size-4" /> Camera Scanner
        </button>
        <button
          type="button"
          onClick={() => setMode("manual_code")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition-all ${
            mode === "manual_code"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Keyboard className="size-4" /> Enter Member Code
        </button>
      </div>

      {/* Camera Scanner View */}
      {mode === "camera" && serviceId && (
        <div className="surface overflow-hidden border border-border/80 shadow-panel">
          <ClientOnly
            fallback={
              <div className="grid h-64 place-items-center text-sm text-muted-foreground">
                Starting camera…
              </div>
            }
          >
            <Suspense
              fallback={
                <div className="grid h-64 place-items-center text-sm text-muted-foreground">
                  Starting camera…
                </div>
              }
            >
              <CameraScanner onToken={handleToken} />
            </Suspense>
          </ClientOnly>
          <div className="border-t border-border/60 bg-muted/20 px-4 py-2 text-center text-xs text-muted-foreground">
            Point camera at the member's QR code. Can't scan? Use the code field below.
          </div>
        </div>
      )}

      {/* Code Entry Fallback Input */}
      <div className="surface p-4 border border-border/80">
        <div className="flex items-center justify-between mb-2">
          <label
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            htmlFor="mcode"
          >
            Member Code Fallback
          </label>
          <span className="text-[11px] text-muted-foreground">
            Enter code if QR scan is not possible
          </span>
        </div>
        <form onSubmit={handleManualCodeSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Input
              id="mcode"
              className="h-11 font-mono uppercase tracking-wider pl-3 text-base"
              placeholder="e.g. ML-7B2K91"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value)}
              disabled={!serviceId}
              autoComplete="off"
            />
          </div>
          <Button
            type="submit"
            disabled={!serviceId || !inputCode.trim()}
            className="h-11 px-5 font-semibold"
          >
            <UserCheck className="size-4 mr-1.5" /> Check In
          </Button>
        </form>
      </div>

      {/* Result Status Display */}
      {result && (
        <div
          className={`flex items-start gap-3.5 rounded-2xl border p-4.5 transition-all ${
            result.already_present || result.duplicate
              ? "border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-200"
              : result.ok
                ? "border-success/30 bg-success/10 text-emerald-950 dark:text-emerald-200"
                : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {result.already_present || result.duplicate ? (
            <AlertCircle className="size-6 text-amber-500 shrink-0 mt-0.5" />
          ) : result.ok ? (
            <CheckCircle2 className="size-6 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <XCircle className="size-6 text-destructive shrink-0 mt-0.5" />
          )}

          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold font-display">
                {result.already_present || result.duplicate
                  ? "Already Present"
                  : result.ok
                    ? "Present — Attendance Recorded"
                    : "Scan Unsuccessful"}
              </span>
              {result.code && (
                <Badge variant="outline" className="font-mono text-xs uppercase">
                  {result.code}
                </Badge>
              )}
            </div>

            {result.name && (
              <p className="mt-0.5 text-lg font-bold text-foreground">{result.name}</p>
            )}

            <p className="mt-1 text-sm leading-relaxed opacity-90">{result.message}</p>
          </div>

          <Button
            size="sm"
            variant="ghost"
            className="size-8 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => setResult(null)}
          >
            <RotateCcw className="size-4" />
          </Button>
        </div>
      )}

      {/* Recent Check-ins */}
      {recent.length > 0 && (
        <div className="surface p-4 border border-border/80">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
            Recent Door Check-ins
          </p>
          <div className="divide-y divide-border/60">
            {recent.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{item.name}</span>
                  {item.code && (
                    <span className="font-mono text-[11px] text-muted-foreground">
                      ({item.code})
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={item.duplicate ? "secondary" : "default"} className="text-[11px]">
                    {item.duplicate ? "Already present" : "Recorded"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{item.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Find by Name Search */}
      <div className="surface space-y-3 p-4 border border-border/80">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          No code? Find member by name
        </p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-10 pl-9"
            placeholder="Type at least 3 letters of member's name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <ul className="divide-y divide-border">
          {(matches ?? []).map((m) => (
            <li key={m.id} className="flex items-center justify-between py-2.5">
              <div>
                <span className="text-sm font-medium">{m.full_name}</span>
                {m.member_code && (
                  <span className="ml-2 font-mono text-xs text-muted-foreground">
                    [{m.member_code}]
                  </span>
                )}
                {m.phone && <p className="text-xs text-muted-foreground">{m.phone}</p>}
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!serviceId}
                onClick={() => manual(m.id)}
              >
                Mark Present
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default Scan;
