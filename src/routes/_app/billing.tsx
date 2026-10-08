import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Check, X, ArrowRight, ShieldAlert, Sparkles, Building2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import {
  startPayment,
  startSpacePurchase,
  resendReceipt,
  downgradeToFree,
  EXTRA_SPACE_BUNDLES,
} from "@/lib/billing.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCurrency } from "@/hooks/useCurrency";
import { formatUsd } from "@/lib/currency";
import { BillingToggle } from "@/components/BillingToggle";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import {
  MONTHLY_USD,
  yearlyUsd,
  yearlyPerMonthUsd,
  YEARLY_DISCOUNT,
  intervalFromReference,
  planLabel,
  type BillingInterval,
  type PlanTier,
} from "@/lib/pricing";
import { PRICING_TIERS, type PricingTierItem } from "@/lib/pricing-plans";

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

export function Billing() {
  const qc = useQueryClient();
  const ctx = useTenant();
  const { tenant } = ctx;
  const trialActive =
    !!tenant?.trial_ends_at && new Date(tenant.trial_ends_at).getTime() > Date.now();
  const currentTier = (tenant?.tier ?? "free") as "free" | PlanTier;
  const trialExpired =
    !!tenant?.trial_ends_at &&
    new Date(tenant.trial_ends_at).getTime() <= Date.now() &&
    currentTier !== "free";

  const [downgradeConfirmOpen, setDowngradeConfirmOpen] = useState(false);
  const pay = useServerFn(startPayment);
  const downgradeFn = useServerFn(downgradeToFree);
  const currency = useCurrency();
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  usePlatformSettings();
  const [coupon, setCoupon] = useState("");

  const downgradeMutation = useMutation({
    mutationFn: async () => {
      const result = await downgradeFn({ data: { tenant_id: tenant!.id } });
      if (!result.ok) throw new Error(result.message);
      return result;
    },
    onSuccess: (data) => {
      setDowngradeConfirmOpen(false);
      toast.success(data.message || "Switched to Free plan. All records are safe.");
      void qc.invalidateQueries({ queryKey: ["tenant"] });
      void qc.invalidateQueries({ queryKey: ["membership"] });
      void qc.invalidateQueries({ queryKey: ["subscription"] });
      window.location.reload();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not downgrade plan"),
  });

  const renew = useMutation({
    mutationFn: async (tier: PlanTier) => {
      const result = await pay({
        data: {
          tenant_id: tenant!.id,
          tier,
          interval,
          ...(coupon.trim() ? { coupon: coupon.trim() } : {}),
        },
      });
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

  const isBranch = !!tenant?.parent_tenant_id;
  const canModifyPlan = ctx.isOwner && !isBranch;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-eyebrow">Subscription & Billing</p>
        <h1 className="mt-1 font-display text-2xl font-bold">Billing & Plans</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Keep your church records active, manageable and up to date. A lapsed subscription pauses
          check-in and edits, but your records and exports are never deleted.
        </p>
      </div>

      {isBranch && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
          <Building2 className="size-5 shrink-0 text-primary" />
          <div>
            <p className="font-semibold text-foreground">Branch Account</p>
            <p className="text-muted-foreground">
              This church operates under the main church's Pro subscription. Subscription changes
              and payments must be handled from the head church account.
            </p>
          </div>
        </div>
      )}

      {!ctx.isOwner && !isBranch && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-4 text-sm">
          <ShieldAlert className="size-5 shrink-0 text-muted-foreground" />
          <p className="text-muted-foreground">
            Only the church owner can initiate payments, renew subscriptions or purchase extra
            member space.
          </p>
        </div>
      )}

      {/* Signed-in Account Context Cards */}
      <div data-tour="page-billing-cards" className="grid gap-4 sm:grid-cols-3">
        <div className="surface p-5">
          <p className="text-eyebrow">Active Package</p>
          <div className="mt-2 flex items-center gap-2">
            <p className="text-2xl font-bold">{planLabel(sub?.tier ?? tenant?.tier)}</p>
            <Badge variant="default" className="text-xs">
              Active
            </Badge>
          </div>
          {sub?.pending_tier && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Changing to {planLabel(sub.pending_tier)} at period end
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {sub?.period_end?.startsWith("9999")
              ? "Free plan · no recurring card charges"
              : trialActive
                ? "Trial period active"
                : "Subscription active"}
          </p>
        </div>

        <div className="surface p-5">
          <p className="text-eyebrow">{trialActive ? "Trial Status" : "Renewal Date"}</p>
          <p className="mt-2 text-2xl font-bold">
            {trialActive
              ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
                  new Date(tenant.trial_ends_at as string),
                )
              : sub?.period_end?.startsWith("9999")
                ? "Never (Free)"
                : (sub?.period_end ?? "—")}
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {trialActive
              ? "30-day full feature trial"
              : sub?.auto_renew
                ? "Auto-renewal enabled"
                : "Manual renewal each period"}
          </p>
        </div>

        <div className="surface p-5">
          <p className="text-eyebrow">Payment Channel</p>
          <p className="mt-2 text-2xl font-bold uppercase">
            {sub?.payment_method ?? (currency.code === "GHS" ? "momo / card" : "card")}
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {currency.code === "GHS"
              ? "Local Mobile Money (MTN, Telecel, AT) or Visa/Mastercard."
              : "Standard secure card payments in USD."}
          </p>
        </div>
      </div>

      {trialActive && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm flex items-start gap-3">
          <Sparkles className="size-5 shrink-0 text-primary mt-0.5" />
          <div>
            <p className="font-semibold text-foreground">Your 30-day trial is currently active</p>
            <p className="mt-0.5 text-muted-foreground">
              Explore all features freely. Select and activate your package below before the trial
              period concludes to ensure seamless continuity.
            </p>
          </div>
        </div>
      )}

      {trialExpired && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5 text-sm flex items-start gap-3.5 shadow-sm">
          <ShieldAlert className="size-6 shrink-0 text-amber-500 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-bold text-base text-foreground">Your 30-day trial has concluded</h3>
            <p className="mt-1 text-muted-foreground leading-relaxed">
              All your church member records, attendance logs, and data remain 100% safe and preserved.
              To continue accessing advanced capabilities, please select and activate your package below.
              You can also choose to downgrade to the Free plan at any time.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                size="sm"
                className="bg-primary text-primary-foreground font-semibold"
                onClick={() => {
                  const el = document.getElementById("plan-selection");
                  el?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                Choose & Pay Package <ArrowRight className="size-4 ml-1.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!canModifyPlan || downgradeMutation.isPending}
                onClick={() => setDowngradeConfirmOpen(true)}
              >
                Downgrade to Free Plan
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Usage Against Limits */}
      <div className="surface p-5">
        <h2 className="text-base font-semibold">Account usage vs package limits</h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-3">
          {[
            {
              label: "Active members",
              used: usage?.members ?? 0,
              cap: ctx.limitWithExtras("member_limit"),
              unit: "members",
            },
            {
              label: "Staff logins",
              used: usage?.staff ?? 0,
              cap: ctx.limit("staff_seats"),
              unit: "seats",
            },
            {
              label: "Daily broadcast messages",
              used: usage?.messages_month ?? 0,
              cap: ctx.limit("daily_messages"),
              unit: "messages",
            },
          ].map((row) => {
            const pct = row.cap ? Math.min(100, Math.round(((row.used ?? 0) / row.cap) * 100)) : 0;
            return (
              <div key={row.label} className="rounded-lg border border-border/70 p-4 bg-muted/20">
                <div className="flex items-baseline justify-between">
                  <p className="text-sm font-medium">{row.label}</p>
                  <p className="text-sm font-semibold tabular-nums">
                    {row.used.toLocaleString()} / {row.cap.toLocaleString()} {row.unit}
                  </p>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full transition-all ${pct > 90 ? "bg-destructive" : "bg-primary"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {pct}% of {row.cap.toLocaleString()} {row.unit} limit utilized
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Extra Space Addon */}
      <div className="surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Extra member capacity</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Expand your congregation limit without jumping to a higher plan tier.
            </p>
          </div>
          {tenant?.extra_member_slots ? (
            <Badge variant="secondary" className="text-xs">
              +{tenant.extra_member_slots.toLocaleString()} extra member space added
            </Badge>
          ) : null}
        </div>

        {ctx.can("space_addon") ? (
          <div className="mt-4">
            <div className="flex flex-wrap gap-2.5">
              {EXTRA_SPACE_BUNDLES.map((bundle) => (
                <Button
                  key={bundle.slots}
                  variant="outline"
                  disabled={!canModifyPlan || purchaseSpace.isPending}
                  onClick={() => purchaseSpace.mutate(bundle.slots)}
                >
                  +{bundle.slots.toLocaleString()} members ·{" "}
                  {formatUsd(bundle.amountPesewas / 100, currency)}
                </Button>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Extra capacity attaches permanently to your account across billing cycles.
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Extra capacity bundles are available on the Standard, Pro, and Premium packages.
          </p>
        )}
      </div>

      {/* Plan Selection with Homepage Treatment */}
      <div id="plan-selection" className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-eyebrow">Package Selection</p>
            <h2 className="mt-1 font-display text-2xl font-bold">Choose your church package</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Prices shown in your local currency ({currency.code}), billed monthly or yearly.
            </p>
          </div>
          <div className="shrink-0">
            <BillingToggle value={interval} onChange={setInterval} />
          </div>
        </div>

        {canModifyPlan && (
          <div className="surface max-w-sm p-4">
            <Label htmlFor="coupon" className="text-xs font-semibold">
              Discount / Promo code (optional)
            </Label>
            <Input
              id="coupon"
              value={coupon}
              onChange={(e) => setCoupon(e.target.value.toUpperCase())}
              placeholder="e.g. EASTER20"
              maxLength={24}
              className="mt-1.5 font-mono text-sm uppercase"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Promotional code will be verified and discounted at checkout.
            </p>
          </div>
        )}

        {/* 4 Plan Cards */}
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {PRICING_TIERS.map((tier) => {
            const isCurrent = currentTier === tier.id;
            const isFeatured = tier.featured;

            return (
              <article
                key={tier.id}
                className={`relative flex flex-col rounded-2xl border p-6 transition-all ${
                  isFeatured
                    ? "border-primary bg-primary text-primary-foreground shadow-xl"
                    : isCurrent
                      ? "border-primary/80 bg-card ring-2 ring-primary/20 shadow-md"
                      : "border-border bg-card"
                }`}
              >
                {/* Centered Most Popular Badge at top of Pro card */}
                {isFeatured && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary-foreground px-3.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary shadow-md z-10">
                    Most popular
                  </span>
                )}
                {isCurrent && !isFeatured && (
                  <span className="absolute -top-3 right-4 whitespace-nowrap rounded-full bg-primary text-primary-foreground px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow-sm z-10">
                    Active
                  </span>
                )}

                <h3
                  className={`text-sm font-bold uppercase tracking-[0.16em] ${
                    isFeatured ? "text-primary-foreground/75" : "text-muted-foreground"
                  }`}
                >
                  {tier.name}
                </h3>

                {tier.id === "free" ? (
                  <div className="mt-4">
                    <span
                      className={`font-display text-4xl font-bold ${
                        isFeatured ? "text-primary-foreground" : "text-foreground"
                      }`}
                    >
                      Free
                    </span>
                    <p
                      className={`mt-1 text-xs ${
                        isFeatured ? "text-primary-foreground/70" : "text-muted-foreground"
                      }`}
                    >
                      Free forever · no card required
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="mt-4 flex flex-wrap items-end">
                      <span
                        className={`font-display text-4xl font-bold ${
                          isFeatured ? "text-primary-foreground" : "text-foreground"
                        }`}
                      >
                        {formatUsd(
                          interval === "yearly"
                            ? yearlyUsd(tier.id as PlanTier)
                            : MONTHLY_USD[tier.id as PlanTier],
                          currency,
                        )}
                      </span>
                      <span
                        className={`mb-1.5 ml-1 text-sm ${
                          isFeatured ? "text-primary-foreground/70" : "text-muted-foreground"
                        }`}
                      >
                        {interval === "yearly" ? "/year" : "/month"}
                      </span>
                    </div>
                    {interval === "yearly" && (
                      <p
                        className={`mt-1 text-xs ${
                          isFeatured ? "text-primary-foreground/70" : "text-muted-foreground"
                        }`}
                      >
                        <b>Save {Math.round(YEARLY_DISCOUNT[tier.id as PlanTier] * 100)}%</b> ·{" "}
                        {formatUsd(yearlyPerMonthUsd(tier.id as PlanTier), currency)}/mo billed
                        yearly
                      </p>
                    )}
                  </>
                )}

                <p
                  className={`mt-4 min-h-11 text-xs leading-relaxed ${
                    isFeatured ? "text-primary-foreground/80" : "text-muted-foreground"
                  }`}
                >
                  {tier.blurb}
                </p>

                <div
                  className={`my-6 h-px ${isFeatured ? "bg-primary-foreground/20" : "bg-border"}`}
                />

                <ul className="flex-1 space-y-2.5 text-xs">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <Check className="mt-0.5 size-3.5 shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                  {tier.missing.map((feature) => (
                    <li
                      key={feature}
                      className={`flex gap-2 ${
                        isFeatured ? "text-primary-foreground/45" : "text-muted-foreground/60"
                      }`}
                    >
                      <X className="mt-0.5 size-3.5 shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* Plan Action Button */}
                <div className="mt-7">
                  {tier.id === "free" ? (
                    <Button
                      variant={isCurrent ? "outline" : "secondary"}
                      className="w-full h-10 text-xs font-semibold"
                      disabled={isCurrent || !canModifyPlan || downgradeMutation.isPending}
                      onClick={() => setDowngradeConfirmOpen(true)}
                    >
                      {isCurrent ? "Current plan" : "Downgrade to Free"}
                    </Button>
                  ) : (
                    <Button
                      variant={isFeatured ? "secondary" : isCurrent ? "default" : "outline"}
                      className="w-full h-10 text-xs"
                      disabled={!canModifyPlan || renew.isPending}
                      onClick={() => renew.mutate(tier.id as PlanTier)}
                    >
                      {isCurrent ? (
                        <>Renew {tier.name}</>
                      ) : (
                        <>
                          Switch to {tier.name} <ArrowRight className="size-3.5 ml-1" />
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {/* Payment History */}
      <div className="surface divide-y divide-border overflow-hidden">
        <div className="p-4 bg-muted/20">
          <h2 className="text-base font-semibold">Payment history & receipts</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Detailed record of all transactions processed for this church.
          </p>
        </div>
        {(payments ?? []).map((p) => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <div>
              <p className="font-mono text-xs text-muted-foreground">{p.reference}</p>
              <p className="font-medium mt-0.5">
                {planLabel(p.tier)} plan · {intervalFromReference(p.reference)} ·{" "}
                {formatUsd(Number(p.amount_kobo) / 100, currency)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Channel: {p.channel ?? "card"} ·{" "}
                {p.paid_at
                  ? new Intl.DateTimeFormat(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(p.paid_at))
                  : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
                      new Date(p.created_at),
                    )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {p.status === "success" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={sendReceipt.isPending}
                  onClick={() => sendReceipt.mutate(p.reference)}
                >
                  Resend receipt
                </Button>
              )}
              <Badge
                variant={p.status === "success" ? "default" : "outline"}
                className="capitalize"
              >
                {p.status}
              </Badge>
            </div>
          </div>
        ))}
        {(payments ?? []).length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">No payments recorded yet.</p>
        )}
      </div>

      {/* Confirmation Dialog for Downgrading to Free */}
      <AlertDialog open={downgradeConfirmOpen} onOpenChange={setDowngradeConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Downgrade to Free plan?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-sm text-muted-foreground">
              <span className="block">
                Your church will switch to the Free plan. All your congregation members,
                check-ins, and service records will remain 100% safe and accessible.
              </span>
              <span className="block text-xs">
                Pro features (such as automated broadcasts, WhatsApp messaging, multi-branch management,
                and custom leadership hierarchies) will be locked until you upgrade again.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={downgradeMutation.isPending}>
              Keep Current Plan
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={downgradeMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                downgradeMutation.mutate();
              }}
            >
              {downgradeMutation.isPending ? "Downgrading..." : "Confirm Downgrade"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
