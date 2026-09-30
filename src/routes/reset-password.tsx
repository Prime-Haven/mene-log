import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { KeyRound, ArrowRight, ShieldCheck, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordField } from "@/components/PasswordField";
import { passwordIsStrong, PASSWORD_RULE_TEXT } from "@/lib/password";
import { MeneLogLogo } from "@/components/MeneLogLogo";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset Password — Mene:Log" },
      { name: "description", content: "Set a new password for your Mene:Log church account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  // Listen for Supabase recovery session
  useEffect(() => {
    supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        toast.info("Password recovery session active. Please enter your new password.");
      }
    });
  }, []);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordIsStrong(password)) {
      toast.error(PASSWORD_RULE_TEXT);
      return;
    }
    if (password !== confirmPassword) {
      toast.error("The two passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      toast.success("Your password has been updated successfully!");
      setTimeout(() => {
        navigate({ to: "/dashboard" });
      }, 2000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update password. Link may have expired.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-block">
            <MeneLogLogo className="h-10 max-w-48 mx-auto" />
          </Link>
        </div>

        <div className="rounded-3xl border border-border/80 bg-card/90 p-7 shadow-xl backdrop-blur-xl">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <KeyRound className="size-6" />
          </div>

          <h1 className="text-center font-display text-2xl font-bold tracking-tight text-foreground">
            Set new password
          </h1>
          <p className="mt-1 text-center text-xs text-muted-foreground sm:text-sm">
            Choose a strong password with at least 8 characters, an uppercase letter, lowercase, number and symbol.
          </p>

          {done ? (
            <div className="mt-6 space-y-4 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                <CheckCircle2 className="size-6" />
              </div>
              <p className="text-sm font-semibold text-foreground">Password updated!</p>
              <p className="text-xs text-muted-foreground">Redirecting you to your dashboard…</p>
              <Button asChild className="w-full rounded-xl">
                <Link to="/dashboard">Go to Dashboard</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleReset} className="mt-6 space-y-4">
              <PasswordField
                id="new-password"
                label="New Password"
                value={password}
                onChange={setPassword}
              />

              <div className="space-y-1.5">
                <Label htmlFor="confirm-password" className="text-xs font-semibold">
                  Confirm New Password
                </Label>
                <input
                  id="confirm-password"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="flex h-11 w-full rounded-xl border border-input bg-background px-3.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>

              <Button
                type="submit"
                disabled={busy || !passwordIsStrong(password) || password !== confirmPassword}
                className="h-11 w-full rounded-xl font-semibold gap-2 shadow-md"
              >
                {busy ? "Updating password…" : "Save New Password"}
                {!busy && <ArrowRight className="size-4" />}
              </Button>

              <div className="pt-2 text-center">
                <Link to="/auth" search={{ mode: "signin" }} className="text-xs text-muted-foreground hover:text-foreground">
                  Back to sign in
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
