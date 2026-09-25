import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { QrCode, Sparkles, LogIn, UserPlus, ArrowRight, ShieldCheck, Mail, Lock, User } from "lucide-react";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordField } from "@/components/PasswordField";
import { passwordIsStrong } from "@/lib/password";
import { MeneLogLogo } from "@/components/MeneLogLogo";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({ mode: z.enum(["signin", "signup"]).optional() }),
  head: () => ({
    meta: [
      { title: "Sign in — Mene:Log" },
      { name: "description", content: "Sign in or create your church account on Mene:Log." },
      { property: "og:title", content: "Sign in — Mene:Log" },
      { property: "og:description", content: "Sign in or create your church account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { mode } = Route.useSearch();
  const [isSignUp, setIsSignUp] = useState(mode === "signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && session) navigate({ to: "/dashboard" });
  }, [loading, session, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSignUp && !passwordIsStrong(password)) {
      toast.error("Your password doesn't meet the requirements yet.");
      return;
    }
    setBusy(true);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        toast.success("Account created. Check your email to confirm, then sign in.");
        setIsSignUp(false);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back!");
        navigate({ to: "/dashboard" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
      {/* Visual brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-ink p-12 text-deep-foreground lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-20 -top-20 size-[32rem] rounded-full bg-primary/25 blur-[120px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-20 -right-20 size-[28rem] rounded-full bg-accent/20 blur-[100px]"
        />

        <Link to="/" className="relative flex items-center gap-3 font-display text-xl font-bold">
          <MeneLogLogo variant="light" className="h-10 max-w-40" />
        </Link>

        <div className="relative max-w-lg space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1 text-xs font-semibold backdrop-blur-md">
            <Sparkles className="size-3.5 text-primary" /> Multi-Tenant Church Cloud
          </div>
          <h2 className="font-display text-4xl font-extrabold leading-[1.15] text-deep-foreground xl:text-5xl">
            Attendance that still exists on Tuesday morning.
          </h2>
          <p className="text-base leading-relaxed text-deep-foreground/75">
            Instant door check-in, complete membership registry, leadership structures, and transparent reporting for growing congregations.
          </p>
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10 text-xs">
            <div className="flex items-center gap-2 text-deep-foreground/80">
              <ShieldCheck className="size-4 text-primary" /> Isolated Church DB
            </div>
            <div className="flex items-center gap-2 text-deep-foreground/80">
              <QrCode className="size-4 text-primary" /> 4-Second QR Check-in
            </div>
          </div>
        </div>

        <div className="relative flex items-center justify-between text-xs text-deep-foreground/50">
          <span>Prime Haven IT Solutions &amp; Consultancy</span>
          <span>© {new Date().getFullYear()} Mene:Log</span>
        </div>
      </div>

      {/* Interactive Form Panel */}
      <div className="relative flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-8 inline-flex items-center gap-2 font-display text-lg font-bold lg:hidden">
            <MeneLogLogo className="h-9 max-w-36" />
          </Link>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            className="surface rounded-3xl p-6 sm:p-8 shadow-xl backdrop-blur-xl"
          >
            {/* Interactive Toggle Pills */}
            <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-muted/70 p-1.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setIsSignUp(false)}
                className={`flex items-center justify-center gap-2 rounded-xl py-2.5 transition-all ${
                  !isSignUp
                    ? "bg-card text-foreground shadow-sm font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LogIn className="size-3.5" /> Sign in
              </button>
              <button
                type="button"
                onClick={() => setIsSignUp(true)}
                className={`flex items-center justify-center gap-2 rounded-xl py-2.5 transition-all ${
                  isSignUp
                    ? "bg-card text-foreground shadow-sm font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <UserPlus className="size-3.5" /> Create account
              </button>
            </div>

            <div className="mt-6">
              <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
                {isSignUp ? "Create your church account" : "Welcome back"}
              </h1>
              <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                {isSignUp
                  ? "Sign up to set up and manage your church workspace."
                  : "Sign in with your email and password."}
              </p>
            </div>

            <AnimatePresence mode="wait">
              <motion.form
                key={isSignUp ? "signup-form" : "signin-form"}
                initial={{ opacity: 0, x: isSignUp ? 12 : -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: isSignUp ? -12 : 12 }}
                transition={{ duration: 0.2 }}
                onSubmit={onSubmit}
                className="mt-6 space-y-4"
              >
                {isSignUp && (
                  <div className="space-y-1.5">
                    <Label htmlFor="name" className="text-xs font-semibold">Your full name</Label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-3 size-4 text-muted-foreground" />
                      <Input
                        id="name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        autoComplete="name"
                        required
                        maxLength={120}
                        placeholder="Pastor / Administrator name"
                        className="h-11 rounded-xl pl-10"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-semibold">Email address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3 size-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      required
                      placeholder="pastor@yourchurch.org"
                      className="h-11 rounded-xl pl-10"
                    />
                  </div>
                </div>

                {isSignUp ? (
                  <PasswordField
                    id="password"
                    label="Password"
                    value={password}
                    onChange={setPassword}
                  />
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password" className="text-xs font-semibold">Password</Label>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-3 size-4 text-muted-foreground" />
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        required
                        placeholder="••••••••••••"
                        className="h-11 rounded-xl pl-10"
                      />
                    </div>
                  </div>
                )}

                <Button
                  type="submit"
                  className="h-11 w-full gap-2 rounded-xl text-sm font-semibold shadow-md transition-all active:scale-[0.99]"
                  disabled={busy || (isSignUp && !passwordIsStrong(password))}
                >
                  {busy ? "Please wait…" : isSignUp ? "Create Account & Continue" : "Sign In to Church"}
                  {!busy && <ArrowRight className="size-4" />}
                </Button>
              </motion.form>
            </AnimatePresence>

            <div className="mt-6 border-t border-border/40 pt-4 text-center">
              <p className="text-xs text-muted-foreground">
                Want a guided church setup with package selection?{" "}
                <Link to="/onboarding" className="font-semibold text-primary hover:underline">
                  Start Onboarding Flow
                </Link>
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
