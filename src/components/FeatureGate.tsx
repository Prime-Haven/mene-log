import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FEATURE_LABELS, requiredTier, type Feature, type Tier } from "@/lib/entitlements";

const TIER_NAME: Record<Tier, string> = {
  free: "Free",
  basic: "Standard",
  standard: "Pro",
  premium: "Premium",
};

/** Shown in place of a screen the church's package does not include. */
export function UpgradePanel({ feature, canUpgrade }: { feature: Feature; canUpgrade: boolean }) {
  const tier = requiredTier(feature);
  return (
    <div className="surface mx-auto max-w-lg p-8 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-secondary">
        <Lock className="size-5 text-muted-foreground" />
      </span>
      <h1 className="mt-4 font-display text-xl font-bold">{FEATURE_LABELS[feature]}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This is part of the {TIER_NAME[tier]} package. Your records stay exactly as they are — move
        up whenever you are ready and it unlocks straight away.
      </p>
      {canUpgrade ? (
        <Button asChild className="mt-5">
          <Link to="/billing">See packages</Link>
        </Button>
      ) : (
        <p className="mt-5 text-sm text-muted-foreground">
          Ask the church owner to change the package.
        </p>
      )}
    </div>
  );
}
