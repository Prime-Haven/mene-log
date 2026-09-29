import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle, TriangleAlert } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/onboarding-complete")({
  head: () => ({
    meta: [
      { title: "Confirm your church — Mene:Log" },
      { name: "description", content: "Complete your verified Mene:Log church registration." },
      { property: "og:title", content: "Confirm your church — Mene:Log" },
      {
        property: "og:description",
        content: "Complete your verified Mene:Log church registration.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OnboardingComplete,
});

function OnboardingComplete() {
  const [state, setState] = useState<"working" | "complete" | "error">("working");
  const [message, setMessage] = useState("Confirming your email and preparing your church…");

  useEffect(() => {
    let active = true;
    async function complete() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        if (!active) return;
        setState("error");
        setMessage(
          "Your confirmation link is incomplete or expired. Sign in to continue your registration.",
        );
        return;
      }
      const { error } = await supabase.rpc("complete_verified_onboarding");
      if (!active) return;
      if (error) {
        setState("error");
        setMessage(error.message);
        return;
      }
      const rawDraft = window.sessionStorage.getItem("menelog-onboarding-draft");
      const userMeta = (sessionData.session.user.user_metadata ?? {}) as Record<string, string>;
      let draft: { email?: string; churchName?: string; subdomain?: string; tier?: string } = {};
      try {
        if (rawDraft) draft = JSON.parse(rawDraft);
      } catch {
        /* ignore */
      }

      const churchName = draft.churchName || userMeta.church_name || "New Church";
      const subdomain = draft.subdomain || userMeta.subdomain || "church";
      const tier = draft.tier || userMeta.tier || "standard";
      const contactEmail = draft.email || sessionData.session.user.email || "";

      if (contactEmail) {
        const { notifyNewChurchSignup } = await import("@/lib/settings.functions");
        void notifyNewChurchSignup({
          data: {
            churchName,
            subdomain,
            tier,
            contactEmail,
            contactPhone: userMeta.phone || userMeta.church_phone || null,
            adminName: userMeta.full_name || null,
          },
        });
      }

      window.sessionStorage.removeItem("menelog-onboarding-draft");
      setState("complete");
      setMessage("Your email is verified and your 14-day trial has started.");
    }
    void complete();
    return () => {
      active = false;
    };
  }, []);

  const Icon =
    state === "working" ? LoaderCircle : state === "complete" ? CheckCircle2 : TriangleAlert;
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-deep px-5 py-12 text-deep-foreground">
      <div aria-hidden className="motion-blur motion-blur-large" />
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-lg rounded-lg border border-deep-foreground/15 bg-background p-8 text-center text-foreground shadow-2xl"
      >
        <Icon
          className={`mx-auto size-10 text-primary ${state === "working" ? "animate-spin" : ""}`}
        />
        <h1 className="mt-5 font-display text-3xl font-bold">
          {state === "complete"
            ? "Welcome to Mene:Log"
            : state === "error"
              ? "We could not finish registration"
              : "Finishing registration"}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{message}</p>
        {state === "complete" && (
          <Button asChild className="mt-7 w-full">
            <Link to="/dashboard">Open your church</Link>
          </Button>
        )}
        {state === "error" && (
          <Button asChild variant="outline" className="mt-7 w-full">
            <Link to="/auth" search={{ mode: "signin" }}>
              Sign in to continue
            </Link>
          </Button>
        )}
      </motion.section>
    </main>
  );
}
