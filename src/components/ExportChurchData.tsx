import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { exportChurchData } from "@/lib/export.functions";
import { Button } from "@/components/ui/button";

export function ExportChurchData({ tenantId, subdomain }: { tenantId: string; subdomain: string }) {
  const run = useServerFn(exportChurchData);
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try {
      const { base64 } = await run({ data: { tenantId } });
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${subdomain}-menelog-export-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not export");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Download className="size-4 text-primary" /> Export church data
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Download members, services, attendance, leaders and follow-ups as spreadsheet (CSV) files in
        one ZIP. Up to 3 exports per hour.
      </p>
      <Button size="sm" className="mt-4" disabled={busy} onClick={go}>
        {busy ? "Preparing…" : "Download ZIP"}
      </Button>
    </section>
  );
}
