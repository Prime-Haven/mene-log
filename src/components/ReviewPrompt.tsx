import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
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
 * On the 30th of each month we invite each church administrator to review Mene:Log.
 * Each administrator can share one review, and it appears on the Mene:Log homepage
 * once Prime Haven approves it.
 */
export function ReviewPrompt() {
  const { tenant, isAdmin } = useTenant();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [quote, setQuote] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
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
    const monthKey = `mene-review-${today.getFullYear()}-${today.getMonth()}`;
    // The 30th, or the last day of shorter months such as February.
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    if (today.getDate() < Math.min(30, lastDay)) return;
    if (window.localStorage.getItem(monthKey)) return;
    window.localStorage.setItem(monthKey, "shown");
    setOpen(true);
  }, [isAdmin, state.data]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.rpc("submit_church_review", {
        p_tenant: tenant!.id,
        p_rating: rating,
        p_quote: quote,
        p_author_name: name,
        p_author_role: role,
      });
      if (error) throw error;
      toast.success("Thank you — your review is with our team for approval.");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["my-review-state"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send your review");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>How is Mene:Log working for {tenant?.name}?</DialogTitle>
          <DialogDescription>
            Share one short review. Once our team approves it, it appears on the Mene:Log homepage
            so other churches can hear from you.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Your rating</Label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`${value} star`}
                  onClick={() => setRating(value)}
                >
                  <Star
                    className={`size-7 ${value <= rating ? "fill-primary text-primary" : "text-muted-foreground"}`}
                  />
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="quote">Your review</Label>
            <textarea
              id="quote"
              required
              minLength={20}
              maxLength={600}
              rows={4}
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
              className="w-full rounded-md border border-input bg-background p-3 text-sm"
              placeholder="What changed for your church since you started using Mene:Log?"
            />
            <p className="text-xs text-muted-foreground">{quote.length}/600</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="rname">Your name</Label>
              <Input
                id="rname"
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rrole">Your role</Label>
              <Input
                id="rrole"
                maxLength={80}
                placeholder="Senior Pastor"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Maybe later
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Sending…" : "Send review"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
