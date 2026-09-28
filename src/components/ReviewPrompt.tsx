import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Star, ArrowRight, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * End of month review prompt for church administrators.
 * Shows once or twice near month-end:
 * Step 1: Rate 1-5 stars
 * Step 2: Write review for Prime Haven super admin approval and homepage display.
 */
export function ReviewPrompt() {
  const { tenant, isAdmin } = useTenant();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"rate" | "review">("rate");
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [quote, setQuote] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("Administrator");
  const [busy, setBusy] = useState(false);

  const state = useQuery({
    queryKey: ["my-review-state"],
    enabled: !!tenant && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_review_state");
      if (error) throw error;
      return data as unknown as { submitted: boolean; status?: string };
    },
  });

  useEffect(() => {
    if (!isAdmin || !state.data || state.data.submitted) return;
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const countKey = `mene-review-prompt-count-${year}-${month}`;
    const lastShownKey = `mene-review-prompt-last-${year}-${month}`;

    // End-of-month check: within the last 6 days of the month
    const lastDay = new Date(year, month + 1, 0).getDate();
    const currentDay = today.getDate();
    if (currentDay < Math.min(24, lastDay - 6)) return;

    // Show at most twice a month, with at least 24 hours between prompts
    const currentCount = parseInt(window.localStorage.getItem(countKey) || "0", 10);
    if (currentCount >= 2) return;

    const lastShown = window.localStorage.getItem(lastShownKey);
    if (lastShown) {
      const hoursSinceLast = (Date.now() - parseInt(lastShown, 10)) / (1000 * 60 * 60);
      if (hoursSinceLast < 24) return;
    }

    setOpen(true);
    setStep("rate");
    window.localStorage.setItem(countKey, String(currentCount + 1));
    window.localStorage.setItem(lastShownKey, String(Date.now()));
  }, [isAdmin, state.data]);

  function handleSelectRating(val: number) {
    setRating(val);
    setStep("review");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.rpc("submit_church_review", {
        p_tenant: tenant!.id,
        p_rating: rating,
        p_quote: quote.trim(),
        p_author_name: name.trim() || "Church Administrator",
        p_author_role: role.trim() || "Administrator",
      });
      if (error) throw error;
      toast.success("Thank you! Your review has been submitted for Super Admin approval.");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["my-review-state"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit your review");
    } finally {
      setBusy(false);
    }
  }

  const ratingDescriptions: Record<number, string> = {
    1: "Poor experience",
    2: "Fair, needs improvement",
    3: "Good & reliable",
    4: "Very good software",
    5: "Exceptional platform!",
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md p-6">
        <AnimatePresence mode="wait">
          {step === "rate" ? (
            <motion.div
              key="step-rate"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="text-center space-y-5 py-2"
            >
              <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-amber-500/10 text-amber-500">
                <Star className="size-6 fill-amber-500" />
              </div>

              <div>
                <DialogTitle className="text-xl font-bold text-foreground">
                  Monthly Review: How is Mene:Log working for {tenant?.name}?
                </DialogTitle>
                <DialogDescription className="mt-2 text-sm text-muted-foreground">
                  Rate your church management and attendance experience this month.
                </DialogDescription>
              </div>

              <div className="py-2">
                <div className="flex justify-center gap-2">
                  {[1, 2, 3, 4, 5].map((value) => {
                    const active = (hoverRating ?? rating) >= value;
                    return (
                      <button
                        key={value}
                        type="button"
                        className="p-1.5 transition-transform hover:scale-125 focus:outline-none"
                        onMouseEnter={() => setHoverRating(value)}
                        onMouseLeave={() => setHoverRating(null)}
                        onClick={() => handleSelectRating(value)}
                        aria-label={`Rate ${value} stars`}
                      >
                        <Star
                          className={`size-9 transition-colors ${
                            active
                              ? "fill-amber-400 text-amber-400 drop-shadow-[0_2px_8px_rgba(251,191,36,0.4)]"
                              : "text-muted-foreground/30 hover:text-muted-foreground"
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
                <p className="mt-3 text-xs font-semibold text-primary">
                  {ratingDescriptions[hoverRating ?? rating]}
                </p>
              </div>

              <div className="flex justify-center gap-3 pt-2">
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  Maybe later
                </Button>
                <Button size="sm" onClick={() => setStep("review")} className="gap-1.5">
                  Continue <ArrowRight className="size-3.5" />
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.form
              key="step-review"
              onSubmit={submit}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <DialogTitle className="text-lg font-bold">Write Your Review</DialogTitle>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        className="focus:outline-none"
                      >
                        <Star
                          className={`size-4 ${
                            star <= rating
                              ? "fill-amber-400 text-amber-400"
                              : "text-muted-foreground/20"
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>
                <DialogDescription className="text-xs">
                  Once approved by Super Admin, your review will be published to the Mene:Log
                  homepage!
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2">
                <Label htmlFor="prompt-quote">Your review & feedback</Label>
                <textarea
                  id="prompt-quote"
                  required
                  minLength={20}
                  maxLength={600}
                  rows={4}
                  value={quote}
                  onChange={(e) => setQuote(e.target.value)}
                  className="w-full rounded-xl border border-input bg-background p-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
                  placeholder="Tell other churches how Mene:Log has helped your church with attendance, records, or member care..."
                />
                <p className="text-[11px] text-muted-foreground text-right">{quote.length}/600</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="prompt-name" className="text-xs">
                    Your Name
                  </Label>
                  <Input
                    id="prompt-name"
                    required
                    maxLength={80}
                    placeholder="Pastor John Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="prompt-role" className="text-xs">
                    Your Role
                  </Label>
                  <Input
                    id="prompt-role"
                    maxLength={80}
                    placeholder="Head Pastor / Admin"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep("rate")}
                  className="text-xs"
                >
                  ← Back to rating
                </Button>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setOpen(false)}
                    className="text-xs"
                  >
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={busy || quote.trim().length < 20}>
                    {busy ? "Sending…" : "Submit Review"}
                  </Button>
                </div>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
