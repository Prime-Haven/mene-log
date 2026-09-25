import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  BarChart3,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Network,
  QrCode,
  ScrollText,
  Settings,
  Users,
  CalendarDays,
  UserCog,
  Menu,
  PanelLeftClose,
  Send,
  Sparkles,
  UserCheck,
  HeartHandshake,
  ChevronRight,
  ListChecks,
  PhoneCall,
} from "lucide-react";
import { MfaGate } from "@/components/TwoStep";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { InstallMene } from "@/components/InstallMene";
import { getBrandAssetUrl } from "@/lib/checkin.functions";
import { ReviewPrompt } from "@/components/ReviewPrompt";
import { planLabel } from "@/lib/pricing";
import { Lock, Building2 } from "lucide-react";
import type { Feature } from "@/lib/entitlements";
import { UpgradePanel } from "@/components/FeatureGate";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  group: "Workspace" | "People" | "Growth" | "Administration";
  show: (ctx: ReturnType<typeof useTenant>) => boolean;
  /** Package feature: when off, the item stays visible with a padlock. */
  feature?: Feature;
};

const nav: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, group: "Workspace", show: (c) => c.canSeeReports },
  { to: "/scan", label: "Scan & check in", icon: QrCode, group: "Workspace", show: () => true },
  { to: "/attendance", label: "Attendance register", icon: ListChecks, group: "Workspace", show: (c) => c.canManageMembers },
  { to: "/services", label: "Services", icon: CalendarDays, group: "Workspace", show: (c) => c.canManageMembers },
  { to: "/members", label: "Members", icon: Users, group: "People", show: (c) => c.role !== "usher" && c.role !== "leader" },
  { to: "/my-members", label: "My members", icon: HeartHandshake, group: "People", show: (c) => c.role === "leader" },
  { to: "/followups", label: "Follow-ups", icon: PhoneCall, group: "People", show: (c) => c.canManageMembers, feature: "followups" },
  {
    to: "/leaders",
    label: "Leaders",
    icon: UserCheck,
    group: "People",
    show: (c) => c.isAdmin,
    feature: "leaders",
  },
  { to: "/reports", label: "Reports", icon: BarChart3, group: "Growth", show: (c) => c.canSeeReports, feature: "reports_basic" },
  { to: "/ask-mene", label: "Ask Mene:Log", icon: Sparkles, group: "Growth", show: (c) => c.isAdmin, feature: "ask_mene" },
  {
    to: "/messaging",
    label: "Messaging",
    icon: Send,
    group: "Growth",
    show: (c) => c.isAdmin,
    feature: "broadcasts",
  },
  {
    to: "/structure",
    label: "Structure",
    icon: Network,
    group: "Administration",
    show: (c) => c.isAdmin,
    feature: "structure",
  },
  { to: "/branches", label: "Branches", icon: Building2, group: "Administration", show: (c) => c.isAdmin && !c.isBranch, feature: "branches" },
  { to: "/accounts", label: "Accounts", icon: UserCog, group: "Administration", show: (c) => c.isAdmin },
  { to: "/billing", label: "Billing", icon: CreditCard, group: "Administration", show: (c) => c.isOwner && !c.isBranch },
  { to: "/audit", label: "Audit log", icon: ScrollText, group: "Administration", show: (c) => c.isOwner, feature: "audit" },
  { to: "/settings", label: "Settings", icon: Settings, group: "Administration", show: (c) => c.isAdmin },
];

const navGroups: NavItem["group"][] = ["Workspace", "People", "Growth", "Administration"];

function AppLayout() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const ctx = useTenant();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const reduceMotion = useReducedMotion();
  const loadAsset = useServerFn(getBrandAssetUrl);
  const pendingTenant = ctx.membership?.tenant;
  const { data: logoUrl } = useQuery({
    queryKey: ["sidebar-logo", pendingTenant?.logo_path],
    enabled: !!pendingTenant?.logo_path,
    queryFn: () => {
      if (!pendingTenant?.logo_path) return Promise.resolve(null);
      return loadAsset({ data: { path: pendingTenant.logo_path } });
    },
  });

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  useEffect(() => {
    if (session && !ctx.isLoading && !ctx.membership) navigate({ to: "/onboarding" });
  }, [session, ctx.isLoading, ctx.membership, navigate]);

  // A leader's home is their own member list, not the church dashboard.
  useEffect(() => {
    if (ctx.role === "leader" && (pathname === "/dashboard" || pathname === "/")) {
      navigate({ to: "/my-members", replace: true });
    }
  }, [ctx.role, pathname, navigate]);

  if (loading || ctx.isLoading || !ctx.membership) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        Loading your church…
      </div>
    );
  }

  const tenant = ctx.membership.tenant;
  const suspended = tenant.status === "suspended" || tenant.status === "closed";

  const current = nav.find((item) => pathname.startsWith(item.to));
  const Navigation = ({ mobile = false }: { mobile?: boolean }) => (
    <>
      <div className="flex h-[76px] items-center gap-3 border-b border-sidebar-border px-4">
        {logoUrl ? <img src={logoUrl} alt="Church logo" className="size-10 shrink-0 rounded-lg border border-sidebar-border object-contain" /> : <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-[var(--shadow-accent)]"><QrCode className="size-4.5" /></span>}
        {(!collapsed || mobile) && <span className="min-w-0"><span className="block truncate font-display text-sm font-bold">{tenant.name}</span><span className="mt-0.5 block text-[10px] font-bold uppercase tracking-[0.16em] text-primary">{planLabel(tenant.tier)} plan</span></span>}
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {navGroups.map((group) => {
          const items = nav.filter((item) => item.group === group && item.show(ctx));
          if (items.length === 0) return null;
          return <div key={group} className="mb-4 last:mb-0">{(!collapsed || mobile) && <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{group}</p>}<div className="space-y-1">{items.map(({ to, label, icon: Icon, feature }) => {
            const active = pathname.startsWith(to);
            const locked = !!feature && !ctx.can(feature);
            return <Link key={to} to={to} onClick={() => mobile && setMobileOpen(false)} title={label} className={`group flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-semibold transition-all duration-200 ${active ? "bg-primary text-primary-foreground shadow-[var(--shadow-accent)]" : "text-sidebar-foreground hover:bg-secondary hover:text-foreground"}`}><Icon className="size-4 shrink-0" />{(!collapsed || mobile) && <><span className={`flex-1 truncate ${locked ? "opacity-60" : ""}`}>{label}</span>{locked && <Lock className="size-3.5 text-muted-foreground" aria-label="Locked" />}<ChevronRight className={`size-3.5 transition-transform ${active ? "translate-x-0 opacity-90" : "-translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-60"}`} /></>}</Link>;
          })}</div></div>;
        })}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        {(!collapsed || mobile) && <><InstallMene compact /><p className="px-3 pb-2 pt-3 text-xs capitalize text-muted-foreground">{ctx.role?.replace("_", " ")}</p></>}
        <Button variant="ghost" size="sm" title="Sign out" className={`w-full gap-3 rounded-xl ${collapsed && !mobile ? "justify-center px-0" : "justify-start"}`} onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); }}><LogOut className="size-4" />{(!collapsed || mobile) && "Sign out"}</Button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <aside className={`${collapsed ? "w-[72px]" : "w-60"} fixed inset-y-0 left-0 z-40 hidden shrink-0 flex-col border-r border-border bg-sidebar shadow-[var(--shadow-panel)] transition-[width] duration-300 md:flex`}>
        <Navigation />
        <Button variant="outline" size="icon" className="absolute -right-3.5 top-24 z-20 size-7 rounded-full bg-background shadow-sm" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}><PanelLeftClose className={`size-3.5 transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`} /></Button>
      </aside>

      <ReviewPrompt />

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}><SheetContent side="left" className="flex w-[86vw] max-w-80 flex-col p-0"><SheetTitle className="sr-only">Church navigation</SheetTitle><Navigation mobile /></SheetContent></Sheet>

      <div className={`flex min-w-0 flex-1 flex-col transition-[margin] duration-300 ${collapsed ? "md:ml-[72px]" : "md:ml-60"}`}>
        <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur md:hidden">
          <div className="flex h-16 items-center gap-3 px-4 pt-[env(safe-area-inset-top)]">
            <Button variant="outline" size="icon" className="size-10 shrink-0" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu className="size-5" /></Button>
            <span className="flex items-center gap-2 font-display text-sm font-bold">
              {logoUrl ? <img src={logoUrl} alt="" className="size-8 rounded-lg object-contain" /> : <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground"><QrCode className="size-3.5" /></span>}
              <span className="truncate">{tenant.name}</span>
            </span>
            <span className="ml-auto max-w-28 truncate text-xs font-semibold text-muted-foreground">{current?.label}</span>
          </div>
        </header>

        <header className="sticky top-0 z-30 hidden h-[76px] items-center justify-between border-b border-border bg-background/90 px-6 backdrop-blur-xl md:flex lg:px-8">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{current?.group ?? "Workspace"}</p>
            <p className="mt-1 font-display text-sm font-bold">{current?.label ?? "Mene:Log"}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm"><Link to="/members"><Users className="size-4" /> Members</Link></Button>
            <Button asChild size="sm"><Link to="/scan"><QrCode className="size-4" /> Record attendance</Link></Button>
          </div>
        </header>

        {suspended && (
          <div className="border-b border-destructive/30 bg-destructive/10 px-5 py-3 text-sm text-destructive">
            This subscription is inactive. Check-in and edits are paused — your records stay safe and
            exports remain available.
          </div>
        )}

        <main className="mx-auto min-w-0 w-full max-w-[1440px] flex-1 px-4 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-6 lg:px-8">
          <motion.div key={pathname} initial={reduceMotion ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.14, ease: "easeOut" }}><MfaGate required={tenant.require_mfa}>{current?.feature && !ctx.can(current.feature) ? <UpgradePanel feature={current.feature} canUpgrade={ctx.isOwner} /> : <Outlet />}</MfaGate></motion.div>
        </main>
      </div>
    </div>
  );
}

