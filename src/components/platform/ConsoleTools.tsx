import { useMemo, useState } from "react";
import { Bell, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { planLabel } from "@/lib/pricing";

type Tenant = { id: string; name: string; subdomain: string; tier: string; contact_email: string | null; approval_status: string; trial_ends_at: string | null; created_at: string };
type Snap = { tenants: Tenant[]; payments: Array<{ id: string; tenant_id: string; reference: string; status: string; created_at: string }>; operators: Array<{ username: string }> };

export function ConsoleSearch({ d, go }: { d: Snap; go: (section: string) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    const churches = d.tenants.filter((t) => `${t.name} ${t.subdomain} ${t.contact_email ?? ""}`.toLowerCase().includes(s)).slice(0, 6).map((t) => ({ key: t.id, label: t.name, sub: `/c/${t.subdomain} · ${planLabel(t.tier)}`, section: "churches" }));
    const pays = d.payments.filter((p) => p.reference.toLowerCase().includes(s)).slice(0, 4).map((p) => ({ key: p.id, label: p.reference, sub: `Payment · ${p.status}`, section: "revenue" }));
    const ops = d.operators.filter((o) => o.username.toLowerCase().includes(s)).slice(0, 3).map((o) => ({ key: o.username, label: o.username, sub: "Operator", section: "operators" }));
    return [...churches, ...pays, ...ops];
  }, [q, d]);
  return (
    <Popover open={open && results.length > 0} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative ml-2 hidden w-64 md:block">
          <Search className="absolute left-2.5 top-2 size-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} placeholder="Search churches, payments…" className="h-8 pl-8 text-sm" />
        </div>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-1" onOpenAutoFocus={(e) => e.preventDefault()}>
        {results.map((r) => (
          <button key={r.key} onClick={() => { go(r.section); setOpen(false); setQ(""); }} className="block w-full rounded-md px-3 py-2 text-left hover:bg-muted">
            <p className="text-sm font-medium">{r.label}</p>
            <p className="text-xs text-muted-foreground">{r.sub}</p>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export function ConsoleBell({ d, pendingReviews, go }: { d: Snap; pendingReviews: number; go: (section: string) => void }) {
  const items = useMemo(() => {
    const week = Date.now() + 7 * 864e5;
    const dayAgo = Date.now() - 3 * 864e5;
    const out: Array<{ key: string; text: string; section: string }> = [];
    d.tenants.filter((t) => t.approval_status === "pending_approval").forEach((t) => out.push({ key: `a${t.id}`, text: `${t.name} is waiting for approval`, section: "pending" }));
    d.payments.filter((p) => p.status === "failed" && new Date(p.created_at).getTime() > dayAgo).forEach((p) => out.push({ key: `p${p.id}`, text: `Payment failed: ${d.tenants.find((t) => t.id === p.tenant_id)?.name ?? p.reference}`, section: "revenue" }));
    d.tenants.filter((t) => t.trial_ends_at && new Date(t.trial_ends_at).getTime() > Date.now() && new Date(t.trial_ends_at).getTime() < week).forEach((t) => out.push({ key: `t${t.id}`, text: `${t.name}'s trial ends ${new Date(t.trial_ends_at!).toLocaleDateString()}`, section: "overview" }));
    if (pendingReviews) out.push({ key: "reviews", text: `${pendingReviews} review${pendingReviews === 1 ? "" : "s"} to approve`, section: "reviews" });
    return out;
  }, [d, pendingReviews]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="size-5" />
          {items.length > 0 && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">{items.length}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-1">
        <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Needs attention</p>
        {items.map((i) => (
          <button key={i.key} onClick={() => go(i.section)} className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted">{i.text}</button>
        ))}
        {!items.length && <p className="px-3 py-4 text-center text-sm text-muted-foreground">All clear.</p>}
      </PopoverContent>
    </Popover>
  );
}
