import { AnimatePresence, motion } from "framer-motion";
import type { BillingInterval } from "@/lib/pricing";

export function BillingToggle({
  value,
  onChange,
}: {
  value: BillingInterval;
  onChange: (v: BillingInterval) => void;
}) {
  return (
    <div className="mx-auto flex w-full flex-col items-center">
      <div role="tablist" className="relative inline-flex rounded-lg border border-border bg-muted p-1">
        {(["monthly", "yearly"] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={value === v}
            onClick={() => onChange(v)}
            className={`relative z-10 rounded-md px-5 py-1.5 text-sm font-medium capitalize transition-colors duration-200 ${
              value === v ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {value === v && (
              <motion.span
                layoutId="billing-toggle-pill"
                className="absolute inset-0 rounded-md bg-background shadow-sm"
                transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
              />
            )}
            <span className="relative z-10">{v}</span>
          </button>
        ))}
      </div>
      <div className="flex h-9 items-start justify-center pt-2">
        <AnimatePresence>
          {value === "yearly" && (
            <motion.span
              initial={{ opacity: 0, y: -6, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.95 }}
              transition={{ duration: 0.22 }}
              className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
            >
              Save 20% when you pay yearly
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
