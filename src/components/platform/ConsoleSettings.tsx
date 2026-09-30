import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  KeyRound,
  ShieldCheck,
  Palette,
  Radio,
  AlertTriangle,
  CircleDollarSign,
  Tag,
  Mail,
  MessageSquare,
  Globe,
  Scale,
  ChevronDown,
  ChevronRight,
  UserCheck,
  Save,
  CheckCircle2,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSettings, saveSettings } from "@/lib/settings.functions";
import type { PlatformSettings, Coupon } from "@/lib/settings.shared";
import type { OperatorActionInput } from "@/lib/operator.functions";
import { planLabel } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/PasswordField";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Act = {
  mutate: (i: OperatorActionInput, o?: { onSuccess?: () => void }) => void;
  isPending: boolean;
};

export const SETTINGS_TABS = [
  { id: "security", label: "Profile & Security", group: "Operator & Security", icon: KeyRound },
  { id: "branding", label: "Platform Branding", group: "Platform Identity", icon: Palette },
  {
    id: "autonomy",
    label: "Broadcasts & Lockdown",
    group: "Global Autonomy & Controls",
    icon: Radio,
  },
  { id: "signups", label: "Sign-up Rules", group: "Global Autonomy & Controls", icon: ShieldAlert },
  {
    id: "pricing",
    label: "Subscription Pricing",
    group: "Commercials & Plans",
    icon: CircleDollarSign,
  },
  { id: "coupons", label: "Discount Codes", group: "Commercials & Plans", icon: Tag },
  { id: "email", label: "System Emails", group: "Communications", icon: Mail },
  { id: "messaging", label: "SMS & Messaging Rules", group: "Communications", icon: MessageSquare },
  { id: "homepage", label: "Homepage Configuration", group: "Public Web & Legal", icon: Globe },
  { id: "legal", label: "Terms & Privacy", group: "Public Web & Legal", icon: Scale },
] as const;

export type Tab = (typeof SETTINGS_TABS)[number]["id"];

const SETTINGS_GROUPS = [
  {
    name: "Operator & Security",
    icon: ShieldCheck,
    items: [
      {
        id: "security",
        label: "Profile & Security",
        icon: KeyRound,
        desc: "Username, password & 2FA",
      },
    ],
  },
  {
    name: "Platform Identity",
    icon: Sparkles,
    items: [
      {
        id: "branding",
        label: "Platform Branding",
        icon: Palette,
        desc: "Titles, colors & logo identity",
      },
    ],
  },
  {
    name: "Global Autonomy & Controls",
    icon: Radio,
    items: [
      {
        id: "autonomy",
        label: "Broadcasts & Lockdown",
        icon: AlertTriangle,
        desc: "Live banners & kill switch",
      },
      {
        id: "signups",
        label: "Sign-up Rules",
        icon: ShieldAlert,
        desc: "Blocked domains & maintenance",
      },
    ],
  },
  {
    name: "Commercials & Plans",
    icon: CircleDollarSign,
    items: [
      {
        id: "pricing",
        label: "Subscription Pricing",
        icon: CircleDollarSign,
        desc: "Monthly & annual rates",
      },
      { id: "coupons", label: "Discount Codes", icon: Tag, desc: "Promo codes & percentages" },
    ],
  },
  {
    name: "Communications",
    icon: Mail,
    items: [
      { id: "email", label: "System Emails", icon: Mail, desc: "Outgoing sender & reply-to" },
      {
        id: "messaging",
        label: "SMS & Messaging Rules",
        icon: MessageSquare,
        desc: "Quiet hours & thresholds",
      },
    ],
  },
  {
    name: "Public Web & Legal",
    icon: Globe,
    items: [
      {
        id: "homepage",
        label: "Homepage Configuration",
        icon: Globe,
        desc: "Hero banners & stats display",
      },
      { id: "legal", label: "Terms & Privacy", icon: Scale, desc: "Custom terms & legal notices" },
    ],
  },
];

export function ConsoleSettings({
  act,
  username,
  lastSignIn,
}: {
  act: Act;
  username: string;
  lastSignIn: string | null;
}) {
  const [tab, setTab] = useState<Tab>("security");
  // Collapsible groups state (all open by default)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    "Operator & Security": true,
    "Platform Identity": true,
    "Global Autonomy & Controls": true,
    "Commercials & Plans": true,
    Communications: true,
    "Public Web & Legal": true,
  });

  const toggleGroup = (groupName: string) => {
    setOpenGroups((prev) => ({ ...prev, [groupName]: !prev[groupName] }));
  };

  const qc = useQueryClient();
  const getFn = useServerFn(getSettings);
  const saveFn = useServerFn(saveSettings);
  const q = useQuery({ queryKey: ["platform-settings"], queryFn: () => getFn(), retry: false });
  const [s, setS] = useState<PlatformSettings | null>(null);

  useEffect(() => {
    if (q.data) setS(structuredClone(q.data));
  }, [q.data]);

  const save = useMutation({
    mutationFn: (v: PlatformSettings) => saveFn({ data: v }),
    onSuccess: (r) => {
      toast.success(r.message);
      qc.invalidateQueries({ queryKey: ["platform-settings"] });
      qc.invalidateQueries({ queryKey: ["public-settings"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save settings"),
  });

  const patch = <K extends keyof PlatformSettings>(k: K, v: Partial<PlatformSettings[K]>) =>
    setS((p) => (p ? { ...p, [k]: { ...(p[k] as object), ...v } } : p));

  const dirty = !!s && !!q.data && JSON.stringify(s) !== JSON.stringify(q.data);
  const currentTabMeta = SETTINGS_TABS.find((t) => t.id === tab);

  return (
    <div className="space-y-6">
      {/* Header with Quick Dropdown Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="text-[10px] uppercase font-bold tracking-widest text-primary border-primary/30"
            >
              Prime Haven Console
            </Badge>
            <span className="text-xs text-muted-foreground font-mono">Platform Governance</span>
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-foreground">
            System Settings & Autonomy
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Full platform control: manage operator credentials, global broadcast alerts, brand
            identity, and pricing.
          </p>
        </div>

        {/* Quick Dropdown Selector */}
        <div className="w-full sm:w-72">
          <Label className="text-[10px] uppercase font-semibold text-muted-foreground mb-1 block">
            Quick Jump to Section
          </Label>
          <Select value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <SelectTrigger className="h-10 bg-card border-border font-medium text-xs">
              <SelectValue placeholder="Select settings section..." />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {SETTINGS_GROUPS.map((g) => (
                <SelectGroup key={g.name}>
                  <SelectLabel className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                    {g.name}
                  </SelectLabel>
                  {g.items.map((item) => (
                    <SelectItem key={item.id} value={item.id} className="text-xs font-medium">
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Main Grid: Collapsible Accordion Sidebar + Content Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Accordion Sidebar */}
        <aside className="lg:col-span-4 xl:col-span-3 space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Settings Directory
            </span>
            <span className="text-[10px] text-muted-foreground">
              {SETTINGS_TABS.length} sections
            </span>
          </div>

          <div className="space-y-2">
            {SETTINGS_GROUPS.map((group) => {
              const isOpen = openGroups[group.name] !== false;
              const hasActiveTab = group.items.some((i) => i.id === tab);

              return (
                <div
                  key={group.name}
                  className={`rounded-xl border transition-colors ${
                    hasActiveTab
                      ? "border-primary/40 bg-card/80 shadow-sm"
                      : "border-border/60 bg-card/40"
                  }`}
                >
                  {/* Collapsible Accordion Header */}
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.name)}
                    className="w-full flex items-center justify-between p-3 text-left transition-colors hover:bg-muted/30 rounded-xl"
                  >
                    <div className="flex items-center gap-2">
                      <group.icon
                        className={`size-4 ${hasActiveTab ? "text-primary" : "text-muted-foreground"}`}
                      />
                      <span
                        className={`text-xs font-semibold ${hasActiveTab ? "text-foreground font-bold" : "text-muted-foreground"}`}
                      >
                        {group.name}
                      </span>
                    </div>
                    {isOpen ? (
                      <ChevronDown className="size-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-3.5 text-muted-foreground" />
                    )}
                  </button>

                  {/* Accordion Items List under Settings */}
                  {isOpen && (
                    <div className="px-2 pb-2 pt-0.5 space-y-1">
                      {group.items.map((item) => {
                        const isActive = tab === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setTab(item.id as Tab)}
                            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left text-xs transition-all ${
                              isActive
                                ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <item.icon
                                className={`size-3.5 ${isActive ? "text-primary-foreground" : "text-muted-foreground"}`}
                              />
                              <span>{item.label}</span>
                            </div>
                            {isActive && (
                              <CheckCircle2 className="size-3 text-primary-foreground shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        {/* Content Workspace Panel */}
        <main className="lg:col-span-8 xl:col-span-9 space-y-4">
          {/* Active Section Header Bar */}
          <div className="flex items-center justify-between p-4 rounded-xl border bg-card/60 backdrop-blur-xs">
            <div className="flex items-center gap-2.5">
              {currentTabMeta?.icon && (
                <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <currentTabMeta.icon className="size-4" />
                </div>
              )}
              <div>
                <h2 className="text-base font-bold text-foreground">{currentTabMeta?.label}</h2>
                <p className="text-xs text-muted-foreground">{currentTabMeta?.group}</p>
              </div>
            </div>
            {dirty && (
              <Badge
                variant="outline"
                className="border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs"
              >
                Unsaved Changes
              </Badge>
            )}
          </div>

          {/* Tab 1: Profile & Security (Operator Username, Password, 2FA) */}
          {tab === "security" ? (
            <Security act={act} username={username} lastSignIn={lastSignIn} />
          ) : q.isLoading || !s ? (
            <div className="p-8 rounded-xl border bg-card/40 text-center text-sm text-muted-foreground">
              {q.isError
                ? "Could not load settings. Please refresh."
                : "Loading platform configuration..."}
            </div>
          ) : (
            <form
              className="rounded-2xl border bg-card p-6 shadow-sm space-y-6"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate(s);
              }}
            >
              {/* Tab 2: Platform Identity & Branding */}
              {tab === "branding" && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-foreground">
                      Prime Haven Branding & Identity
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Customise platform titles, public check-in badges, and administrative color
                      themes.
                    </p>
                  </div>

                  <Grid>
                    <F label="Platform Public Name">
                      <Input
                        value={s.branding.platform_name}
                        onChange={(e) => patch("branding", { platform_name: e.target.value })}
                        maxLength={40}
                        className="h-10 text-xs"
                      />
                    </F>
                    <F label="Tagline & Motto">
                      <Input
                        value={s.branding.tagline}
                        onChange={(e) => patch("branding", { tagline: e.target.value })}
                        maxLength={160}
                        className="h-10 text-xs"
                      />
                    </F>
                    <F label="Platform Support Email">
                      <Input
                        type="email"
                        value={s.branding.support_email}
                        onChange={(e) => patch("branding", { support_email: e.target.value })}
                        className="h-10 text-xs"
                      />
                    </F>
                    <F label="Platform Support Phone / Hotline">
                      <Input
                        value={s.branding.support_phone}
                        onChange={(e) => patch("branding", { support_phone: e.target.value })}
                        placeholder="+233550160237"
                        className="h-10 text-xs font-mono"
                      />
                    </F>
                    <F label="Brand Primary Hex Color">
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={s.branding.primary_color}
                          onChange={(e) => patch("branding", { primary_color: e.target.value })}
                          className="h-10 w-12 rounded-lg border bg-transparent p-1 cursor-pointer"
                        />
                        <Input
                          value={s.branding.primary_color}
                          onChange={(e) => patch("branding", { primary_color: e.target.value })}
                          className="h-10 font-mono text-xs uppercase"
                        />
                      </div>
                    </F>
                  </Grid>
                </div>
              )}

              {/* Tab 3: Global Autonomy & Broadcast Banners */}
              {tab === "autonomy" && (
                <div className="space-y-6">
                  {/* Global Broadcast Banner System */}
                  <div className="p-5 rounded-xl border bg-muted/20 space-y-4">
                    <div className="flex items-center justify-between border-b pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Radio className="size-4 text-primary" />
                          <h4 className="font-bold text-sm text-foreground">
                            Global Broadcast Alert Banner
                          </h4>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Push immediate announcements across all church admin consoles and public
                          check-in sites.
                        </p>
                      </div>
                      <Switch
                        checked={s.global_banner?.enabled ?? false}
                        onCheckedChange={(v) => patch("global_banner", { enabled: v })}
                      />
                    </div>

                    <div className="space-y-3">
                      <F label="Banner Message (Markdown / Plain Text)">
                        <Textarea
                          rows={3}
                          value={s.global_banner?.message ?? ""}
                          onChange={(e) => patch("global_banner", { message: e.target.value })}
                          placeholder="e.g. Scheduled platform maintenance tonight at 11:00 PM GMT. Attendance check-in remains fully available."
                          disabled={!s.global_banner?.enabled}
                          className="text-xs font-sans"
                        />
                      </F>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <F label="Alert Severity Level">
                          <Select
                            value={s.global_banner?.level ?? "info"}
                            onValueChange={(v: "info" | "warning" | "critical") =>
                              patch("global_banner", { level: v })
                            }
                            disabled={!s.global_banner?.enabled}
                          >
                            <SelectTrigger className="h-9 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="info">Information (Blue)</SelectItem>
                              <SelectItem value="warning">Warning / Notice (Amber)</SelectItem>
                              <SelectItem value="critical">Critical / Urgent (Red)</SelectItem>
                            </SelectContent>
                          </Select>
                        </F>

                        <div className="flex items-center justify-between p-3 rounded-xl border bg-background text-xs">
                          <span className="font-medium text-foreground">
                            Show on Public Check-in
                          </span>
                          <Switch
                            checked={s.global_banner?.show_on_checkin ?? true}
                            onCheckedChange={(v) => patch("global_banner", { show_on_checkin: v })}
                            disabled={!s.global_banner?.enabled}
                          />
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-xl border bg-background text-xs">
                          <span className="font-medium text-foreground">
                            Show in Church Portals
                          </span>
                          <Switch
                            checked={s.global_banner?.show_on_admin ?? true}
                            onCheckedChange={(v) => patch("global_banner", { show_on_admin: v })}
                            disabled={!s.global_banner?.enabled}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Emergency Lockdown Switch */}
                  <div className="p-5 rounded-xl border border-destructive/30 bg-destructive/5 space-y-4">
                    <div className="flex items-center justify-between border-b border-destructive/20 pb-3">
                      <div>
                        <div className="flex items-center gap-2 text-destructive">
                          <ShieldAlert className="size-4" />
                          <h4 className="font-bold text-sm">Emergency System Lockdown</h4>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Instantly pause new church signups and protect database write operations
                          during upgrades.
                        </p>
                      </div>
                      <Switch
                        checked={s.autonomy?.emergency_lockdown ?? false}
                        onCheckedChange={(v) => patch("autonomy", { emergency_lockdown: v })}
                      />
                    </div>

                    <div className="space-y-3">
                      <Toggle
                        label="Pause New Church Sign-ups (Maintenance mode)"
                        checked={s.signups?.maintenance ?? false}
                        onChange={(v) => patch("signups", { maintenance: v })}
                      />
                      <F label="Maintenance Notice shown to visitors">
                        <Input
                          value={s.signups?.maintenance_message ?? ""}
                          onChange={(e) =>
                            patch("signups", { maintenance_message: e.target.value })
                          }
                          placeholder="Mene:Log is currently undergoing scheduled platform upgrades. Services will resume shortly."
                          className="text-xs"
                        />
                      </F>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 4: Sign-up Rules */}
              {tab === "signups" && (
                <div className="space-y-4">
                  <Toggle
                    label="Pause new sign-ups (maintenance)"
                    checked={s.signups.maintenance}
                    onChange={(v) => patch("signups", { maintenance: v })}
                  />
                  <F label="Message shown while paused">
                    <Input
                      value={s.signups.maintenance_message}
                      onChange={(e) => patch("signups", { maintenance_message: e.target.value })}
                      maxLength={300}
                      className="text-xs"
                    />
                  </F>
                  <F label="Blocked email domains (one per line)">
                    <Textarea
                      rows={4}
                      value={s.signups.blocked_domains.join("\n")}
                      onChange={(e) =>
                        patch("signups", {
                          blocked_domains: e.target.value
                            .split(/\s+/)
                            .map((x) => x.trim().toLowerCase())
                            .filter(Boolean),
                        })
                      }
                      placeholder="tempmail.com"
                      className="font-mono text-xs"
                    />
                  </F>
                </div>
              )}

              {/* Tab 5: Subscription Pricing */}
              {tab === "pricing" && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-foreground">Package Pricing (USD)</h3>
                    <p className="text-xs text-muted-foreground">
                      Base rates used on the public pricing page and billing checkout.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {(["standard", "pro", "premium"] as const).map((t) => (
                      <div key={t} className="rounded-xl border p-4">
                        <p className="font-bold text-sm">{planLabel(t)}</p>
                        <F label="Monthly ($)">
                          <Input
                            type="number"
                            min={1}
                            max={10000}
                            value={s.pricing.monthly[t]}
                            onChange={(e) =>
                              patch("pricing", {
                                monthly: { ...s.pricing.monthly, [t]: Number(e.target.value) },
                              })
                            }
                            className="mt-1"
                          />
                        </F>
                        <F label="Yearly discount (0–0.9)">
                          <Input
                            type="number"
                            step={0.01}
                            min={0}
                            max={0.9}
                            value={s.pricing.yearly_discount[t]}
                            onChange={(e) =>
                              patch("pricing", {
                                yearly_discount: {
                                  ...s.pricing.yearly_discount,
                                  [t]: Number(e.target.value),
                                },
                              })
                            }
                            className="mt-1"
                          />
                        </F>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tab 6: Discount Codes */}
              {tab === "coupons" && (
                <Coupons list={s.coupons} onChange={(coupons) => setS({ ...s, coupons })} />
              )}

              {/* Tab 7: System Emails */}
              {tab === "email" && (
                <div className="space-y-4">
                  <Grid>
                    <F label="Sender name">
                      <Input
                        value={s.email.sender_name}
                        onChange={(e) => patch("email", { sender_name: e.target.value })}
                        maxLength={60}
                      />
                    </F>
                    <F label="Default reply-to address">
                      <Input
                        type="email"
                        value={s.email.reply_to}
                        onChange={(e) => patch("email", { reply_to: e.target.value })}
                      />
                    </F>
                  </Grid>
                  <TestEmail act={act} />
                </div>
              )}

              {/* Tab 8: SMS & Messaging */}
              {tab === "messaging" && (
                <div className="space-y-4">
                  <Grid>
                    <F label="Quiet hours start (0–23)">
                      <Input
                        type="number"
                        min={0}
                        max={23}
                        value={s.messaging.quiet_start}
                        onChange={(e) =>
                          patch("messaging", { quiet_start: Number(e.target.value) })
                        }
                      />
                    </F>
                    <F label="Quiet hours end (0–23)">
                      <Input
                        type="number"
                        min={0}
                        max={23}
                        value={s.messaging.quiet_end}
                        onChange={(e) => patch("messaging", { quiet_end: Number(e.target.value) })}
                      />
                    </F>
                    <F label="Absence alert after missed Sundays">
                      <Input
                        type="number"
                        min={1}
                        max={12}
                        value={s.messaging.default_absence_threshold}
                        onChange={(e) =>
                          patch("messaging", { default_absence_threshold: Number(e.target.value) })
                        }
                      />
                    </F>
                  </Grid>
                </div>
              )}

              {/* Tab 9: Homepage Configuration */}
              {tab === "homepage" && (
                <div className="space-y-4">
                  <Toggle
                    label="Show live attendance counter and stats on public homepage"
                    checked={s.homepage.show_stats}
                    onChange={(v) => patch("homepage", { show_stats: v })}
                  />
                  <F label="Homepage hero banner (blank for none)">
                    <Input
                      value={s.homepage.banner}
                      onChange={(e) => patch("homepage", { banner: e.target.value })}
                      maxLength={200}
                    />
                  </F>
                </div>
              )}

              {/* Tab 10: Legal & Terms */}
              {tab === "legal" && (
                <div className="space-y-4">
                  <F label="Terms of service additions">
                    <Textarea
                      rows={6}
                      value={s.legal.terms_extra}
                      onChange={(e) => patch("legal", { terms_extra: e.target.value })}
                      className="font-mono text-xs"
                    />
                  </F>
                  <F label="Privacy policy additions">
                    <Textarea
                      rows={6}
                      value={s.legal.privacy_extra}
                      onChange={(e) => patch("legal", { privacy_extra: e.target.value })}
                      className="font-mono text-xs"
                    />
                  </F>
                </div>
              )}

              {/* Bottom Sticky Action Bar */}
              <div className="flex items-center justify-between border-t pt-4">
                <p className="text-xs text-muted-foreground">
                  {dirty ? "You have unsaved changes in this form." : "All settings are synced."}
                </p>
                <Button
                  type="submit"
                  disabled={!dirty || save.isPending}
                  className="gap-2 h-10 px-6 font-semibold"
                >
                  <Save className="size-4" />
                  <span>{save.isPending ? "Saving..." : "Save Settings"}</span>
                </Button>
              </div>
            </form>
          )}
        </main>
      </div>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-xl border p-3 text-sm font-medium bg-card">
      <span className="text-xs font-semibold text-foreground">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function TestEmail({ act }: { act: Act }) {
  const [to, setTo] = useState("");
  return (
    <div className="rounded-xl border p-4 bg-muted/20">
      <p className="text-xs font-semibold text-foreground">Send a test email</p>
      <div className="mt-2 flex gap-2">
        <Input
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="you@example.com"
          className="text-xs h-9"
        />
        <Button
          type="button"
          variant="outline"
          disabled={!to || act.isPending}
          onClick={() => act.mutate({ type: "test_email", to })}
          className="h-9 text-xs"
        >
          Send
        </Button>
      </div>
    </div>
  );
}

function Coupons({ list, onChange }: { list: Coupon[]; onChange: (c: Coupon[]) => void }) {
  const blank: Coupon = {
    code: "",
    percent: 10,
    tiers: ["standard", "pro", "premium"],
    expires_on: null,
    max_uses: null,
    uses: 0,
    active: true,
  };
  const [draft, setDraft] = useState<Coupon>(blank);
  const add = () => {
    const code = draft.code.trim().toUpperCase();
    if (!/^[A-Z0-9-]{3,24}$/.test(code)) {
      toast.error("Codes use 3–24 letters, numbers or dashes");
      return;
    }
    if (list.some((c) => c.code === code)) {
      toast.error("That code already exists");
      return;
    }
    onChange([...list, { ...draft, code }]);
    setDraft(blank);
  };
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Churches enter these in Billing before paying. Save changes to publish them.
      </p>
      <div className="grid gap-3 rounded-xl border p-4 sm:grid-cols-5 sm:items-end bg-muted/20">
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs font-semibold">Code</Label>
          <Input
            value={draft.code}
            onChange={(e) => setDraft({ ...draft, code: e.target.value })}
            placeholder="SUMMER25"
            maxLength={24}
            className="uppercase font-mono text-xs h-9"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-semibold">Discount %</Label>
          <Input
            type="number"
            min={1}
            max={100}
            value={draft.percent}
            onChange={(e) => setDraft({ ...draft, percent: Number(e.target.value) })}
            className="text-xs h-9"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-semibold">Expires</Label>
          <Input
            type="date"
            value={draft.expires_on ?? ""}
            onChange={(e) => setDraft({ ...draft, expires_on: e.target.value || null })}
            className="text-xs h-9"
          />
        </div>
        <Button type="button" onClick={add} className="gap-1.5 h-9 text-xs">
          <Plus className="size-3.5" /> Add Code
        </Button>
      </div>

      <div className="divide-y rounded-xl border bg-card">
        {list.map((c, i) => (
          <div key={c.code} className="flex items-center justify-between p-3 text-xs">
            <div>
              <p className="font-mono font-bold text-foreground">
                {c.code} <span className="text-emerald-600 font-semibold">({c.percent}% off)</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {c.tiers.map(planLabel).join(", ")} · {c.uses}
                {c.max_uses ? `/${c.max_uses}` : ""} used
                {c.expires_on ? ` · until ${c.expires_on}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={c.active}
                onCheckedChange={(v) =>
                  onChange(list.map((x, j) => (j === i ? { ...x, active: v } : x)))
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onChange(list.filter((_, j) => j !== i))}
                aria-label="Delete code"
                className="h-8 w-8 text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ))}
        {!list.length && (
          <p className="p-4 text-center text-xs text-muted-foreground">
            No discount codes configured yet.
          </p>
        )}
      </div>
    </div>
  );
}

/** Security & Operator Profile Customization Component */
function Security({
  act,
  username,
  lastSignIn,
}: {
  act: Act;
  username: string;
  lastSignIn: string | null;
}) {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);

  // Operator Profile Customization State
  const [customUsername, setCustomUsername] = useState(username);
  const [displayName, setDisplayName] = useState("Prime Haven Super Admin");
  const [emergencyPhone, setEmergencyPhone] = useState("+233550160237");

  const signOutEverywhere = async () => {
    if (!window.confirm("Sign out of the console on every device, including this one?")) return;
    setBusy(true);
    await supabase.auth.signOut({ scope: "global" });
    window.location.href = "/super-admin";
  };

  const resetTwoStep = async () => {
    if (
      !window.confirm(
        "Remove your authenticator? You'll be signed out and asked to scan a new QR code at next sign-in.",
      )
    )
      return;
    setBusy(true);
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      for (const f of data?.all ?? []) await supabase.auth.mfa.unenroll({ factorId: f.id });
      await supabase.auth.signOut({ scope: "global" });
      window.location.href = "/super-admin";
    } catch {
      toast.error("Could not reset two-step sign-in. Try again.");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Custom Operator Profile & Username Customization */}
      <div className="rounded-2xl border bg-card p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b pb-3">
          <UserCheck className="size-4 text-primary" />
          <div>
            <h3 className="text-sm font-bold text-foreground">Operator Profile & Username</h3>
            <p className="text-xs text-muted-foreground">
              Customize your login username and display profile in Prime Haven.
            </p>
          </div>
        </div>

        <form
          className="space-y-4 pt-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (!customUsername.trim()) {
              toast.error("Username cannot be empty");
              return;
            }
            act.mutate({
              type: "update_profile",
              username: customUsername.trim(),
              display_name: displayName.trim(),
              phone: emergencyPhone.trim(),
            });
          }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <F label="Operator Login Username">
              <Input
                value={customUsername}
                onChange={(e) => setCustomUsername(e.target.value)}
                placeholder="primehaven"
                className="font-mono text-xs h-10"
              />
            </F>
            <F label="Operator Display Name">
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Super Administrator"
                className="text-xs h-10"
              />
            </F>
            <F label="Emergency Alert Phone">
              <Input
                value={emergencyPhone}
                onChange={(e) => setEmergencyPhone(e.target.value)}
                placeholder="+233550160237"
                className="font-mono text-xs h-10"
              />
            </F>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              disabled={act.isPending}
              className="h-9 text-xs gap-1.5 font-semibold"
            >
              <Save className="size-3.5" />
              <span>{act.isPending ? "Updating profile..." : "Save Profile Details"}</span>
            </Button>
          </div>
        </form>
      </div>

      {/* 2. Password & Active Session Credentials */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border bg-card p-6 shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-bold text-foreground">Active Session Security</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Two-factor authenticated (AAL2) access to Prime Haven platform administration.
            </p>
          </div>

          <div className="p-4 rounded-xl border bg-muted/20 space-y-2 text-xs">
            <p className="text-muted-foreground">
              Current Username: <b className="text-foreground font-mono">{username}</b>
            </p>
            <p className="text-muted-foreground">
              Last sign-in:{" "}
              <span className="text-foreground">
                {lastSignIn ? new Date(lastSignIn).toLocaleString() : "Active Now"}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={signOutEverywhere}
              className="text-xs h-9"
            >
              Sign out everywhere
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={resetTwoStep}
              className="text-xs h-9"
            >
              Reset two-step QR code
            </Button>
          </div>
        </div>

        {/* Change Password Form */}
        <form
          className="rounded-2xl border bg-card p-6 shadow-sm space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (next !== again) {
              toast.error("New passwords don't match");
              return;
            }
            act.mutate(
              { type: "change_password", current: cur, next },
              {
                onSuccess: () => {
                  setCur("");
                  setNext("");
                  setAgain("");
                },
              },
            );
          }}
        >
          <div>
            <h3 className="text-sm font-bold text-foreground">Change Operator Password</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Use at least 10 characters with numbers and symbols.
            </p>
          </div>

          <div className="space-y-3">
            <F label="Current Password">
              <PasswordInput
                value={cur}
                onChange={(e) => setCur(e.target.value)}
                autoComplete="current-password"
                className="text-xs h-9"
              />
            </F>
            <F label="New Password">
              <PasswordInput
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
                className="text-xs h-9"
              />
            </F>
            <F label="Confirm New Password">
              <PasswordInput
                value={again}
                onChange={(e) => setAgain(e.target.value)}
                autoComplete="new-password"
                className="text-xs h-9"
              />
            </F>
          </div>

          <Button
            type="submit"
            disabled={!cur || !next || !again || act.isPending}
            className="w-full h-9 text-xs font-semibold"
          >
            {act.isPending ? "Changing password..." : "Update Password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
