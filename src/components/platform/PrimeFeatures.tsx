import React, { useState } from "react";
import { Lock, RotateCcw, Check, Sparkles, ToggleRight } from "lucide-react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { usePlanConfig } from "@/hooks/useTenant";
import { planLabel } from "@/lib/pricing";
import {
  ENTITLEMENTS,
  FEATURE_KEYS,
  FEATURE_LABELS,
  LIMIT_KEYS,
  LIMIT_LABELS,
  type Feature,
  type Tier,
} from "@/lib/entitlements";

const FEATURE_GROUPS: Array<{
  name: string;
  description: string;
  keys: Feature[];
}> = [
  {
    name: "Check-in & QR Access",
    description: "Kiosk check-in, member QR card generation and scanning",
    keys: ["checkin", "qr"],
  },
  {
    name: "Membership & Directory",
    description: "Member records, Excel/CSV bulk import, and capacity expansion",
    keys: ["members", "import", "space_addon"],
  },
  {
    name: "Services & Online Streaming",
    description: "Sunday and midweek service management with live stream tracking",
    keys: ["services", "watch_live"],
  },
  {
    name: "Leadership & Cell Structure",
    description: "Department leaders, cell groups, and hierarchical oversight",
    keys: ["leaders", "structure", "groups", "leader_hierarchy"],
  },
  {
    name: "Member Care & Discipleship",
    description: "Pastoral care, first-timer follow-up assignments, and notes",
    keys: ["followups"],
  },
  {
    name: "Church Branding & Customization",
    description: "Custom check-in page themes, church logos, colors, and backdrops",
    keys: ["branding"],
  },
  {
    name: "Campuses & Branches",
    description: "Multi-site church network, branch portals, and campus oversight",
    keys: ["branches"],
  },
  {
    name: "Messaging & Broadcasts",
    description: "Email broadcasts, SMS text messaging, WhatsApp, and automations",
    keys: ["email", "sms", "whatsapp", "broadcasts", "automations"],
  },
  {
    name: "Analytics & Audit Log",
    description: "Service attendance trends, demographic reports, and security audit log",
    keys: ["reports_basic", "reports_advanced", "audit"],
  },
  {
    name: "Ask Mene:Log AI Assistant",
    description: "AI-powered church insights and conversational analytics",
    keys: ["ask_mene", "ask_mene_pro"],
  },
  {
    name: "Customer Support & Helpdesk",
    description: "Ticketing system and priority technical assistance",
    keys: ["support"],
  },
];

const TIERS: Tier[] = ["free", "basic", "standard", "premium"];

export function PrimeFeatures() {
  const qc = useQueryClient();
  const cfg = usePlanConfig();
  const live = cfg.data;

  const save = useMutation({
    mutationFn: async ({
      tier,
      key,
      value,
    }: {
      tier: Tier;
      key: string;
      value: boolean | number;
    }) => {
      const { error } = await (
        supabase.rpc as unknown as (
          f: string,
          a: Record<string, unknown>,
        ) => Promise<{ error: { message: string } | null }>
      )("platform_set_plan_config", { p_tier: tier, p_key: key, p_value: value });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Saved — live configuration active for all churches on this plan");
      qc.invalidateQueries({ queryKey: ["plan-config"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });

  const val = (tier: Tier, key: string) => {
    const v = live?.[tier]?.[key];
    return v ?? (ENTITLEMENTS[tier] as Record<string, boolean | number>)[key];
  };

  const isDefault = (tier: Tier, key: string) => {
    const customVal = live?.[tier]?.[key];
    if (customVal === undefined) return true;
    return customVal === (ENTITLEMENTS[tier] as Record<string, boolean | number>)[key];
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-eyebrow">Tier Configuration & Entitlements</p>
          <h1 className="mt-1 font-display text-2xl font-bold">Package Feature Matrix</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Authoritative live plan matrix. Toggle switches dynamically grant or revoke access for
            all churches on that tier in real time.
          </p>
        </div>
      </div>

      {!live && (
        <div className="surface flex items-start gap-3 border-destructive/30 p-4 text-xs">
          <Lock className="mt-0.5 size-4 text-destructive shrink-0" />
          <div>
            <p className="font-semibold text-foreground">
              Switches are read-only until the database plan_config table is present
            </p>
            <p className="text-muted-foreground mt-0.5">
              The values displayed below are the hardcoded platform defaults.
            </p>
          </div>
        </div>
      )}

      <div className="surface overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/30 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="p-3">Feature Suite / Capability</th>
              {TIERS.map((t) => (
                <th key={t} className="p-3 text-center min-w-32">
                  <div className="font-bold text-foreground text-xs">{planLabel(t)}</div>
                  <div className="text-[10px] text-muted-foreground font-normal">
                    {t === "standard" ? "Most popular" : t}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {FEATURE_GROUPS.map((group) => (
              <React.Fragment key={group.name}>
                <tr className="bg-muted/40 font-semibold text-[11px]">
                  <td colSpan={5} className="p-2.5 px-3">
                    <span className="uppercase tracking-wider text-foreground font-bold">{group.name}</span>
                    <span className="ml-2 text-muted-foreground font-normal lowercase">— {group.description}</span>
                  </td>
                </tr>
                {group.keys.map((k) => (
                  <tr key={k} className="hover:bg-muted/20 transition-colors">
                    <td className="p-3 pl-5 font-medium text-foreground">
                      <div>{FEATURE_LABELS[k]}</div>
                      <div className="text-[10px] font-mono text-muted-foreground">{k}</div>
                    </td>
                    {TIERS.map((t) => {
                      const active = val(t, k) === true;
                      const def = isDefault(t, k);
                      return (
                        <td key={t} className="p-3 text-center">
                          <div className="flex flex-col items-center justify-center gap-1">
                            <Switch
                              checked={active}
                              disabled={!live || save.isPending}
                              onCheckedChange={(v) => save.mutate({ tier: t, key: k, value: v })}
                              aria-label={`${FEATURE_LABELS[k]} on ${planLabel(t)}`}
                            />
                            <span
                              className={`text-[9px] uppercase tracking-wider font-semibold ${
                                def ? "text-muted-foreground/60" : "text-primary font-bold"
                              }`}
                            >
                              {def ? "Default" : "Custom"}
                            </span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}

            {/* Limit Keys Section */}
            <tr className="bg-muted/40 font-semibold text-[11px]">
              <td colSpan={5} className="p-2.5 px-3 uppercase tracking-wider text-muted-foreground">
                Numerical Capacity Limits
              </td>
            </tr>

            {LIMIT_KEYS.map((k) => (
              <tr key={k} className="hover:bg-muted/20 transition-colors">
                <td className="p-3 font-medium text-foreground">
                  <div>{LIMIT_LABELS[k]}</div>
                  <div className="text-[10px] font-mono text-muted-foreground">{k}</div>
                </td>
                {TIERS.map((t) => {
                  const def = isDefault(t, k);
                  return (
                    <td key={t} className="p-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <Input
                          type="number"
                          min={0}
                          className="h-8 w-24 text-center text-xs font-semibold tabular-nums"
                          defaultValue={Number(val(t, k))}
                          disabled={!live}
                          onBlur={(e) => {
                            const n = Math.max(0, Math.floor(Number(e.target.value)));
                            if (n !== Number(val(t, k))) {
                              save.mutate({ tier: t, key: k, value: n });
                            }
                          }}
                        />
                        <span
                          className={`text-[9px] uppercase tracking-wider font-semibold ${
                            def ? "text-muted-foreground/60" : "text-primary font-bold"
                          }`}
                        >
                          {def ? "Default" : "Custom"}
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
