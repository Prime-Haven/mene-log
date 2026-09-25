import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Building2, Copy, Plus } from "lucide-react";
import { useTenant } from "@/hooks/useTenant";
import { createBranch, listBranches, manageBranch } from "@/lib/branches.functions";
import { UpgradePanel } from "@/components/FeatureGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/branches")({
  head: () => ({
    meta: [
      { title: "Branches — Mene:Log" },
      { name: "description", content: "Create branches with their own check-in pages and see how every branch is doing." },
      { property: "og:title", content: "Branches — Mene:Log" },
      { property: "og:description", content: "Run every branch of your church from head office." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BranchesPage,
});

function BranchesPage() {
  const { tenant, isAdmin, isOwner, can, isBranch } = useTenant();
  const qc = useQueryClient();
  const listFn = useServerFn(listBranches);
  const createFn = useServerFn(createBranch);
  const manageFn = useServerFn(manageBranch);
  const [f, setF] = useState({ name: "", subdomain: "", city: "", admin_email: "" });
  const [adding, setAdding] = useState(false);
  const allowed = can("branches") && !isBranch && isAdmin;

  const q = useQuery({ queryKey: ["branches", tenant?.id], enabled: !!tenant && allowed, queryFn: () => listFn({ data: { tenant_id: tenant!.id } }) });
  const create = useMutation({
    mutationFn: () => createFn({ data: { tenant_id: tenant!.id, ...f } }),
    onSuccess: (r) => { if (r.ok) { toast.success(r.message); setF({ name: "", subdomain: "", city: "", admin_email: "" }); setAdding(false); qc.invalidateQueries({ queryKey: ["branches"] }); } else toast.error(r.message); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create branch"),
  });
  const manage = useMutation({
    mutationFn: (v: { branch_id: string; action: "approve" | "reject" | "suspend" | "restore" | "remove" }) => manageFn({ data: { tenant_id: tenant!.id, ...v } }),
    onSuccess: (r) => { toast.success(r.message); qc.invalidateQueries({ queryKey: ["branches"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update branch"),
  });

  if (!tenant) return null;
  if (!allowed) return <UpgradePanel feature="branches" canUpgrade={isOwner} />;

  const rows = q.data ?? [];
  const active = rows.filter((b) => !b.pending);
  const pending = rows.filter((b) => b.pending);
  const total = (k: "members" | "checkins30" | "leaders") => active.reduce((n, b) => n + b[k], 0);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const confirmThen = (msg: string, fn: () => void) => { if (window.confirm(msg)) fn(); };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-eyebrow">Head office</p>
          <h1 className="mt-1 font-display text-2xl font-bold">Branches</h1>
          <p className="mt-1 text-sm text-muted-foreground">Each branch has its own check-in page, dashboard and leaders, with Pro features included.</p>
        </div>
        <Button onClick={() => setAdding((v) => !v)}><Plus className="size-4" /> New branch</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[["Branches", active.length], ["Members", total("members")], ["Check-ins (30 days)", total("checkins30")], ["Leaders", total("leaders")]].map(([k, v]) => (
          <div key={k} className="surface p-4"><p className="text-xs text-muted-foreground">{k}</p><p className="mt-1 font-display text-2xl font-bold">{Number(v).toLocaleString()}</p></div>
        ))}
      </div>

      {adding && (
        <form className="surface grid gap-4 p-5 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <div className="space-y-1.5"><Label>Branch name</Label><Input required minLength={2} maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={`${tenant.name} — Kumasi`} /></div>
          <div className="space-y-1.5"><Label>Check-in address</Label><div className="flex items-center gap-1 text-sm text-muted-foreground">/c/<Input required minLength={3} maxLength={40} value={f.subdomain} onChange={(e) => setF({ ...f, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} placeholder={`${tenant.subdomain}-kumasi`} /></div></div>
          <div className="space-y-1.5"><Label>Town or city</Label><Input maxLength={80} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Branch administrator's email</Label><Input required type="email" value={f.admin_email} onChange={(e) => setF({ ...f, admin_email: e.target.value })} /></div>
          <div className="flex gap-2 sm:col-span-2"><Button type="submit" disabled={create.isPending}>{create.isPending ? "Creating…" : "Create branch"}</Button><Button type="button" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button></div>
        </form>
      )}

      {pending.length > 0 && (
        <div className="surface p-5">
          <p className="font-semibold">Branch requests</p>
          <p className="text-xs text-muted-foreground">Sent from the Branches tab on your check-in page.</p>
          <div className="mt-3 divide-y">
            {pending.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div><p className="font-semibold">{b.name} <span className="font-normal text-muted-foreground">· /c/{b.subdomain}</span></p><p className="text-xs text-muted-foreground">{b.request?.contact_name} · {b.request?.email} · {b.request?.phone}</p></div>
                <div className="flex gap-2"><Button size="sm" disabled={manage.isPending} onClick={() => manage.mutate({ branch_id: b.id, action: "approve" })}>Approve</Button><Button size="sm" variant="outline" disabled={manage.isPending} onClick={() => confirmThen(`Decline ${b.name}?`, () => manage.mutate({ branch_id: b.id, action: "reject" }))}>Decline</Button></div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="surface divide-y overflow-hidden">
        {q.isLoading && <p className="p-6 text-center text-sm text-muted-foreground">Loading branches…</p>}
        {q.isError && <p className="p-6 text-center text-sm text-destructive">Could not load branches. Refresh to try again.</p>}
        {!q.isLoading && !active.length && !q.isError && (
          <div className="p-10 text-center"><Building2 className="mx-auto size-8 text-muted-foreground" /><p className="mt-3 font-semibold">No branches yet</p><p className="mt-1 text-sm text-muted-foreground">Create one above, or share your check-in page — branches can request to join from its Branches tab.</p></div>
        )}
        {active.map((b) => (
          <div key={b.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <div className="flex items-center gap-2"><p className="font-semibold">{b.name}</p><Badge variant={b.status === "active" ? "default" : "outline"} className="capitalize">{b.status}</Badge></div>
              <p className="mt-0.5 text-xs text-muted-foreground">{b.members} members · {b.checkins30} check-ins (30d) · {b.leaders} leaders · {b.services} services · last activity {b.last_activity ? new Date(b.last_activity).toLocaleDateString() : "—"}</p>
              <div className="mt-1.5 flex items-center gap-2 text-xs">
                <Link to="/c/$subdomain" params={{ subdomain: b.subdomain }} target="_blank" className="text-primary hover:underline">/c/{b.subdomain}</Link>
                <button onClick={() => { navigator.clipboard.writeText(`${origin}/c/${b.subdomain}`); toast.success("Link copied"); }} aria-label="Copy check-in link" className="text-muted-foreground hover:text-foreground"><Copy className="size-3.5" /></button>
              </div>
            </div>
            <div className="flex gap-2">
              {b.status === "active"
                ? <Button size="sm" variant="outline" disabled={manage.isPending} onClick={() => confirmThen(`Suspend ${b.name}? Its check-in page and dashboard will stop working.`, () => manage.mutate({ branch_id: b.id, action: "suspend" }))}>Suspend</Button>
                : <Button size="sm" variant="outline" disabled={manage.isPending} onClick={() => manage.mutate({ branch_id: b.id, action: "restore" })}>Restore</Button>}
              <Button size="sm" variant="ghost" className="text-destructive" disabled={manage.isPending} onClick={() => confirmThen(`Remove ${b.name}? The branch will be closed.`, () => manage.mutate({ branch_id: b.id, action: "remove" }))}>Remove</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
