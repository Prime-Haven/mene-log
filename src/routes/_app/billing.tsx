import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { startPayment, startSpacePurchase, resendReceipt, EXTRA_SPACE_BUNDLES } from "@/lib/billing.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCurrency } from "@/hooks/useCurrency";
import { formatUsd } from "@/lib/currency";
import { useState } from "react";
import { BillingToggle } from "@/components/BillingToggle";
import { MONTHLY_USD, yearlyUsd, yearlyPerMonthUsd, YEARLY_DISCOUNT, intervalFromReference, planLabel, type BillingInterval } from "@/lib/pricing";
import { FEATURE_LABELS, type Feature } from "@/lib/entitlements";

const FEATURE_ORDER: Feature[] = [
  "members",
  "services",
  "checkin",
  "branding",
  "reports_basic",
  "ask_mene",
  "email",
  "structure",
  "groups",
  "broadcasts",
  "reports_advanced",
  "branches",
  "sms",
  "automations",
  "audit",
];

export const Route = createFileRoute("/_app/billing")({
  head: () => ({
    meta: [
      { title: "Billing — Mene:Log" },
      { name: "description", content: "Your subscription tier, renewal date and payment history." },
      { property: "og:title", content: "Billing — Mene:Log" },
      { property: "og:description", content: "Subscription tier, renewal date and invoices." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Billing,
});

function Billing() {
  const ctx = useTenant();
  const { tenant } = ctx;
  const trialActive = !!tenant?.trial_ends_at && new Date(tenant.trial_ends_at).getTime() > Date.now();
  const pay = useServerFn(startPayment);
  const currency = useCurrency();
  const [interval, setInterval] = useState<BillingInterval>("monthly");

  const renew = useMutation({
    mutationFn: async (tier: "basic" | "standard" | "premium") => {
      const result = await pay({ data: { tenant_id: tenant!.id, tier, interval } });
      if (!result.ok) throw new Error(result.message);
      window.location.href = result.authorization_url;
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not start payment"),
  });

  const receiptFn = useServerFn(resendReceipt);
  const sendReceipt = useMutation({
    mutationFn: async (reference: string) => {
      const result = await receiptFn({ data: { tenant_id: tenant!.id, reference } });
      if (!result.ok) throw new Error(result.message);
      return result.email;
    },
    onSuccess: (email) => toast.success(`Receipt sent to ${email}`),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not send receipt"),
  });

  const buySpace = useServerFn(startSpacePurchase);
  const purchaseSpace = useMutation({
    mutationFn: async (slots: number) => {
      const result = await buySpace({ data: { tenant_id: tenant!.id, slots } });
      if (!result.ok) throw new Error(result.message);
      window.location.href = result.authorization_url;
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not start payment"),
  });

  const { data: usage } = useQuery({
    queryKey: ["tenant-usage", tenant?.id],
    enabled: !!tenant,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("tenant_usage", { p_tenant: tenant!.id });
      if (error) throw error;
      return data as unknown as { members: number; staff: number; messages_month: number };
    },
  });

  const { data: sub } = useQuery({
    queryKey: ["subscription", tenant?.id],
    enabled: !!tenant,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("tier, pending_tier, period_start, period_end, payment_method, auto_renew")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: payments } = useQuery({
    queryKey: ["payments", tenant?.id],
    enabled: !!tenant,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, reference, amount_kobo, currency, tier, status, channel, paid_at, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-eyebrow">Subscription</p>
        <h1 className="mt-2 text-2xl font-bold">Billing</h1>
        <p className="text-sm text-muted-foreground">
          A lapsed subscription pauses check-in and edits. Your records and exports always stay
          available.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="surface p-5">
          <p className="text-eyebrow">Current tier</p>
          <p className="mt-2 text-2xl font-bold">{planLabel(sub?.tier ?? tenant?.tier)} plan</p>
          {sub?.pending_tier && (
            <p className="mt-1 text-xs text-muted-foreground">
              Changing to {planLabel(sub.pending_tier)} at period end
            </p>
          )}
        </div>
        <div className="surface p-5">
           <p className="text-eyebrow">{trialActive ? "Trial ends" : "Renews"}</p>
           <p className="mt-2 text-2xl font-bold">{trialActive ? new Intl.DateTimeFormat(undefined,{dateStyle:"medium"}).format(new Date(tenant.trial_ends_at as string)) : sub?.period_end ?? "—"}</p>
        </div>
        <div className="surface p-5">
          <p className="text-eyebrow">Payment method</p>
          <p className="mt-2 text-2xl font-bold uppercase">{sub?.payment_method ?? (currency.code === "GHS" ? "momo" : "card")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {currency.code === "GHS" ? "Mobile money cannot be auto-debited, so renewal is prompted each cycle." : "Card payments only in your region."}
          </p>
        </div>
      </div>

      {trialActive && <div className="rounded-lg border border-primary/25 bg-primary/5 p-4 text-sm"><b>Your trial is active.</b> Choose a package below before it ends to continue uninterrupted.</div>}

      <div className="surface p-5">
        <h2 className="text-base font-semibold">What your package includes</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {[
            { label: "Members", used: usage?.members, cap: ctx.limitWithExtras("member_limit") },
            { label: "Staff logins", used: usage?.staff, cap: ctx.limit("staff_seats") },
            {
              label: "Messages today",
              used: usage?.messages_month,
              cap: ctx.limit("daily_messages"),
            },
          ].map((row) => {
            const pct = row.cap ? Math.min(100, Math.round(((row.used ?? 0) / row.cap) * 100)) : 0;
            return (
              <div key={row.label}>
                <div className="flex items-baseline justify-between">
                  <p className="text-sm font-medium">{row.label}</p>
                  <p className="text-sm text-muted-foreground">
                    {row.used ?? 0} / {row.cap}
                  </p>
                </div>
                <div className="mt-2 h-2 rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-primary transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {FEATURE_ORDER.map((f) => (
            <Badge key={f} variant={ctx.can(f) ? "default" : "outline"} className="font-normal">
              {FEATURE_LABELS[f]}
            </Badge>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Moving up a package switches the greyed-out items on straight away, and nothing you have
          already recorded is lost when you move down.
        </p>
      </div>

      <div className="surface p-5">
        <h2 className="text-base font-semibold">Extra member space</h2>
        {ctx.can("space_addon") ? (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              {tenant?.extra_member_slots
                ? `You've purchased ${tenant.extra_member_slots.toLocaleString()} extra member slots on top of your package.`
                : "Growing past your package's member limit? Buy extra room without changing your package."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {EXTRA_SPACE_BUNDLES.map((bundle) => (
                <Button
                  key={bundle.slots}
                  variant="outline"
                  disabled={purchaseSpace.isPending}
                  onClick={() => purchaseSpace.mutate(bundle.slots)}
                >
                  +{bundle.slots.toLocaleString()} members — {formatUsd(bundle.amountPesewas / 100, currency)}
                </Button>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Extra member space is available on the Standard and Premium packages. Move up a package
            to unlock it.
          </p>
        )}
      </div>

      <div className="surface p-5">
        <h2 className="text-base font-semibold">Pay or renew</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {currency.code === "GHS"
            ? "Pay by card or mobile money. Mobile money is never debited automatically — you confirm each renewal yourself."
            : currency.code === "USD" ? "Pay by card." : "Pay by card. Prices in your currency are approximate — your card is charged the US dollar amount."}{" "}
          Payments appear below as soon as they clear.
        </p>
        <div className="mt-4">
          <BillingToggle value={interval} onChange={setInterval} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {(["basic", "standard", "premium"] as const).map((t) => (
            <Button
              key={t}
              variant={t === (sub?.tier ?? tenant?.tier) ? "default" : "outline"}
              disabled={renew.isPending}
              onClick={() => renew.mutate(t)}
            >
              {t === (sub?.tier ?? tenant?.tier) ? `Renew ${planLabel(t)}` : `Switch to ${planLabel(t)}`} ·{" "}
              {interval === "yearly"
                ? `${formatUsd(yearlyUsd(t), currency)}/yr (${formatUsd(yearlyPerMonthUsd(t), currency)}/mo, save ${Math.round(YEARLY_DISCOUNT[t] * 100)}%)`
                : `${formatUsd(MONTHLY_USD[t], currency)}/mo`}
            </Button>
          ))}
        </div>
      </div>

      <div className="surface divide-y divide-border">
        {(payments ?? []).map((p) => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <div>
              <p className="font-mono text-xs text-muted-foreground">{p.reference}</p>
              <p className="font-medium">
                {planLabel(p.tier)} · {intervalFromReference(p.reference)} · {formatUsd(Number(p.amount_kobo) / 100, currency)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {p.status === "success" && (
                <Button size="sm" variant="outline" disabled={sendReceipt.isPending} onClick={() => sendReceipt.mutate(p.reference)}>
                  Resend receipt
                </Button>
              )}
              <Badge variant={p.status === "success" ? "default" : "outline"}>{p.status}</Badge>
            </div>
          </div>
        ))}
        {(payments ?? []).length === 0 && (
          <p className="p-6 text-center text-sm text-muted-foreground">No payments recorded yet.</p>
        )}
      </div>
    </div>
  );
}
