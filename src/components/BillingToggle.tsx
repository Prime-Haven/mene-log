import type { BillingInterval } from "@/lib/pricing";

export function BillingToggle({
  value,
  onChange,
}: {
  value: BillingInterval;
  onChange: (v: BillingInterval) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div role="tablist" className="inline-flex rounded-lg border border-border bg-muted p-1">
        {(["monthly", "yearly"] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={value === v}
            onClick={() => onChange(v)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
              value === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            {v}
          </button>
        ))}
      </div>
      {value === "yearly" && (
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          Save 20% when you pay yearly
        </span>
      )}
    </div>
  );
}
