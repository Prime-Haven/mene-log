import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";

export const Route = createFileRoute("/_app/audit")({
  head: () => ({
    meta: [
      { title: "Audit log — Mene" },
      {
        name: "description",
        content: "Append-only record of every sensitive action taken in your church account.",
      },
      { property: "og:title", content: "Audit log — Mene" },
      { property: "og:description", content: "Every sensitive action, recorded and retained." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Audit,
});

function Audit() {
  const { tenant } = useTenant();

  const { data: events } = useQuery({
    queryKey: ["audit", tenant?.id],
    enabled: !!tenant,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_events")
        .select("id, action, target, detail, source_ip, created_at")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-eyebrow">Accountability</p>
        <h1 className="mt-2 text-2xl font-bold">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Append-only and retained for 24 months. Only you, as the owner, can read it.
        </p>
      </div>

      <div className="surface divide-y divide-border">
        {(events ?? []).map((e) => (
          <div
            key={e.id}
            className="flex flex-wrap items-baseline justify-between gap-2 p-4 text-sm"
          >
            <div>
              <p className="font-medium">{e.action}</p>
              <p className="font-mono text-xs text-muted-foreground">{e.target ?? "—"}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              {new Date(e.created_at).toLocaleString()} {e.source_ip ? `· ${e.source_ip}` : ""}
            </p>
          </div>
        ))}
        {(events ?? []).length === 0 && (
          <p className="p-6 text-center text-sm text-muted-foreground">No events recorded yet.</p>
        )}
      </div>
    </div>
  );
}
