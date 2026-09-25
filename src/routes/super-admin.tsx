import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MfaChallenge, MfaEnroll } from "@/components/TwoStep";
import { useServerFn } from "@tanstack/react-start";
import { operatorSignIn } from "@/lib/operator.functions";

export const Route = createFileRoute("/super-admin")({
  head: () => ({ meta: [
    { title: "Prime Haven operator sign in — Mene:Log" },
    { name: "description", content: "Restricted Prime Haven operator access for Mene:Log platform administration." },
    { property: "og:title", content: "Prime Haven operator sign in — Mene:Log" },
    { property: "og:description", content: "Restricted Prime Haven operator access for Mene:Log platform administration." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex, nofollow" },
  ] }),
  component: SuperAdminSignIn,
});

function SuperAdminSignIn() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const signIn = useServerFn(operatorSignIn);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<"password" | "enroll" | "challenge">("password");

  // Operators must pass two-step sign-in; the console's data functions enforce it too.
  async function continueOperator() {
    const { data: isOp } = await supabase.rpc("is_platform_admin_account");
    if (isOp !== true) return false;
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === "aal2") navigate({ to: "/platform" });
    else setStage(aal?.nextLevel === "aal2" ? "challenge" : "enroll");
    return true;
  }

  useEffect(() => {
    if (loading || !session) return;
    void continueOperator();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, session]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await signIn({ data: { username, password } });
      if (!result.ok) throw new Error(result.error);
      const { error } = await supabase.auth.setSession({ access_token: result.access_token, refresh_token: result.refresh_token });
      if (error) throw error;
      if (!(await continueOperator())) {
        await supabase.auth.signOut();
        throw new Error("This entrance is restricted to Prime Haven operators.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-deep px-5 py-10 text-deep-foreground">
      <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md rounded-lg border border-deep-foreground/15 bg-background p-7 text-foreground shadow-2xl">
        <div className="grid size-11 place-items-center rounded-lg bg-primary text-primary-foreground"><ShieldCheck className="size-5" /></div>
        <p className="mt-6 text-eyebrow">Restricted entrance</p>
        <h1 className="mt-2 font-display text-3xl font-bold">Prime Haven console</h1>
        <p className="mt-2 text-sm text-muted-foreground">Manage church accounts, packages, billing health, and reviews. Church member records are never available here.</p>
        {stage !== "password" ? (
          <div className="mt-7">
            <p className="mb-3 text-sm font-semibold">{stage === "enroll" ? "Set up two-step sign-in to continue" : "Two-step sign-in"}</p>
            {stage === "enroll" ? <MfaEnroll onDone={() => navigate({ to: "/platform" })} /> : <MfaChallenge onDone={() => navigate({ to: "/platform" })} />}
          </div>
        ) : (
        <form onSubmit={submit} className="mt-7 space-y-4">
          <div className="space-y-2"><Label htmlFor="operator-username">Username</Label><Input id="operator-username" autoComplete="username" autoCapitalize="none" required maxLength={60} value={username} onChange={(event) => setUsername(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="operator-password">Password</Label><Input id="operator-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
          <Button type="submit" className="h-11 w-full" disabled={busy}>{busy ? "Checking access…" : "Sign in securely"}<ArrowRight /></Button>
        </form>
        )}
        <p className="mt-6 border-t pt-4 text-center text-xs text-muted-foreground">Church administrator? <Link to="/auth" className="font-semibold text-primary">Use church sign in</Link></p>
      </motion.section>
    </main>
  );
}