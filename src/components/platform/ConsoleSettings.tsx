import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSettings, saveSettings } from "@/lib/settings.functions";
import type { PlatformSettings, Coupon } from "@/lib/settings.shared";
import type { OperatorActionInput } from "@/lib/operator.functions";
import { planLabel } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

type Act = { mutate: (i: OperatorActionInput, o?: { onSuccess?: () => void }) => void; isPending: boolean };

const TABS = [
  ["security", "Profile & security"],
  ["branding", "Branding"],
  ["pricing", "Pricing"],
  ["coupons", "Discount codes"],
  ["signups", "Sign-ups"],
  ["email", "Emails"],
  ["messaging", "Messaging"],
  ["homepage", "Homepage"],
  ["legal", "Legal"],
] as const;
type Tab = (typeof TABS)[number][0];

export function ConsoleSettings({ act, username, lastSignIn }: { act: Act; username: string; lastSignIn: string | null }) {
  const [tab, setTab] = useState<Tab>("security");
  const qc = useQueryClient();
  const getFn = useServerFn(getSettings);
  const saveFn = useServerFn(saveSettings);
  const q = useQuery({ queryKey: ["platform-settings"], queryFn: () => getFn(), retry: false });
  const [s, setS] = useState<PlatformSettings | null>(null);
  useEffect(() => { if (q.data) setS(structuredClone(q.data)); }, [q.data]);
  const save = useMutation({
    mutationFn: (v: PlatformSettings) => saveFn({ data: v }),
    onSuccess: (r) => { toast.success(r.message); qc.invalidateQueries({ queryKey: ["platform-settings"] }); qc.invalidateQueries({ queryKey: ["public-settings"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });
  const patch = <K extends keyof PlatformSettings>(k: K, v: Partial<PlatformSettings[K]>) => setS((p) => (p ? { ...p, [k]: { ...(p[k] as object), ...v } } : p));
  const dirty = !!s && !!q.data && JSON.stringify(s) !== JSON.stringify(q.data);

  return (
    <div>
      <div className="mb-5">
        <p className="text-eyebrow">Control</p>
        <h1 className="mt-1 font-display text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Everything here applies across the whole platform.</p>
      </div>
      <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl bg-muted/60 p-1">
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`relative shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${tab === id ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {tab === id && <motion.span layoutId="settings-tab" className="absolute inset-0 rounded-lg bg-background shadow-sm" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
            <span className="relative">{label}</span>
          </button>
        ))}
      </div>

      {tab === "security" ? (
        <Security act={act} username={username} lastSignIn={lastSignIn} />
      ) : q.isLoading || !s ? (
        <p className="text-sm text-muted-foreground">{q.isError ? "Could not load settings. Refresh to try again." : "Loading settings…"}</p>
      ) : (
        <form className="surface space-y-5 p-5" onSubmit={(e) => { e.preventDefault(); save.mutate(s); }}>
          {tab === "branding" && (
            <Grid>
              <F label="Platform name"><Input value={s.branding.platform_name} onChange={(e) => patch("branding", { platform_name: e.target.value })} maxLength={40} /></F>
              <F label="Tagline"><Input value={s.branding.tagline} onChange={(e) => patch("branding", { tagline: e.target.value })} maxLength={160} /></F>
              <F label="Support email"><Input type="email" value={s.branding.support_email} onChange={(e) => patch("branding", { support_email: e.target.value })} /></F>
              <F label="Support phone"><Input value={s.branding.support_phone} onChange={(e) => patch("branding", { support_phone: e.target.value })} maxLength={30} /></F>
              <F label="Main colour"><div className="flex gap-2"><input type="color" value={s.branding.primary_color} onChange={(e) => patch("branding", { primary_color: e.target.value })} className="h-10 w-14 rounded border" /><Input value={s.branding.primary_color} onChange={(e) => patch("branding", { primary_color: e.target.value })} /></div></F>
            </Grid>
          )}
          {tab === "pricing" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">US dollar prices per month. The homepage, sign-up, Billing and checkout use these straight away. Existing subscriptions keep what they paid until renewal.</p>
              <div className="grid gap-4 sm:grid-cols-3">
                {(["basic", "standard", "premium"] as const).map((t) => (
                  <div key={t} className="rounded-xl border p-4">
                    <p className="font-semibold">{planLabel(t)}</p>
                    <F label="Monthly price (USD)"><Input type="number" min={1} step="0.01" value={s.pricing.monthly[t]} onChange={(e) => setS({ ...s, pricing: { ...s.pricing, monthly: { ...s.pricing.monthly, [t]: Number(e.target.value) } } })} /></F>
                    <F label="Yearly discount (%)"><Input type="number" min={0} max={90} value={Math.round(s.pricing.yearly_discount[t] * 100)} onChange={(e) => setS({ ...s, pricing: { ...s.pricing, yearly_discount: { ...s.pricing.yearly_discount, [t]: Math.min(90, Math.max(0, Number(e.target.value))) / 100 } } })} /></F>
                    <p className="mt-2 text-xs text-muted-foreground">Yearly: ${(s.pricing.monthly[t] * 12 * (1 - s.pricing.yearly_discount[t])).toFixed(2)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {tab === "coupons" && <Coupons list={s.coupons} onChange={(coupons) => setS({ ...s, coupons })} />}
          {tab === "signups" && (
            <div className="space-y-4">
              <Toggle label="Pause new sign-ups (maintenance)" checked={s.signups.maintenance} onChange={(v) => patch("signups", { maintenance: v })} />
              <F label="Message shown while paused"><Input value={s.signups.maintenance_message} onChange={(e) => patch("signups", { maintenance_message: e.target.value })} maxLength={300} /></F>
              <F label="Blocked email domains (one per line)"><Textarea rows={4} value={s.signups.blocked_domains.join("\n")} onChange={(e) => patch("signups", { blocked_domains: e.target.value.split(/\s+/).map((x) => x.trim().toLowerCase()).filter(Boolean) })} placeholder="tempmail.com" /></F>
            </div>
          )}
          {tab === "email" && (
            <div className="space-y-4">
              <Grid>
                <F label="Sender name"><Input value={s.email.sender_name} onChange={(e) => patch("email", { sender_name: e.target.value })} maxLength={60} /></F>
                <F label="Default reply-to address"><Input type="email" value={s.email.reply_to} onChange={(e) => patch("email", { reply_to: e.target.value })} /></F>
              </Grid>
              <TestEmail act={act} />
            </div>
          )}
          {tab === "messaging" && (
            <div className="space-y-4">
              <Grid>
                <F label="Quiet hours start (0–23)"><Input type="number" min={0} max={23} value={s.messaging.quiet_start} onChange={(e) => patch("messaging", { quiet_start: Number(e.target.value) })} /></F>
                <F label="Quiet hours end (0–23)"><Input type="number" min={0} max={23} value={s.messaging.quiet_end} onChange={(e) => patch("messaging", { quiet_end: Number(e.target.value) })} /></F>
                <F label="Absence alert after missed Sundays"><Input type="number" min={1} max={12} value={s.messaging.default_absence_threshold} onChange={(e) => patch("messaging", { default_absence_threshold: Number(e.target.value) })} /></F>
              </Grid>
              <Button type="button" variant="outline" disabled={dirty || act.isPending} onClick={() => { if (window.confirm("Apply these quiet hours and absence alerts to every church? Churches can still change their own afterwards.")) act.mutate({ type: "apply_messaging_defaults" }); }}>Apply to all churches</Button>
              {dirty && <p className="text-xs text-muted-foreground">Save first, then apply.</p>}
            </div>
          )}
          {tab === "homepage" && (
            <div className="space-y-4">
              <Toggle label='Show the "Growing together" numbers' checked={s.homepage.show_stats} onChange={(v) => patch("homepage", { show_stats: v })} />
              <F label="Banner announcement (leave empty for none)"><Input value={s.homepage.banner} onChange={(e) => patch("homepage", { banner: e.target.value })} maxLength={200} /></F>
            </div>
          )}
          {tab === "legal" && (
            <div className="space-y-4">
              <F label="Extra Terms of Service text (added to the Terms page)"><Textarea rows={8} value={s.legal.terms_extra} onChange={(e) => patch("legal", { terms_extra: e.target.value })} /></F>
              <F label="Extra Privacy Policy text (added to the Privacy page)"><Textarea rows={8} value={s.legal.privacy_extra} onChange={(e) => patch("legal", { privacy_extra: e.target.value })} /></F>
            </div>
          )}
          <div className="flex items-center gap-3 border-t pt-4">
            <Button type="submit" disabled={!dirty || save.isPending}>{save.isPending ? "Saving…" : "Save changes"}</Button>
            {dirty && <Button type="button" variant="ghost" onClick={() => setS(structuredClone(q.data!))}>Discard</Button>}
          </div>
        </form>
      )}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) { return <div className="grid gap-4 sm:grid-cols-2">{children}</div>; }
function F({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>; }
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <label className="flex items-center justify-between gap-4 rounded-xl border p-3 text-sm font-medium">{label}<Switch checked={checked} onCheckedChange={onChange} /></label>;
}

function TestEmail({ act }: { act: Act }) {
  const [to, setTo] = useState("");
  return (
    <div className="rounded-xl border p-4">
      <p className="text-sm font-semibold">Send a test email</p>
      <div className="mt-2 flex gap-2"><Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@example.com" /><Button type="button" variant="outline" disabled={!to || act.isPending} onClick={() => act.mutate({ type: "test_email", to })}>Send</Button></div>
    </div>
  );
}

function Coupons({ list, onChange }: { list: Coupon[]; onChange: (c: Coupon[]) => void }) {
  const blank: Coupon = { code: "", percent: 10, tiers: ["basic", "standard", "premium"], expires_on: null, max_uses: null, uses: 0, active: true };
  const [draft, setDraft] = useState<Coupon>(blank);
  const add = () => {
    const code = draft.code.trim().toUpperCase();
    if (!/^[A-Z0-9-]{3,24}$/.test(code)) { toast.error("Codes use 3–24 letters, numbers or dashes"); return; }
    if (list.some((c) => c.code === code)) { toast.error("That code already exists"); return; }
    onChange([...list, { ...draft, code }]); setDraft(blank);
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Churches enter these in Billing before paying. Save changes to publish them.</p>
      <div className="grid gap-3 rounded-xl border p-4 sm:grid-cols-5 sm:items-end">
        <F label="Code"><Input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })} placeholder="EASTER20" className="font-mono" /></F>
        <F label="% off"><Input type="number" min={1} max={100} value={draft.percent} onChange={(e) => setDraft({ ...draft, percent: Math.max(1, Math.min(100, Number(e.target.value))) })} /></F>
        <F label="Expires"><Input type="date" value={draft.expires_on ?? ""} onChange={(e) => setDraft({ ...draft, expires_on: e.target.value || null })} /></F>
        <F label="Max uses"><Input type="number" min={1} value={draft.max_uses ?? ""} onChange={(e) => setDraft({ ...draft, max_uses: e.target.value ? Number(e.target.value) : null })} placeholder="No limit" /></F>
        <Button type="button" onClick={add}><Plus className="size-4" /> Add</Button>
        <div className="flex flex-wrap gap-3 sm:col-span-5">
          {(["basic", "standard", "premium"] as const).map((t) => (
            <label key={t} className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={draft.tiers.includes(t)} onChange={() => setDraft({ ...draft, tiers: draft.tiers.includes(t) ? draft.tiers.filter((x) => x !== t) : [...draft.tiers, t] })} />{planLabel(t)}</label>
          ))}
        </div>
      </div>
      <div className="divide-y rounded-xl border">
        {list.map((c, i) => (
          <div key={c.code} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
            <div><p className="font-mono font-semibold">{c.code} · {c.percent}% off</p><p className="text-xs text-muted-foreground">{c.tiers.map(planLabel).join(", ")} · {c.uses}{c.max_uses ? `/${c.max_uses}` : ""} used{c.expires_on ? ` · until ${c.expires_on}` : ""}</p></div>
            <div className="flex items-center gap-2"><Switch checked={c.active} onCheckedChange={(v) => onChange(list.map((x, j) => (j === i ? { ...x, active: v } : x)))} /><Button type="button" variant="ghost" size="icon" onClick={() => onChange(list.filter((_, j) => j !== i))} aria-label="Delete code"><Trash2 className="size-4" /></Button></div>
          </div>
        ))}
        {!list.length && <p className="p-4 text-center text-sm text-muted-foreground">No discount codes yet.</p>}
      </div>
    </div>
  );
}

function Security({ act, username, lastSignIn }: { act: Act; username: string; lastSignIn: string | null }) {
  const [cur, setCur] = useState(""); const [next, setNext] = useState(""); const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const signOutEverywhere = async () => {
    if (!window.confirm("Sign out of the console on every device, including this one?")) return;
    setBusy(true);
    await supabase.auth.signOut({ scope: "global" });
    window.location.href = "/super-admin";
  };
  const resetTwoStep = async () => {
    if (!window.confirm("Remove your authenticator? You'll be signed out and asked to scan a new QR code at next sign-in.")) return;
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
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="surface space-y-3 p-5">
        <p className="font-semibold">Your account</p>
        <p className="text-sm"><span className="text-muted-foreground">Username:</span> <b>{username}</b></p>
        <p className="text-sm"><span className="text-muted-foreground">Last sign-in:</span> {lastSignIn ? new Date(lastSignIn).toLocaleString() : "—"}</p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button variant="outline" disabled={busy} onClick={signOutEverywhere}>Sign out everywhere</Button>
          <Button variant="outline" disabled={busy} onClick={resetTwoStep}>Reset two-step code</Button>
        </div>
        <p className="text-xs text-muted-foreground">Your sign-in history is in the Audit log.</p>
      </div>
      <form className="surface space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); if (next !== again) { toast.error("New passwords don't match"); return; } act.mutate({ type: "change_password", current: cur, next }, { onSuccess: () => { setCur(""); setNext(""); setAgain(""); } }); }}>
        <p className="font-semibold">Change password</p>
        <F label="Current password"><Input type="password" required value={cur} onChange={(e) => setCur(e.target.value)} /></F>
        <F label="New password"><Input type="password" required minLength={8} maxLength={72} value={next} onChange={(e) => setNext(e.target.value)} /></F>
        <F label="Repeat new password"><Input type="password" required value={again} onChange={(e) => setAgain(e.target.value)} /></F>
        <Button type="submit" disabled={act.isPending}>Change password</Button>
      </form>
    </div>
  );
}
