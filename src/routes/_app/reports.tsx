import { csvCell } from "@/lib/csv";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UpgradePanel } from "@/components/FeatureGate";

export const Route = createFileRoute("/_app/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Mene:Log" },
      {
        name: "description",
        content: "Service attendance, first-timers, absentees and birthday lists.",
      },
      { property: "og:title", content: "Reports — Mene:Log" },
      { property: "og:description", content: "Attendance and follow-up reports for your church." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Reports,
});

function download(filename: string, rows: Array<Array<string | number>>) {
  const csv = rows
    .map((r) => r.map((v) => csvCell(v)).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function Reports() {
  const ctx = useTenant();
  const { tenant } = ctx;
  const [serviceId, setServiceId] = useState("");

  const { data: services } = useQuery({
    queryKey: ["all-services", tenant?.id],
    enabled: !!tenant,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id, name, service_date")
        .order("service_date", { ascending: false })
        .limit(60);
      if (error) throw error;
      if (data?.[0] && !serviceId) setServiceId(data[0].id);
      return data;
    },
  });

  const { data: attendees } = useQuery({
    queryKey: ["service-attendance", serviceId],
    enabled: !!serviceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("id, method, recorded_at, members(full_name, phone, residential_area)")
        .eq("service_id", serviceId)
        .order("recorded_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: firstTimers } = useQuery({
    queryKey: ["first-timers", tenant?.id],
    enabled: !!tenant,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("members")
        .select("id, full_name, phone, residential_area, created_at")
        .eq("status", "first_timer")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const { data: birthdays } = useQuery({
    queryKey: ["birthdays-report", tenant?.id],
    enabled: !!tenant,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("birthdays_this_month", { p_tenant: tenant!.id });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: insights } = useQuery({
    queryKey: ["insights", tenant?.id],
    enabled: !!tenant && ctx.can("reports_advanced"),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("attendance_insights", {
        p_tenant: tenant!.id,
        p_weeks: 12,
      });
      if (error) throw error;
      return data as unknown as {
        services: Array<{
          service_date: string;
          name: string;
          total: number;
          first_timers: number;
        }>;
        groups: Array<{ group_name: string; members: number; attendances: number }>;
        branches: Array<{ branch: string; members: number; attendances: number }>;
        demographics: Record<string, number>;
      };
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-eyebrow">Analytics</p>
        <h1 className="mt-2 text-2xl font-bold">Reports</h1>
      </div>

      <Tabs defaultValue="service">
        <TabsList>
          <TabsTrigger value="service">Service attendance</TabsTrigger>
          <TabsTrigger value="first">First-timers</TabsTrigger>
          <TabsTrigger value="birthdays">Birthdays</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="service" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
            >
              {(services ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.service_date}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                download("service-attendance.csv", [
                  ["Name", "Phone", "Area", "Method", "Recorded at"],
                  ...(attendees ?? []).map((a) => [
                    a.members?.full_name ?? "Anonymised",
                    a.members?.phone ?? "",
                    a.members?.residential_area ?? "",
                    a.method,
                    a.recorded_at,
                  ]),
                ])
              }
            >
              <Download className="size-4" /> CSV
            </Button>
            <span className="text-sm text-muted-foreground">{attendees?.length ?? 0} present</span>
          </div>
          <ReportTable
            head={["Name", "Phone", "Method"]}
            rows={(attendees ?? []).map((a) => [
              a.members?.full_name ?? "Anonymised",
              a.members?.phone ?? "—",
              a.method,
            ])}
          />
        </TabsContent>

        <TabsContent value="first" className="space-y-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              download("first-timers.csv", [
                ["Name", "Phone", "Area", "Captured"],
                ...(firstTimers ?? []).map((m) => [
                  m.full_name,
                  m.phone ?? "",
                  m.residential_area ?? "",
                  m.created_at,
                ]),
              ])
            }
          >
            <Download className="size-4" /> CSV
          </Button>
          <ReportTable
            head={["Name", "Phone", "Area"]}
            rows={(firstTimers ?? []).map((m) => [
              m.full_name,
              m.phone ?? "—",
              m.residential_area ?? "—",
            ])}
          />
        </TabsContent>

        <TabsContent value="birthdays" className="space-y-4">
          <ReportTable
            head={["Name", "Date", "Phone"]}
            rows={(birthdays ?? []).map((b) => [
              b.full_name,
              b.date_of_birth ?? "—",
              b.phone ?? "Hidden",
            ])}
          />
        </TabsContent>
        <TabsContent value="insights" className="space-y-5">
          {!ctx.can("reports_advanced") ? (
            <UpgradePanel feature="reports_advanced" canUpgrade={ctx.isOwner} />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  ["Members", insights?.demographics?.["total"]],
                  ["Men", insights?.demographics?.["male"]],
                  ["Women", insights?.demographics?.["female"]],
                  ["Married", insights?.demographics?.["married"]],
                  ["Single", insights?.demographics?.["single"]],
                  ["Under 18", insights?.demographics?.["minors"]],
                ].map(([label, value]) => (
                  <div key={String(label)} className="surface p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {label}
                    </p>
                    <p className="mt-1 text-2xl font-bold">{value ?? 0}</p>
                  </div>
                ))}
              </div>

              <div>
                <h2 className="mb-2 text-base font-semibold">Last 12 weeks of services</h2>
                <ReportTable
                  head={["Date", "Service", "Present", "First-timers"]}
                  rows={(insights?.services ?? []).map((s) => [
                    s.service_date,
                    s.name,
                    s.total,
                    s.first_timers,
                  ])}
                />
              </div>

              {ctx.can("groups") && (
                <div>
                  <h2 className="mb-2 text-base font-semibold">By group</h2>
                  <ReportTable
                    head={["Group", "Members", "Attendances"]}
                    rows={(insights?.groups ?? []).map((g) => [
                      g.group_name,
                      g.members,
                      g.attendances,
                    ])}
                  />
                </div>
              )}

              {ctx.can("branches") && (
                <div>
                  <h2 className="mb-2 text-base font-semibold">By branch</h2>
                  <ReportTable
                    head={["Branch", "Members", "Attendances"]}
                    rows={(insights?.branches ?? []).map((b) => [
                      b.branch,
                      b.members,
                      b.attendances,
                    ])}
                  />
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReportTable({ head, rows }: { head: string[]; rows: Array<Array<string | number>> }) {
  return (
    <div className="surface overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-border">
          <tr className="text-left">
            {head.map((h) => (
              <th key={h} className="px-4 py-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/60 last:border-0">
              {r.map((c, j) => (
                <td key={j} className="px-4 py-2.5">
                  {c}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={head.length} className="px-4 py-10 text-center text-muted-foreground">
                Nothing to show yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
