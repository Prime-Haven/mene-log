import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useRef, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { CheckCircle2, Search, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const CameraScanner = lazy(() => import("@/components/CameraScanner"));

export const Route = createFileRoute("/_app/scan")({
  head: () => ({
    meta: [
      { title: "Scan & check in — Mene:Log" },
      {
        name: "description",
        content: "Scan member QR codes to record attendance for an open service.",
      },
      { property: "og:title", content: "Scan & check in — Mene:Log" },
      { property: "og:description", content: "Record attendance by scanning member QR codes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Scan,
});

type Result = { ok: boolean; name?: string | undefined; message: string };

function Scan() {
  const { tenant } = useTenant();
  const [serviceId, setServiceId] = useState<string>("");
  const [result, setResult] = useState<Result | null>(null);
  const [query, setQuery] = useState("");
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
        .select("id, full_name, phone")
        .ilike("full_name", `%${query.trim()}%`)
        .limit(8);
      if (error) throw error;
      return data;
    },
  });

  async function handleToken(token: string) {
    if (busy.current || !serviceId) return;
    busy.current = true;
    try {
      const { data, error } = await supabase.rpc("resolve_scan", {
        p_token: token,
        p_service: serviceId,
      });
      if (error) throw error;
      const res = data as unknown as {
        ok: boolean;
        member_name?: string;
        duplicate?: boolean;
        designation?: string;
        reason?: string;
      };
      if (!res.ok) {
        setResult({
          ok: false,
          message: res.reason === "out_of_scope" ? "Not in your group" : "Code not recognised",
        });
      } else {
        setResult({
          ok: true,
          name: res.member_name,
          message: res.duplicate
            ? "Already recorded"
            : res.designation === "leader"
              ? "Leader attendance recorded"
              : "Attendance recorded",
        });
      }
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : "Scan failed" });
    } finally {
      setTimeout(() => {
        busy.current = false;
      }, 1200);
    }
  }

  async function manual(memberId: string) {
    const { data, error } = await supabase.rpc("manual_attendance", {
      p_member: memberId,
      p_service: serviceId,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    const res = data as unknown as { duplicate: boolean };
    toast.success(res.duplicate ? "Already recorded" : "Attendance recorded");
    setQuery("");
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <p className="text-eyebrow">At the door</p>
        <h1 className="mt-2 text-2xl font-bold">Scan & check in</h1>
      </div>

      <div className="surface p-4">
        <label className="text-sm font-medium" htmlFor="svc">
          Service
        </label>
        <select
          id="svc"
          className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
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
          <p className="mt-2 text-sm text-muted-foreground">
            No open service. Ask an admin to create one on the Services screen.
          </p>
        )}
      </div>

      {serviceId && (
        <div className="surface overflow-hidden">
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
        </div>
      )}

      {result && (
        <div
          className={`flex items-center gap-3 rounded-lg border p-4 ${
            result.ok
              ? "border-success/40 bg-success/10 text-success"
              : "border-destructive/40 bg-destructive/10 text-destructive"
          }`}
        >
          {result.ok ? <CheckCircle2 className="size-6" /> : <XCircle className="size-6" />}
          <div>
            {result.name && <p className="text-lg font-bold">{result.name}</p>}
            <p className="text-sm">{result.message}</p>
          </div>
        </div>
      )}

      <div className="surface space-y-3 p-4">
        <p className="text-sm font-medium">No code? Find by name</p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Type at least 3 letters"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <ul className="divide-y divide-border">
          {(matches ?? []).map((m) => (
            <li key={m.id} className="flex items-center justify-between py-2">
              <span className="text-sm">{m.full_name}</span>
              <Button
                size="sm"
                variant="outline"
                disabled={!serviceId}
                onClick={() => manual(m.id)}
              >
                Record
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
