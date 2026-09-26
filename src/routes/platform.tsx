import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity, AlertTriangle, BarChart3, Building2, Check, CircleDollarSign, ClipboardList, Database, Download, HeartPulse, KeyRound,
  LayoutDashboard, LogOut, Mail, Megaphone, Menu, Pencil, Plus, RefreshCw, Search, ShieldCheck, Star, UserCog, Users, X, Hourglass, ToggleRight, Lock,
} from "lucide-react";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { planLabel } from "@/lib/pricing";
import { ENTITLEMENTS, FEATURE_KEYS, FEATURE_LABELS, LIMIT_KEYS, LIMIT_LABELS } from "@/lib/entitlements";
import { usePlanConfig } from "@/hooks/useTenant";
import { ConsoleSettings } from "@/components/platform/ConsoleSettings";
import { ConsoleSearch, ConsoleBell } from "@/components/platform/ConsoleTools";
import { healthCheck, consoleSnapshot, operatorAction, type OperatorActionInput } from "@/lib/operator.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { staggerContainer, fadeUp } from "@/lib/animations";
import { MeneLogLogo } from "@/components/MeneLogLogo";

export const Route = createFileRoute("/platform")({ ssr: false, head: () => ({ meta: [
  { title: "Prime Haven console — Mene:Log" },
  { name: "description", content: "Prime Haven operations: churches, packages, revenue, growth, storage and platform health for Mene:Log." },
  { property: "og:title", content: "Prime Haven console — Mene:Log" },
  { property: "og:description", content: "Prime Haven operations: churches, packages, revenue, growth, storage and platform health." },
  { property: "og:type", content: "website" },
  { name: "twitter:card", content: "summary" },
  { name: "robots", content: "noindex, nofollow" },
] }), component: Platform });

type Snapshot = Awaited<ReturnType<typeof consoleSnapshot>>;
type Tenant = Snapshot["tenants"][number];
type Tier = "free" | "basic" | "standard" | "premium";
type Status = "active" | "grace" | "suspended" | "closed";
type Review = { id: string; church_name: string; quote: string; rating: number; author_name: string; author_role: string; status: string; created_at: string };
type Form = { id?: string; name: string; subdomain: string; tier: Tier; status: Status; contact_email: string; contact_phone: string };
const emptyForm: Form = { name: "", subdomain: "", tier: "free", status: "active", contact_email: "", contact_phone: "" };

const fmtDate = (v: string | null | undefined) => (v ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(v)) : "—");
const fmtDateTime = (v: string | null | undefined) => (v ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(v)) : "—");
const fmtBytes = (b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : b < 1073741824 ? `${(b / 1048576).toFixed(1)} MB` : `${(b / 1073741824).toFixed(2)} GB`);
const usd = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const paymentUsd = (p: { amount_kobo: number; currency: string }) => (p.currency === "USD" ? p.amount_kobo / 100 : 0);
const yearly = (ref: string) => ref.startsWith("gchy");

function downloadCsv(name: string, rows: Array<Record<string, unknown>>) {
  if (!rows.length) { toast.error("Nothing to export"); return; }
  const cols = Object.keys(rows[0]!);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(typeof r[c] === "object" ? JSON.stringify(r[c]) : r[c])).join(","))].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = name; a.click();
}

const NAV = [
  { group: "Oversight", items: [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "churches", label: "Churches", icon: Building2 },
    { id: "pending", label: "Approvals", icon: Hourglass },
    { id: "features", label: "Features", icon: ToggleRight },
  ] },
  { group: "Business", items: [
    { id: "revenue", label: "Revenue & billing", icon: CircleDollarSign },
    { id: "growth", label: "Growth & usage", icon: BarChart3 },
    { id: "database", label: "Database & storage", icon: Database },
  ] },
  { group: "Communication", items: [
    { id: "messaging", label: "Messaging health", icon: Mail },
    { id: "reviews", label: "Reviews", icon: Star },
    { id: "announce", label: "Announcements", icon: Megaphone },
  ] },
  { group: "Control", items: [
    { id: "operators", label: "Operators", icon: UserCog },
    { id: "audit", label: "Audit log", icon: ClipboardList },
    { id: "health", label: "System health", icon: HeartPulse },
    { id: "account", label: "Settings", icon: KeyRound },
  ] },
] as const;
type Section = (typeof NAV)[number]["items"][number]["id"];

function Platform() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const snapshotFn = useServerFn(consoleSnapshot);
  const actionFn = useServerFn(operatorAction);
  const [section, setSection] = useState<Section>("overview");
  const [mobileNav, setMobileNav] = useState(false);

  const operator = useQuery({ queryKey: ["platform-access", session?.user.id], enabled: !!session, retry: false, queryFn: async () => { const { data, error } = await supabase.rpc("is_platform_admin"); if (error) throw error; return data === true; } });
  const isOperator = operator.data === true;
  const snap = useQuery({ queryKey: ["platform-snapshot"], enabled: isOperator, retry: false, staleTime: 30_000, queryFn: () => snapshotFn() });
  const reviews = useQuery({ queryKey: ["platform-reviews"], enabled: isOperator, retry: false, queryFn: async () => { const { data, error } = await supabase.rpc("platform_reviews"); if (error) throw error; return (data ?? []) as Review[]; } });

  const refresh = () => { qc.invalidateQueries({ queryKey: ["platform-snapshot"] }); qc.invalidateQueries({ queryKey: ["platform-reviews"] }); };
  const act = useMutation({
    mutationFn: (input: OperatorActionInput) => actionFn({ data: input }),
    onSuccess: (r) => { toast.success(r?.message ?? "Done"); refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Action failed"),
  });
  const rpc = useMutation({
    mutationFn: async ({ fn, args, done }: { fn: string; args: Record<string, unknown>; done: string }) => { const { error } = await supabase.rpc(fn as "platform_overview", args as never); if (error) throw error; return done; },
    onSuccess: (done) => { toast.success(done); refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Action failed"),
  });

  if (loading || operator.isLoading) return <Centered>Loading Prime Haven console…</Centered>;
  if (!isOperator) return <div className="grid min-h-screen place-items-center px-5 text-center"><div><ShieldCheck className="mx-auto size-8 text-muted-foreground" /><h1 className="mt-4 text-xl font-bold">Prime Haven access only</h1><p className="mt-2 text-sm text-muted-foreground">Sign in with your operator username, password and two-step code.</p><Button asChild className="mt-5"><Link to="/super-admin">Operator sign in</Link></Button></div></div>;

  const signOut = async () => { await qc.cancelQueries(); qc.clear(); await supabase.auth.signOut(); navigate({ to: "/super-admin", replace: true }); };
  const d = snap.data;
  const pendingCount = d?.tenants.filter((t) => t.approval_status === "pending_approval").length ?? 0;
  const pendingReviews = reviews.data?.filter((r) => r.status === "pending").length ?? 0;

  const nav = (
    <nav className="space-y-5">
      {NAV.map((g) => (
        <div key={g.group}>
          <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-deep-foreground/50">{g.group}</p>
          {g.items.map(({ id, label, icon: Icon }) => {
            const badge = id === "pending" ? pendingCount : id === "reviews" ? pendingReviews : 0;
            return (
              <button key={id} onClick={() => { setSection(id); setMobileNav(false); }} className={`relative flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${section === id ? "text-deep-foreground" : "text-deep-foreground/65 hover:bg-deep-foreground/5 hover:text-deep-foreground"}`}>
                {section === id && <motion.span layoutId="op-nav" className="absolute inset-0 rounded-md bg-primary/25" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                <Icon className="relative size-4" /><span className="relative">{label}</span>
                {badge > 0 && <span className="relative ml-auto rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">{badge}</span>}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-muted/25">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col overflow-y-auto bg-deep p-4 text-deep-foreground lg:flex">
        <Brand />
        <div className="mt-6 flex-1">{nav}</div>
        <Button variant="ghost" size="sm" className="justify-start text-deep-foreground/70 hover:bg-deep-foreground/10 hover:text-deep-foreground" onClick={signOut}><LogOut className="size-4" /> Sign out</Button>
      </aside>
      <Sheet open={mobileNav} onOpenChange={setMobileNav}>
        <SheetContent side="left" className="w-64 border-0 bg-deep p-4 text-deep-foreground"><SheetHeader className="sr-only"><SheetTitle>Menu</SheetTitle><SheetDescription>Console sections</SheetDescription></SheetHeader><Brand /><div className="mt-6">{nav}</div><Button variant="ghost" size="sm" className="mt-6 text-deep-foreground/70" onClick={signOut}><LogOut className="size-4" /> Sign out</Button></SheetContent>
      </Sheet>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur-xl sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu className="size-5" /></Button>
          <p className="text-sm font-semibold">{(NAV.flatMap((g) => [...g.items]) as Array<{ id: string; label: string }>).find((i) => i.id === section)?.label}</p>
          {d && <ConsoleSearch d={d} go={(sec) => setSection(sec as Section)} />}
          {d && <ConsoleBell d={d} pendingReviews={pendingReviews} go={(sec) => setSection(sec as Section)} />}
          <span className="ml-auto hidden text-xs text-muted-foreground xl:inline">{d ? `Updated ${fmtDateTime(d.generated_at)}` : ""}</span>
          <Button variant="outline" size="sm" onClick={refresh} disabled={snap.isFetching}><RefreshCw className={`size-4 ${snap.isFetching ? "animate-spin" : ""}`} /> Refresh</Button>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 pb-24 sm:px-6 lg:pb-6">
          {snap.isLoading ? <Centered>Gathering platform figures…</Centered> : snap.isError || !d ? (
            <div className="surface p-8 text-center"><AlertTriangle className="mx-auto size-6 text-destructive" /><p className="mt-3 font-semibold">Could not load the console</p><p className="mt-1 text-sm text-muted-foreground">{snap.error instanceof Error ? snap.error.message : "Try again."}</p><Button className="mt-4" onClick={refresh}>Try again</Button></div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div key={section} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                {section === "overview" && <Overview d={d} go={setSection} />}
                {section === "churches" && <Churches d={d} act={act} rpc={rpc} />}
                {section === "pending" && <Pending d={d} rpc={rpc} />}
                {section === "features" && <Features />}
                {section === "revenue" && <Revenue d={d} />}
                {section === "growth" && <Growth d={d} />}
                {section === "database" && <DatabaseView d={d} />}
                {section === "messaging" && <Messaging d={d} act={act} />}
                {section === "reviews" && <Reviews reviews={reviews.data ?? []} rpc={rpc} />}
                {section === "announce" && <Announce d={d} act={act} />}
                {section === "operators" && <Operators d={d} act={act} />}
                {section === "audit" && <AuditView d={d} />}
                {section === "health" && <Health d={d} />}
                {section === "account" && <ConsoleSettings act={act} username={d.operators.find((o) => o.is_me)?.username ?? "operator"} lastSignIn={d.operators.find((o) => o.is_me)?.last_sign_in_at ?? null} />}
              </motion.div>
            </AnimatePresence>
          )}
        </main>
        <nav aria-label="Console quick navigation" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
          {(NAV.flatMap((g) => [...g.items]) as Array<{ id: string; label: string; icon: typeof KeyRound }>).filter((i) => ["overview", "churches", "pending", "health", "account"].includes(i.id)).map((i) => (
            <button key={i.id} onClick={() => setSection(i.id as Section)} className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${section === i.id ? "text-primary" : "text-muted-foreground"}`}>
              <i.icon className="size-5" /><span className="truncate">{i.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

type Act = ReturnType<typeof useMutation<{ ok: boolean; message: string } | undefined, Error, OperatorActionInput>>;
type Rpc = ReturnType<typeof useMutation<string, Error, { fn: string; args: Record<string, unknown>; done: string }>>;

function Centered({ children }: { children: React.ReactNode }) { return <div className="grid min-h-[50vh] place-items-center text-sm text-muted-foreground">{children}</div>; }
function Brand() { return <div className="px-1"><MeneLogLogo variant="light" className="h-10 max-w-48" /><p className="mt-1 text-[10px] uppercase tracking-widest text-deep-foreground/55">Prime Haven console</p></div>; }
function Title({ eyebrow, title, sub, children }: { eyebrow: string; title: string; sub?: string; children?: React.ReactNode }) {
  return <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-eyebrow">{eyebrow}</p><h1 className="mt-1 font-display text-2xl font-bold">{title}</h1>{sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}</div>{children}</div>;
}
function Kpis({ items }: { items: Array<{ label: string; value: string | number; icon: typeof Users; tone?: string }> }) {
  return <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{items.map(({ label, value, icon: Icon, tone }) => <motion.div variants={fadeUp} key={label} className="surface p-4"><Icon className={`size-4 ${tone ?? "text-primary"}`} /><p className="mt-3 text-2xl font-bold tabular-nums">{value}</p><p className="mt-0.5 text-xs text-muted-foreground">{label}</p></motion.div>)}</motion.div>;
}
function Bars({ data, label }: { data: Array<{ key: string; value: number }>; label: (v: number) => string }) {
  const max = Math.max(1, ...data.map((x) => x.value));
  return <div className="flex h-44 items-end gap-1.5">{data.map((x) => <div key={x.key} className="group flex flex-1 flex-col items-center gap-1"><span className="text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">{label(x.value)}</span><motion.div initial={{ height: 0 }} animate={{ height: `${(x.value / max) * 100}%` }} transition={{ duration: 0.5 }} className="w-full min-h-[2px] rounded-t bg-primary/80" /><span className="truncate text-[9px] text-muted-foreground">{x.key}</span></div>)}</div>;
}
function Empty({ children }: { children: React.ReactNode }) { return <p className="p-10 text-center text-sm text-muted-foreground">{children}</p>; }

function revenueStats(d: Snapshot) {
  const ok = d.payments.filter((p) => p.status === "success");
  const within = (days: number) => ok.filter((p) => new Date(p.paid_at ?? p.created_at) > new Date(Date.now() - days * 864e5)).reduce((s, p) => s + paymentUsd(p), 0);
  return { ok, m30: within(30), y365: within(365), total: ok.reduce((s, p) => s + paymentUsd(p), 0) };
}

function Overview({ d, go }: { d: Snapshot; go: (s: Section) => void }) {
  const t = d.tenants;
  const n = (s: string) => t.filter((x) => x.status === s).length;
  const trial = t.filter((x) => x.trial_ends_at && new Date(x.trial_ends_at) > new Date());
  const since = (days: number) => t.filter((x) => new Date(x.created_at) > new Date(Date.now() - days * 864e5)).length;
  const r = revenueStats(d);
  const members = t.reduce((s, x) => s + x.usage.members, 0);
  const checkins = t.reduce((s, x) => s + x.usage.attendance, 0);
  const endingSoon = trial.filter((x) => new Date(x.trial_ends_at!) < new Date(Date.now() + 7 * 864e5));
  const byTier = (["free", "basic", "standard", "premium"] as const).map((k) => ({ k, n: t.filter((x) => x.tier === k).length, rev: r.ok.filter((p) => p.tier === k).reduce((s, p) => s + paymentUsd(p), 0) }));
  return <>
    <Title eyebrow="Platform overview" title={`Good to see you, ${d.operators.find((o) => o.is_me)?.username ?? "operator"}`} sub="Everything on Mene:Log at a glance. Church member records stay private — you see counts only." />
    <Kpis items={[
      { label: "Churches registered", value: t.length, icon: Building2 }, { label: "Active", value: n("active"), icon: Activity },
      { label: "On trial", value: trial.length, icon: Hourglass }, { label: "Suspended · closed", value: `${n("suspended")} · ${n("closed")}`, icon: AlertTriangle, tone: "text-destructive" },
      { label: "New this week · month", value: `${since(7)} · ${since(30)}`, icon: Plus }, { label: "Members (all churches)", value: members.toLocaleString(), icon: Users },
      { label: "Check-ins recorded", value: checkins.toLocaleString(), icon: Check }, { label: "Revenue · 30 days / 12 months", value: `${usd(r.m30)} / ${usd(r.y365)}`, icon: CircleDollarSign },
    ]} />
    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      <div className="surface p-5"><p className="font-semibold">Plans and revenue</p><div className="mt-3 divide-y">{byTier.map((x) => <div key={x.k} className="flex items-center justify-between py-2.5 text-sm"><span>{planLabel(x.k)}</span><span className="text-muted-foreground">{x.n} churches · {usd(x.rev)}</span></div>)}</div></div>
      <div className="surface p-5"><div className="flex items-center justify-between"><p className="font-semibold">Trials ending within 7 days</p><Button size="sm" variant="ghost" onClick={() => go("churches")}>All churches</Button></div><div className="mt-3 divide-y">{endingSoon.map((x) => <div key={x.id} className="flex justify-between py-2.5 text-sm"><span>{x.name}</span><span className="text-muted-foreground">{fmtDate(x.trial_ends_at)}</span></div>)}{!endingSoon.length && <p className="py-6 text-center text-sm text-muted-foreground">No trials ending this week.</p>}</div></div>
    </div>
  </>;
}

function Churches({ d, act, rpc }: { d: Snapshot; act: Act; rpc: Rpc }) {
  const [q, setQ] = useState(""); const [tier, setTier] = useState("all"); const [status, setStatus] = useState("all"); const [approval, setApproval] = useState("all"); const [kind, setKind] = useState("all");
  const [open, setOpen] = useState<string | null>(null); const [form, setForm] = useState<Form | null>(null);
  const list = useMemo(() => d.tenants.filter((c) => (tier === "all" || c.tier === tier) && (status === "all" || c.status === status) && (approval === "all" || c.approval_status === approval) && (kind === "all" || (kind === "branch" ? !!c.parent_tenant_id : kind === "head" ? d.tenants.some((x) => x.parent_tenant_id === c.id) : !c.parent_tenant_id)) && `${c.name} ${c.subdomain} ${c.contact_email ?? ""}`.toLowerCase().includes(q.toLowerCase())), [d, q, tier, status, approval, kind]);
  const approvals = [...new Set(d.tenants.map((t) => t.approval_status))];
  const selected = d.tenants.find((t) => t.id === open) ?? null;
  const save = () => {
    if (!form) return;
    const args = { p_name: form.name, p_subdomain: form.subdomain, p_tier: form.tier, p_contact_email: form.contact_email, p_contact_phone: form.contact_phone };
    rpc.mutate(form.id ? { fn: "platform_update_tenant", args: { ...args, p_tenant: form.id, p_status: form.status }, done: "Church updated" } : { fn: "platform_create_tenant", args, done: "Church created" }, { onSuccess: () => setForm(null) });
  };
  return <>
    <Title eyebrow="Registry" title="Churches" sub={`${list.length} of ${d.tenants.length} churches`}>
      <div className="flex gap-2"><Button variant="outline" onClick={() => downloadCsv("churches.csv", list.map((c) => ({ name: c.name, subdomain: c.subdomain, plan: planLabel(c.tier), status: c.status, approval: c.approval_status, members: c.usage.members, staff: c.usage.staff, db_bytes: c.usage.bytes, created: c.created_at, email: c.contact_email })))}><Download className="size-4" /> Export</Button><Button onClick={() => setForm({ ...emptyForm })}><Plus className="size-4" /> New church</Button></div>
    </Title>
    <div className="surface mb-3 grid gap-2 p-3 md:grid-cols-[1fr_150px_150px_170px_150px]">
      <div className="relative"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search name, address or email" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <Select value={tier} onValueChange={setTier}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All plans</SelectItem>{(["free", "basic", "standard", "premium"] as const).map((k) => <SelectItem key={k} value={k}>{planLabel(k)}</SelectItem>)}</SelectContent></Select>
      <Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{["active", "grace", "suspended", "closed"].map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent></Select>
      <Select value={approval} onValueChange={setApproval}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All approvals</SelectItem>{approvals.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select>
      <Select value={kind} onValueChange={setKind}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All churches</SelectItem><SelectItem value="main">Main churches</SelectItem><SelectItem value="head">With branches</SelectItem><SelectItem value="branch">Branches only</SelectItem></SelectContent></Select>
    </div>
    <div className="surface divide-y overflow-hidden">
      {list.map((c) => <button key={c.id} onClick={() => setOpen(c.id)} className="grid w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/50 sm:grid-cols-[1fr_auto_auto_auto_auto]">
        <div><p className="font-semibold">{c.name}</p><p className="text-xs text-muted-foreground">/c/{c.subdomain} · joined {fmtDate(c.created_at)}{c.parent_tenant_id ? ` · branch of ${d.tenants.find((x) => x.id === c.parent_tenant_id)?.name ?? "a church"}` : ""}{d.tenants.some((x) => x.parent_tenant_id === c.id) ? ` · ${d.tenants.filter((x) => x.parent_tenant_id === c.id).length} branches` : ""}</p></div>
        <p className="text-xs text-muted-foreground">{c.usage.members} members · {fmtBytes(c.usage.bytes + c.storage_bytes)}</p>
        <Badge variant="secondary">{planLabel(c.tier)}</Badge>
        <Badge variant={c.status === "active" ? "default" : "outline"} className="capitalize">{c.status}</Badge>
        <span className="text-xs text-muted-foreground">{c.approval_status.replace(/_/g, " ")}</span>
      </button>)}
      {!list.length && <Empty>No churches match these filters.</Empty>}
    </div>

    <Sheet open={!!selected} onOpenChange={(o) => !o && setOpen(null)}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">{selected && <ChurchDetail c={selected} d={d} act={act} rpc={rpc} edit={() => { setForm({ id: selected.id, name: selected.name, subdomain: selected.subdomain, tier: selected.tier as Tier, status: selected.status as Status, contact_email: selected.contact_email ?? "", contact_phone: selected.contact_phone ?? "" }); setOpen(null); }} />}</SheetContent>
    </Sheet>

    <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}><DialogContent><DialogHeader><DialogTitle>{form?.id ? "Edit church account" : "Create church"}</DialogTitle><DialogDescription>Account details only. Church records stay private.</DialogDescription></DialogHeader>
      {form && <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2"><Label>Church name</Label><Input required minLength={2} maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-2"><Label>Check-in address</Label><Input required pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]" value={form.subdomain} onChange={(e) => setForm({ ...form, subdomain: e.target.value.toLowerCase() })} /></div>
          <div className="space-y-2"><Label>Plan</Label><Select value={form.tier} onValueChange={(v) => setForm({ ...form, tier: v as Tier })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(["free", "basic", "standard", "premium"] as const).map((k) => <SelectItem key={k} value={k}>{planLabel(k)}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>Contact email</Label><Input type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} /></div>
          <div className="space-y-2"><Label>Contact phone</Label><Input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} /></div>
          {form.id && <div className="space-y-2"><Label>Status</Label><Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Status })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["active", "grace", "suspended", "closed"].map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent></Select></div>}
        </div>
        <DialogFooter><Button type="button" variant="outline" onClick={() => setForm(null)}>Cancel</Button><Button type="submit" disabled={rpc.isPending}>{rpc.isPending ? "Saving…" : "Save"}</Button></DialogFooter>
      </form>}
    </DialogContent></Dialog>
  </>;
}

function ChurchDetail({ c, d, act, rpc, edit }: { c: Tenant; d: Snapshot; act: Act; rpc: Rpc; edit: () => void }) {
  const [notes, setNotes] = useState(c.admin_notes ?? "");
  const pays = d.payments.filter((p) => p.tenant_id === c.id);
  const sub = c.sub as { period_end?: string; auto_renew?: boolean; payment_method?: string } | null;
  const row = (k: string, v: React.ReactNode) => <div><p className="text-xs text-muted-foreground">{k}</p><p className="text-sm font-semibold">{v}</p></div>;
  const setStatus = (next: Status, verb: string) => { if (window.confirm(`${verb} ${c.name}?`)) rpc.mutate({ fn: "platform_set_tenant_status", args: { p_tenant: c.id, p_status: next }, done: `Church ${next}` }); };
  return <>
    <SheetHeader><SheetTitle>{c.name}</SheetTitle><SheetDescription>/c/{c.subdomain} · account and health only</SheetDescription></SheetHeader>
    {(c.parent_tenant_id || d.tenants.some((x) => x.parent_tenant_id === c.id)) && <div className="mt-4 rounded-lg border p-3 text-sm">
      {c.parent_tenant_id ? <div className="flex items-center justify-between gap-2"><span>Branch of <b>{d.tenants.find((x) => x.id === c.parent_tenant_id)?.name ?? "—"}</b> · works as Pro</span><Button size="sm" variant="outline" onClick={() => { if (window.confirm(`Make ${c.name} a standalone church?`)) act.mutate({ type: "detach_branch", tenant_id: c.id }); }}>Detach</Button></div>
        : <><p className="font-semibold">Branches</p>{d.tenants.filter((x) => x.parent_tenant_id === c.id).map((b) => <p key={b.id} className="mt-1 flex justify-between text-xs"><span>{b.name} · /c/{b.subdomain}</span><span className="text-muted-foreground">{b.usage.members} members · {b.usage.attendance30} check-ins (30d)</span></p>)}</>}
    </div>}
    <div className="mt-5 grid grid-cols-2 gap-4 rounded-lg bg-muted/50 p-4">
      {row("Plan", planLabel(c.tier))}{row("Status", <span className="capitalize">{c.status}</span>)}
      {row("Approval", c.approval_status.replace(/_/g, " "))}{row("Trial ends", fmtDate(c.trial_ends_at))}
      {row("Renews", sub?.period_end?.startsWith("9999") ? "Never (free)" : fmtDate(sub?.period_end))}{row("Auto-renew", sub?.auto_renew ? `Yes · ${sub.payment_method}` : "No")}
      {row("Members", `${c.usage.members.toLocaleString()}`)}{row("Staff seats used", c.usage.staff)}
      {row("Extra member space", c.extra_member_slots ?? 0)}{row("Services held", c.usage.services)}
      {row("Check-ins · 30 days", c.usage.attendance30)}{row("Last activity", fmtDate(c.usage.last_activity))}
      {row("Database size", `${fmtBytes(c.usage.bytes)} (${c.usage.rows.toLocaleString()} rows)`)}{row("Files", fmtBytes(c.storage_bytes))}
      {row("Contact", c.contact_email ?? "—")}{row("Phone", c.contact_phone ?? "—")}
    </div>
    <div className="mt-4 flex items-center justify-between rounded-lg border p-3"><div><p className="text-sm font-semibold">Require two-step sign-in</p><p className="text-xs text-muted-foreground">For all of this church's staff</p></div><Switch checked={!!c.require_mfa} onCheckedChange={(v) => act.mutate({ type: "require_mfa", tenant_id: c.id, value: v })} /></div>
    <div className="mt-4 grid grid-cols-2 gap-2">
      <Button variant="outline" onClick={edit}><Pencil className="size-4" /> Edit / change plan</Button>
      <Button variant="outline" onClick={() => { const v = Number(window.prompt("Extend trial / subscription by how many days?", "30")); if (Number.isInteger(v) && v > 0) act.mutate({ type: "extend", tenant_id: c.id, days: v }); }}>Extend time</Button>
      <Button variant="outline" onClick={() => { const v = Number(window.prompt("Total extra member spaces:", String(c.extra_member_slots ?? 0))); if (Number.isInteger(v) && v >= 0) rpc.mutate({ fn: "platform_grant_space", args: { p_tenant: c.id, p_slots: v }, done: "Extra space updated" }); }}>Set extra space</Button>
      <Button variant="outline" onClick={() => act.mutate({ type: "resend_welcome", tenant_id: c.id })}><Mail className="size-4" /> Resend welcome</Button>
      {c.status === "active" ? <Button variant="destructive" onClick={() => setStatus("suspended", "Suspend")}>Suspend</Button> : <Button onClick={() => setStatus("active", "Restore")}>Restore</Button>}
      <Button variant="outline" className="text-destructive" disabled={c.status === "closed"} onClick={() => setStatus("closed", "Close")}>Close account</Button>
    </div>
    <div className="mt-5 space-y-2"><Label>Private Prime Haven notes</Label><Textarea rows={4} maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)} /><Button size="sm" onClick={() => act.mutate({ type: "notes", tenant_id: c.id, notes })}>Save notes</Button></div>
    <div className="mt-5"><p className="text-sm font-semibold">Payments</p><div className="mt-2 divide-y rounded-lg border">{pays.map((p) => <div key={p.id} className="flex justify-between p-3 text-sm"><span>{fmtDate(p.created_at)} · {planLabel(p.tier)} {yearly(p.reference) ? "yearly" : "monthly"}</span><span className="font-semibold">{p.currency} {(p.amount_kobo / 100).toFixed(2)} <Badge variant={p.status === "success" ? "default" : "outline"} className="ml-1 capitalize">{p.status}</Badge></span></div>)}{!pays.length && <p className="p-4 text-center text-xs text-muted-foreground">No payments yet</p>}</div></div>
  </>;
}

function Pending({ d, rpc }: { d: Snapshot; rpc: Rpc }) {
  const list = d.tenants.filter((c) => c.approval_status === "pending_approval");
  return <>
    <Title eyebrow="Onboarding" title="Approvals" sub="Churches waiting for Prime Haven approval." />
    <div className="surface divide-y">{list.map((c) => <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-semibold">{c.name}</p><p className="text-xs text-muted-foreground">/c/{c.subdomain} · {c.contact_email} · {planLabel(c.tier)}</p></div><div className="flex gap-2"><Button size="sm" onClick={() => rpc.mutate({ fn: "platform_approve_church", args: { p_tenant: c.id }, done: "Church approved" })}><Check className="size-4" /> Approve</Button><Button size="sm" variant="outline" onClick={() => { const reason = window.prompt("Reason for rejection?"); if (reason) rpc.mutate({ fn: "platform_reject_church", args: { p_tenant: c.id, p_reason: reason }, done: "Church rejected" }); }}>Reject</Button></div></div>)}{!list.length && <Empty>No churches waiting for approval.</Empty>}</div>
  </>;
}

function Revenue({ d }: { d: Snapshot }) {
  const [status, setStatus] = useState("all");
  const names = Object.fromEntries(d.tenants.map((t) => [t.id, t.name]));
  const r = revenueStats(d);
  const failed = d.payments.filter((p) => p.status === "failed");
  const list = d.payments.filter((p) => status === "all" || p.status === status);
  const months = Array.from({ length: 12 }, (_, i) => { const dt = new Date(); dt.setMonth(dt.getMonth() - (11 - i), 1); const key = dt.toISOString().slice(0, 7); return { key: key.slice(5), value: r.ok.filter((p) => (p.paid_at ?? p.created_at).startsWith(key)).reduce((s, p) => s + paymentUsd(p), 0) }; });
  const renewals = d.tenants.filter((t) => { const e = (t.sub as { period_end?: string } | null)?.period_end; return e && !e.startsWith("9999") && new Date(e) < new Date(Date.now() + 14 * 864e5); });
  return <>
    <Title eyebrow="Money" title="Revenue & billing" sub="Amounts in US dollars as recorded at checkout.">
      <Button variant="outline" onClick={() => downloadCsv("payments.csv", list.map((p) => ({ church: names[p.tenant_id], reference: p.reference, plan: planLabel(p.tier), interval: yearly(p.reference) ? "yearly" : "monthly", amount: p.amount_kobo / 100, currency: p.currency, status: p.status, channel: p.channel, created: p.created_at, paid: p.paid_at })))}><Download className="size-4" /> Export CSV</Button>
    </Title>
    <Kpis items={[{ label: "All-time revenue", value: usd(r.total), icon: CircleDollarSign }, { label: "Last 30 days", value: usd(r.m30), icon: CircleDollarSign }, { label: "Failed payments", value: failed.length, icon: AlertTriangle, tone: "text-destructive" }, { label: "Extra space purchases", value: d.space_requests.filter((s) => s.status === "applied" || s.status === "paid").length, icon: Plus }]} />
    <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
      <div className="surface p-5"><p className="mb-3 font-semibold">Revenue by month</p><Bars data={months} label={usd} /></div>
      <div className="surface p-5"><p className="font-semibold">Renewals in the next 14 days</p><div className="mt-2 divide-y">{renewals.map((t) => <div key={t.id} className="flex justify-between py-2 text-sm"><span>{t.name}</span><span className="text-muted-foreground">{fmtDate((t.sub as { period_end?: string }).period_end)}</span></div>)}{!renewals.length && <p className="py-6 text-center text-sm text-muted-foreground">None due.</p>}</div></div>
    </div>
    <div className="mt-4 flex justify-end"><Select value={status} onValueChange={setStatus}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All payments</SelectItem><SelectItem value="success">Successful</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="failed">Failed</SelectItem></SelectContent></Select></div>
    <div className="surface mt-2 divide-y">{list.slice(0, 300).map((p) => <div key={p.id} className="grid gap-2 p-3 text-sm sm:grid-cols-[1fr_auto_auto_auto]"><div><p className="font-medium">{names[p.tenant_id] ?? "Removed church"}</p><p className="text-xs text-muted-foreground">{fmtDateTime(p.created_at)} · {p.channel ?? "—"} · {p.reference}</p></div><Badge variant="secondary" className="w-fit">{planLabel(p.tier)} · {yearly(p.reference) ? "yearly" : "monthly"}</Badge><p className="font-semibold">{p.currency} {(p.amount_kobo / 100).toFixed(2)}</p><Badge variant={p.status === "success" ? "default" : "outline"} className="w-fit capitalize">{p.status}</Badge></div>)}{!list.length && <Empty>No payments yet.</Empty>}</div>
  </>;
}

function Growth({ d }: { d: Snapshot }) {
  const months = Array.from({ length: 12 }, (_, i) => { const dt = new Date(); dt.setMonth(dt.getMonth() - (11 - i), 1); const key = dt.toISOString().slice(0, 7); return { key: key.slice(5), value: d.tenants.filter((t) => t.created_at.startsWith(key)).length }; });
  const ranked = [...d.tenants].sort((a, b) => b.usage.attendance30 - a.usage.attendance30);
  return <>
    <Title eyebrow="Growth" title="Growth & usage" sub="Platform-wide counts. No individual member data." />
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="surface p-5"><p className="mb-3 font-semibold">New churches by month</p><Bars data={months} label={(v) => `${v}`} /></div>
      <div className="surface p-5"><p className="mb-3 font-semibold">Check-ins per week</p><Bars data={d.weekly.map((w) => ({ key: w.week.slice(5), value: w.checkins }))} label={(v) => `${v}`} /></div>
    </div>
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      {[{ t: "Most active churches (30 days)", l: ranked.slice(0, 8) }, { t: "Least active churches (30 days)", l: ranked.slice(-8).reverse() }].map((b) => <div key={b.t} className="surface p-5"><p className="font-semibold">{b.t}</p><div className="mt-2 divide-y">{b.l.map((t) => <div key={t.id} className="flex justify-between py-2 text-sm"><span>{t.name}</span><span className="text-muted-foreground">{t.usage.attendance30} check-ins · {t.usage.members} members</span></div>)}{!b.l.length && <p className="py-6 text-center text-sm text-muted-foreground">No churches yet.</p>}</div></div>)}
    </div>
  </>;
}

function DatabaseView({ d }: { d: Snapshot }) {
  const ranked = [...d.tenants].sort((a, b) => b.usage.bytes + b.storage_bytes - (a.usage.bytes + a.storage_bytes));
  const dbTotal = d.tenants.reduce((s, t) => s + t.usage.bytes, 0);
  const rows = d.tenants.reduce((s, t) => s + t.usage.rows, 0);
  const files = d.storage.reduce((s, b) => s + b.bytes, 0);
  const max = Math.max(1, ...ranked.map((t) => t.usage.bytes + t.storage_bytes));
  return <>
    <Title eyebrow="Capacity" title="Database & storage" sub="Sizes only. Sizes are estimated from each church's record counts." />
    <Kpis items={[{ label: "Church data (estimated)", value: fmtBytes(dbTotal), icon: Database }, { label: "Records across all churches", value: rows.toLocaleString(), icon: ClipboardList }, { label: "Stored files", value: fmtBytes(files), icon: Database }, { label: "Storage buckets", value: d.storage.length, icon: Database }]} />
    <div className="surface mt-4 divide-y">{ranked.map((t) => { const total = t.usage.bytes + t.storage_bytes; return <div key={t.id} className="p-3"><div className="flex justify-between text-sm"><span className="font-medium">{t.name}</span><span className="text-muted-foreground">{fmtBytes(total)} · {t.usage.rows.toLocaleString()} rows</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><motion.div initial={{ width: 0 }} animate={{ width: `${(total / max) * 100}%` }} className="h-full bg-primary" /></div></div>; })}{!ranked.length && <Empty>No churches yet.</Empty>}</div>
    <div className="surface mt-4 divide-y">{d.storage.map((b) => <div key={b.bucket} className="flex justify-between p-3 text-sm"><span className="font-medium">{b.bucket}</span><span className="text-muted-foreground">{b.files} files · {fmtBytes(b.bytes)}</span></div>)}</div>
  </>;
}

function Messaging({ d, act }: { d: Snapshot; act: Act }) {
  const sum = (k: "email_sent" | "sms_sent" | "failed" | "queued") => d.tenants.reduce((s, t) => s + t.messaging[k], 0);
  return <>
    <Title eyebrow="Delivery · last 30 days" title="Messaging health" sub="Counts only — message content is never shown.">
      <Button variant="outline" disabled={!sum("failed")} onClick={() => act.mutate({ type: "retry_failed", tenant_id: null })}><RefreshCw className="size-4" /> Retry all failed</Button>
    </Title>
    <Kpis items={[{ label: "Emails sent", value: sum("email_sent"), icon: Mail }, { label: "SMS sent", value: sum("sms_sent"), icon: Mail }, { label: "Failed", value: sum("failed"), icon: AlertTriangle, tone: "text-destructive" }, { label: "Waiting in queue", value: sum("queued"), icon: Hourglass }]} />
    <div className="surface mt-4 divide-y">{d.tenants.map((t) => <div key={t.id} className="grid items-center gap-2 p-3 text-sm sm:grid-cols-[1fr_auto_auto]"><span className="font-medium">{t.name}</span><span className="text-muted-foreground">{t.messaging.email_sent} email · {t.messaging.sms_sent} SMS · {t.messaging.failed} failed · {t.messaging.queued} queued</span><Button size="sm" variant="ghost" disabled={!t.messaging.failed} onClick={() => act.mutate({ type: "retry_failed", tenant_id: t.id })}>Retry</Button></div>)}</div>
  </>;
}

function Reviews({ reviews, rpc }: { reviews: Review[]; rpc: Rpc }) {
  const set = (id: string, status: string) => rpc.mutate({ fn: "platform_set_review_status", args: { p_review: id, p_status: status }, done: status === "approved" ? "Review is live on the homepage" : status === "rejected" ? "Review hidden" : "Review moved back to pending" });
  return <>
    <Title eyebrow="Homepage" title="Reviews" sub="Approved reviews appear on the homepage. Hide any at any time." />
    <div className="surface divide-y">{reviews.map((r) => <div key={r.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto]"><div><div className="flex items-center gap-2"><p className="font-semibold">{r.church_name}</p><div className="flex">{Array.from({ length: 5 }).map((_, i) => <Star key={i} className={`size-3.5 ${i < r.rating ? "fill-primary text-primary" : "text-muted-foreground"}`} />)}</div><Badge variant={r.status === "approved" ? "default" : "outline"} className="capitalize">{r.status}</Badge></div><p className="mt-1 text-sm">“{r.quote}”</p><p className="mt-1 text-xs text-muted-foreground">{r.author_name}{r.author_role ? ` · ${r.author_role}` : ""} · {fmtDate(r.created_at)}</p></div><div className="flex items-start gap-2">{r.status !== "approved" && <Button size="sm" onClick={() => set(r.id, "approved")}><Check className="size-4" /> Show</Button>}{r.status !== "rejected" && <Button size="sm" variant="outline" onClick={() => set(r.id, "rejected")}><X className="size-4" /> Hide</Button>}</div></div>)}{!reviews.length && <Empty>No reviews yet.</Empty>}</div>
  </>;
}

function Announce({ d, act }: { d: Snapshot; act: Act }) {
  const [subject, setSubject] = useState(""); const [body, setBody] = useState("");
  const [tiers, setTiers] = useState<Tier[]>(["free", "basic", "standard", "premium"]); const [statuses, setStatuses] = useState<Status[]>(["active", "grace"]);
  const history = d.audit.filter((a) => a.action === "announcement.sent");
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const reach = d.tenants.filter((t) => tiers.includes(t.tier as Tier) && statuses.includes(t.status as Status)).length;
  return <>
    <Title eyebrow="Broadcast" title="Announcements" sub="Send a branded Mene:Log email to church administrators." />
    <form className="surface space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); if (window.confirm(`Send to administrators of ${reach} churches?`)) act.mutate({ type: "announce", subject, body, tiers, statuses }, { onSuccess: () => { setSubject(""); setBody(""); } }); }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label>Plans</Label><div className="mt-2 flex flex-wrap gap-3">{(["free", "basic", "standard", "premium"] as const).map((k) => <label key={k} className="flex items-center gap-1.5 text-sm"><Checkbox checked={tiers.includes(k)} onCheckedChange={() => setTiers(toggle(tiers, k))} />{planLabel(k)}</label>)}</div></div>
        <div><Label>Account status</Label><div className="mt-2 flex flex-wrap gap-3">{(["active", "grace", "suspended", "closed"] as const).map((k) => <label key={k} className="flex items-center gap-1.5 text-sm capitalize"><Checkbox checked={statuses.includes(k)} onCheckedChange={() => setStatuses(toggle(statuses, k))} />{k}</label>)}</div></div>
      </div>
      <div className="space-y-2"><Label>Subject</Label><Input required minLength={3} maxLength={150} value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
      <div className="space-y-2"><Label>Message</Label><Textarea required minLength={5} maxLength={5000} rows={7} value={body} onChange={(e) => setBody(e.target.value)} /></div>
      <div className="flex items-center justify-between"><p className="text-xs text-muted-foreground">Reaches administrators of {reach} churches</p><Button type="submit" disabled={act.isPending || !tiers.length || !statuses.length}><Megaphone className="size-4" /> {act.isPending ? "Sending…" : "Send announcement"}</Button></div>
    </form>
    <div className="surface mt-4 divide-y">{history.map((h) => { const x = h.detail as { subject?: string; sent?: number; recipients?: number }; return <div key={h.id} className="flex justify-between p-3 text-sm"><span className="font-medium">{x.subject}</span><span className="text-muted-foreground">{x.sent}/{x.recipients} sent · {fmtDateTime(h.created_at)}</span></div>; })}{!history.length && <Empty>No announcements sent yet.</Empty>}</div>
  </>;
}

function Operators({ d, act }: { d: Snapshot; act: Act }) {
  const [u, setU] = useState(""); const [p, setP] = useState("");
  return <>
    <Title eyebrow="Team" title="Operators" sub="Prime Haven staff who can open this console. Each must set up two-step sign-in." />
    <form className="surface grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); act.mutate({ type: "add_operator", username: u, password: p }, { onSuccess: () => { setU(""); setP(""); } }); }}>
      <Input placeholder="Username" required pattern="[A-Za-z0-9._\-]{3,30}" value={u} onChange={(e) => setU(e.target.value)} />
      <Input placeholder="Temporary password" type="password" required minLength={8} maxLength={72} value={p} onChange={(e) => setP(e.target.value)} />
      <Button type="submit" disabled={act.isPending}><Plus className="size-4" /> Add operator</Button>
    </form>
    <div className="surface mt-4 divide-y">{d.operators.map((o) => <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 p-4"><div><p className="font-semibold">{o.username} {o.is_me && <Badge variant="secondary" className="ml-1">You</Badge>}</p><p className="text-xs text-muted-foreground">Last sign-in {fmtDateTime(o.last_sign_in_at)} · added {fmtDate(o.created_at)}</p></div>{!o.is_me && <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => { const np = window.prompt(`New password for ${o.username} (8–72 characters)`); if (np) act.mutate({ type: "reset_operator", user_id: o.id, password: np }); }}>Reset password</Button><Button size="sm" variant="destructive" onClick={() => window.confirm(`Remove ${o.username}?`) && act.mutate({ type: "remove_operator", user_id: o.id })}>Remove</Button></div>}</div>)}</div>
  </>;
}

function AuditView({ d }: { d: Snapshot }) {
  const [q, setQ] = useState("");
  const names = Object.fromEntries(d.tenants.map((t) => [t.id, t.name]));
  const list = d.audit.filter((a) => `${a.action} ${a.actor} ${a.tenant_id ? names[a.tenant_id] ?? "" : ""}`.toLowerCase().includes(q.toLowerCase()));
  return <>
    <Title eyebrow="Accountability" title="Audit log" sub="Every operator sign-in and action.">
      <Button variant="outline" onClick={() => downloadCsv("platform-audit.csv", list.map((a) => ({ when: a.created_at, operator: a.actor, action: a.action, church: a.tenant_id ? names[a.tenant_id] : "", detail: JSON.stringify(a.detail) })))}><Download className="size-4" /> Export</Button>
    </Title>
    <div className="relative mb-3"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search actions, operators or churches" value={q} onChange={(e) => setQ(e.target.value)} /></div>
    <div className="surface divide-y">{list.map((a) => <div key={a.id} className="flex flex-wrap justify-between gap-2 p-3 text-sm"><div><p className="font-mono text-xs font-semibold">{a.action}</p><p className="text-xs text-muted-foreground">{a.actor}{a.tenant_id ? ` · ${names[a.tenant_id] ?? "church"}` : ""}</p></div><span className="text-xs text-muted-foreground">{fmtDateTime(a.created_at)}</span></div>)}{!list.length && <Empty>No events.</Empty>}</div>
  </>;
}

function Health({ d }: { d: Snapshot }) {
  const h = d.health;
  const items = [
    { k: "Email (Resend)", ok: h.email, note: `${h.sent_24h} sent · ${h.failed_24h} failed in 24h` },
    { k: "Payments (Paystack)", ok: h.payments, note: `Last successful payment ${fmtDateTime(h.last_payment_at)}` },
    { k: "Daily job (birthdays, absences)", ok: h.cron && h.stuck_queue === 0, note: h.stuck_queue ? `${h.stuck_queue} messages waiting over an hour` : "Queue is clear" },
    { k: "Ask Mene:Log AI", ok: h.ai, note: h.ai ? "Connected" : "Not configured" },
    { k: "SMS", ok: h.sms, note: h.sms ? "Connected" : "Not configured yet" },
  ];
  const checkFn = useServerFn(healthCheck);
  const live = useMutation({ mutationFn: () => checkFn(), onError: (e) => toast.error(e instanceof Error ? e.message : "Check failed") });
  const r = live.data;
  const liveRows = r ? [["Database", r.database], ["Email (Resend)", r.email], ["Payments (Paystack)", r.payments], ["Ask Mene:Log AI", r.assistant]] as const : [];
  return <>
    <Title eyebrow="Operations" title="System health"><Button onClick={() => live.mutate()} disabled={live.isPending}><RefreshCw className={`size-4 ${live.isPending ? "animate-spin" : ""}`} /> {live.isPending ? "Testing…" : "Run live test"}</Button></Title>
    {r && <div className="surface mb-4 p-4"><p className="text-sm font-semibold">Live test · {fmtDateTime(r.checked_at)}</p><div className="mt-2 grid gap-2 sm:grid-cols-4">{liveRows.map(([k, v]) => <div key={k} className={`rounded-lg border p-3 text-sm ${v.ok ? "border-success/40" : "border-destructive/40"}`}><p className="font-medium">{k}</p><p className={`text-xs ${v.ok ? "text-success" : "text-destructive"}`}>{v.ok ? `Working · ${v.ms} ms` : "Not responding"}</p></div>)}</div></div>}
    <div className="grid gap-3 sm:grid-cols-2">{items.map((i) => <div key={i.k} className="surface flex items-start gap-3 p-4"><span className={`mt-1 size-2.5 shrink-0 rounded-full ${i.ok ? "bg-success" : "bg-destructive"}`} /><div><p className="font-semibold">{i.k}</p><p className="text-xs text-muted-foreground">{i.note}</p></div></div>)}</div>
  </>;
}

const TIERS: Tier[] = ["free", "basic", "standard", "premium"];

function Features() {
  const qc = useQueryClient();
  const cfg = usePlanConfig();
  const live = cfg.data;
  const save = useMutation({
    mutationFn: async ({ tier, key, value }: { tier: Tier; key: string; value: boolean | number }) => {
      const { error } = await (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ error: { message: string } | null }>)("platform_set_plan_config", { p_tier: tier, p_key: key, p_value: value });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Saved — churches on this plan see the change straight away"); qc.invalidateQueries({ queryKey: ["plan-config"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });
  const val = (tier: Tier, key: string) => {
    const v = live?.[tier]?.[key];
    return v ?? (ENTITLEMENTS[tier] as Record<string, boolean | number>)[key];
  };
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-bold">Package features</h1><p className="mt-1 text-sm text-muted-foreground">Switch features on or off for each plan. Anything switched off shows with a padlock in that church's dashboard.</p></div>
      {!live && <div className="surface flex items-start gap-3 border-destructive/30 p-4 text-sm"><Lock className="mt-0.5 size-4 text-destructive" /><div><p className="font-semibold">Switches are read-only until the database update is run</p><p className="text-muted-foreground">Run <code>premium-upgrade.sql</code> in the SQL editor. The values below are the current defaults.</p></div></div>}
      <div className="surface overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="p-3">Feature</th>{TIERS.map((t) => <th key={t} className="p-3 text-center">{planLabel(t)}</th>)}</tr></thead>
          <tbody>
            {FEATURE_KEYS.map((k) => (
              <tr key={k} className="border-b last:border-0 hover:bg-muted/30">
                <td className="p-3 font-medium">{FEATURE_LABELS[k]}</td>
                {TIERS.map((t) => <td key={t} className="p-3 text-center"><Switch checked={val(t, k) === true} disabled={!live || save.isPending} onCheckedChange={(v) => save.mutate({ tier: t, key: k, value: v })} aria-label={`${FEATURE_LABELS[k]} on ${planLabel(t)}`} /></td>)}
              </tr>
            ))}
            {LIMIT_KEYS.map((k) => (
              <tr key={k} className="border-b bg-muted/20 last:border-0">
                <td className="p-3 font-medium">{LIMIT_LABELS[k]}</td>
                {TIERS.map((t) => <td key={t} className="p-2"><Input type="number" min={0} className="mx-auto h-8 w-24 text-center" defaultValue={Number(val(t, k))} disabled={!live} onBlur={(e) => { const n = Math.max(0, Math.floor(Number(e.target.value))); if (n !== Number(val(t, k))) save.mutate({ tier: t, key: k, value: n }); }} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
