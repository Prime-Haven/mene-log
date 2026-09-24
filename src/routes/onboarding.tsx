import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ArrowLeft, ArrowRight, ShieldCheck, Sparkles, Building2, User, KeyRound, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant, type Tier } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordField } from "@/components/PasswordField";
import { passwordIsStrong } from "@/lib/password";
import { useCurrency } from "@/hooks/useCurrency";
import { formatUsd } from "@/lib/currency";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Set up your church — Mene:Log" },
      {
        name: "description",
        content: "Tell us about you and your church, choose a package and secure your account.",
      },
      { property: "og:title", content: "Set up your church — Mene:Log" },
      { property: "og:description", content: "Create your church account on Mene:Log in a guided onboarding flow." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Onboarding,
});

const tierCopy: Array<{
  id: Tier;
  name: string;
  price: string;
  priceNum: number;
  blurb: string;
  features: string[];
}> = [
  {
    id: "basic",
    name: "Basic",
    price: "$15",
    priceNum: 15,
    blurb: "Single-site congregation ready for digital attendance.",
    features: ["Branded QR check-in", "Full member registry", "Excel imports & exports", "Core attendance reports"],
  },
  {
    id: "standard",
    name: "Standard",
    price: "$30",
    priceNum: 30,
    blurb: "Structured churches with departments and cell leaders.",
    features: ["Everything in Basic", "Leader portal & access codes", "Department & cell groups", "Email broadcast engine"],
  },
  {
    id: "premium",
    name: "Premium",
    price: "$55",
    priceNum: 55,
    blurb: "Multi-branch ministries needing full control and automation.",
    features: ["Everything in Standard", "Multiple church branches", "SMS notifications", "Automated follow-up reminders"],
  },
];

const STEPS = ["About you", "Your church", "Pick package", "Security"] as const;

function toHandle(value: string) {
  return value.toLowerCase().trim().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

function Onboarding() {
  const currency = useCurrency();
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const { membership, isLoading } = useTenant();
  const qc = useQueryClient();

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [submitted, setSubmitted] = useState<"verification" | "complete" | null>(null);

  // Step 1: Personal
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");

  // Step 2: Church
  const [churchName, setChurchName] = useState("");
  const [churchCity, setChurchCity] = useState("");
  const [churchEmail, setChurchEmail] = useState("");
  const [churchPhone, setChurchPhone] = useState("");
  const [subdomain, setSubdomain] = useState("");

  // Step 3: Package
  const [tier, setTier] = useState<Tier>("standard");

  // Step 4: Security
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const hasSession = !loading && !!session;
  const suggestions = useMemo(() => {
    const base = toHandle(churchName);
    if (base.length < 3) return [];
    return Array.from(new Set([base, `${base}-church`, `${base}-${toHandle(churchCity)}`]))
      .filter((value) => value.length >= 3 && value.length <= 40)
      .slice(0, 3);
  }, [churchName, churchCity]);

  useEffect(() => {
    if (session?.user.email) setEmail((value) => value || session.user.email!);
  }, [session]);

  useEffect(() => {
    if (!isLoading && membership) navigate({ to: "/dashboard" });
  }, [isLoading, membership, navigate]);

  useEffect(() => {
    const value = subdomain.trim().toLowerCase();
    setAvailable(null);
    if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(value)) {
      setAvailable(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data } = await supabase.rpc("subdomain_available", { p_subdomain: value });
      if (!cancelled) setAvailable(data === true);
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [subdomain]);

  const stepValid = (() => {
    if (step === 0) return fullName.trim().length > 1 && /.+@.+\..+/.test(email) && phone.trim().length > 8 && location.trim().length > 1;
    if (step === 1) return churchName.trim().length > 1 && churchCity.trim().length > 1 && available === true;
    if (step === 2) return true;
    return hasSession || (passwordIsStrong(password) && password === confirm);
  })();

  async function finish() {
    setBusy(true);
    try {
      if (!hasSession) {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/onboarding-complete`,
            data: {
              onboarding_version: "1",
              full_name: fullName.trim(),
              phone: phone.trim(),
              location: location.trim(),
              church_name: churchName.trim(),
              church_city: churchCity.trim(),
              church_email: churchEmail.trim(),
              church_phone: churchPhone.trim(),
              subdomain: subdomain.trim().toLowerCase(),
              tier,
            },
          },
        });
        if (signUpError) throw signUpError;
        window.sessionStorage.setItem("menelog-onboarding-draft", JSON.stringify({ email, churchName, subdomain, tier }));
        setSubmitted("verification");
        toast.success("Check your email to verify your account and start your trial.");
        return;
      }

      // Keep the personal details on the account for the already-signed-in path too.
      await supabase.auth.updateUser({
        data: { full_name: fullName.trim(), phone: phone.trim(), location: location.trim() },
      });

      // The database reserves the address and creates the trial atomically.
      const { data: tenantId, error } = await supabase.rpc("provision_tenant", {
        p_name: churchName.trim(),
        p_subdomain: subdomain.trim().toLowerCase(),
        p_tier: tier,
        p_contact_email: churchEmail.trim() || email,
        ...(churchPhone.trim() ? { p_contact_phone: churchPhone.trim() } : phone ? { p_contact_phone: phone } : {}),
      });

      if (error) throw error;
      if (!tenantId) throw new Error("Your church account could not be created.");

      await qc.invalidateQueries({ queryKey: ["membership"] });
      setSubmitted("complete");
      toast.success("Your 14-day trial is ready and your church was submitted for approval.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not complete onboarding");
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <div className="mx-auto flex min-h-[80vh] max-w-xl items-center justify-center p-6 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="surface space-y-5 p-8 shadow-2xl backdrop-blur-xl"
        >
          <div className="mx-auto grid size-16 place-items-center rounded-3xl bg-primary/10 text-primary">
            <Clock className="size-8" />
          </div>
          <h1 className="font-display text-3xl font-bold">Registration Received!</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
             Thank you, <b className="text-foreground">{fullName}</b>. {submitted === "verification" ? <>We sent a verification link to <b className="text-foreground">{email}</b>. Your church and 14-day trial will be created after you confirm it.</> : <>Your account for <b className="text-foreground">{churchName}</b> is now on a 14-day {tier.toUpperCase()} trial and has been submitted for approval.</>}
          </p>
          <div className="rounded-2xl border border-border/60 bg-muted/30 p-4 text-left text-xs space-y-2">
            <p className="font-semibold text-foreground">What happens next?</p>
             <p className="text-muted-foreground">• Your permanent check-in address is <b>menelog.site/c/{subdomain}</b>.</p>
             <p className="text-muted-foreground">• {submitted === "verification" ? "Open the verification link on this device to complete registration." : "Our platform administrator will approve and activate your church workspace."}</p>
             <p className="text-muted-foreground">• Once verified, you can sign in anytime to access your dashboard.</p>
          </div>
          <Button asChild className="w-full rounded-xl">
             <Link to="/auth">{submitted === "verification" ? "I have verified my email" : "Go to Sign in"}</Link>
          </Button>
        </motion.div>
      </div>
    );
  }

  const selectedTier = tierCopy.find((t) => t.id === tier);
  if (!selectedTier) return null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-deep px-5 py-10 text-deep-foreground sm:py-14">
      <div aria-hidden className="motion-blur motion-blur-large left-[-12rem] top-[-8rem] opacity-45" />
      <div aria-hidden className="motion-blur motion-blur-small bottom-[8%] right-[-5rem] opacity-35 [animation-delay:-5s]" />
      <div className="relative z-10 mx-auto max-w-3xl">
      <div className="flex items-center justify-between">
        <p className="text-eyebrow">
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </p>
        <Link to="/" className="font-display text-lg font-bold text-deep-foreground">Mene:Log</Link>
      </div>

        <h1 className="mt-5 max-w-2xl font-display text-4xl font-bold text-deep-foreground sm:text-5xl">Set up your church on Mene:Log</h1>
       <p className="mt-3 max-w-xl text-sm text-deep-foreground/70">
         Four focused steps, then your 14-day trial begins. Pay from Billing when you are ready.
      </p>

      {/* Progress Bar */}
      <div className="mt-6 flex gap-2" aria-hidden>
        {STEPS.map((label, index) => (
          <span
            key={label}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              index <= step ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </div>

      <form
         className="mt-8 space-y-6 rounded-lg border border-deep-foreground/15 bg-background p-6 text-foreground shadow-2xl sm:p-8"
        onSubmit={(e) => {
          e.preventDefault();
          if (!stepValid) return;
           if (step < 3) setStep(step + 1);
          else void finish();
        }}
      >
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div
              key="step-0"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2 border-b border-border/40 pb-3">
                <User className="size-5 text-primary" />
                <h2 className="font-display text-base font-bold">Personal Administrator Profile</h2>
              </div>
              <Field label="Your full name" value={fullName} onChange={setFullName} autoComplete="name" required placeholder="Pastor / Elder Name" />
              <Field label="Your email" value={email} onChange={setEmail} type="email" autoComplete="email" required disabled={hasSession} placeholder="pastor@church.org" />
              <Field label="Your phone number" value={phone} onChange={setPhone} autoComplete="tel" required placeholder="024 000 0000" />
              <Field label="Where are you based?" value={location} onChange={setLocation} placeholder="Accra, Greater Accra" required />
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="step-1"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2 border-b border-border/40 pb-3">
                <Building2 className="size-5 text-primary" />
                <h2 className="font-display text-base font-bold">Church Information</h2>
              </div>
              <Field label="Church name" value={churchName} onChange={setChurchName} placeholder="Grace City Church" required />
              <Field label="City / Region" value={churchCity} onChange={setChurchCity} placeholder="Kumasi, Ashanti" required />
              <Field label="Church contact email" value={churchEmail} onChange={setChurchEmail} type="email" placeholder="office@gracecity.org" />
              <Field label="Church contact phone" value={churchPhone} onChange={setChurchPhone} placeholder="030 000 0000" />

              <div className="space-y-2 pt-2">
                <Label htmlFor="subdomain">Permanent check-in address</Label>
                <div className="flex items-center rounded-xl border border-input bg-background/80 px-3 focus-within:ring-2 focus-within:ring-primary/20">
                  <span className="text-xs font-semibold text-muted-foreground">menelog.site/c/</span>
                  <input
                    id="subdomain"
                    className="h-11 flex-1 bg-transparent px-2 text-sm font-semibold outline-none"
                    value={subdomain}
                    onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    placeholder="gracecity"
                    required
                  />
                  {available === true && <span className="text-xs font-bold text-success">✓ Available</span>}
                  {available === false && <span className="text-xs font-bold text-destructive">Taken</span>}
                </div>
                {suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {suggestions.map((suggestion) => (
                      <Button key={suggestion} type="button" size="sm" variant="outline" onClick={() => setSubdomain(suggestion)}>
                        {suggestion}
                      </Button>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">This address is checked against every church before it can be reserved.</p>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step-2"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2 border-b border-border/40 pb-3">
                <Sparkles className="size-5 text-primary" />
                <h2 className="font-display text-base font-bold">Select Your Church Package</h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                {tierCopy.map((t) => {
                  const selected = t.id === tier;
                  return (
                    <Button
                      key={t.id}
                      type="button"
                      onClick={() => setTier(t.id)}
                      variant="outline"
                      className={`relative h-auto whitespace-normal flex-col items-stretch justify-between rounded-lg p-4 text-left ${
                        selected
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-md"
                          : "border-border hover:bg-muted/30"
                      }`}
                    >
                      {selected && (
                        <span className="absolute -top-2.5 right-4 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                          Selected
                        </span>
                      )}
                      <div>
                        <p className="font-display font-bold text-lg">{t.name}</p>
                        <p className="mt-1 text-2xl font-extrabold text-primary">
                          {formatUsd(t.priceNum, currency)} <span className="text-xs font-normal text-muted-foreground">/mo</span>
                        </p>
                        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t.blurb}</p>
                      </div>
                      <ul className="mt-4 space-y-1.5 border-t border-border/40 pt-3 text-[11px] text-muted-foreground">
                        {t.features.map((f) => (
                          <li key={f} className="flex items-center gap-1.5">
                            <Check className="size-3 text-success shrink-0" />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </Button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step-3"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2 border-b border-border/40 pb-3">
                <KeyRound className="size-5 text-primary" />
                <h2 className="font-display text-base font-bold">Security Credentials</h2>
              </div>
               <div className="grid gap-5 sm:grid-cols-2">
                 <PasswordField id="pass" label="Create account password" value={password} onChange={setPassword} />
                 <div className="space-y-1.5"><Label htmlFor="confirm">Confirm password</Label><Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required maxLength={16}/>{confirm.length > 0 && confirm !== password && <p className="text-xs text-destructive">Both passwords must match.</p>}</div>
               </div>
               <div className="rounded-lg border border-primary/20 bg-primary/5 p-4"><p className="font-semibold">14-day {selectedTier.name} trial</p><p className="mt-1 text-xs text-muted-foreground">No payment is collected now. Your monthly price will be {formatUsd(selectedTier.priceNum, currency)} when you choose to pay from Billing.</p></div>
              <div className="flex items-start gap-2 pt-2 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-4 text-primary shrink-0" />
                <span>
           After submitting, your trial starts and the platform operator reviews your church account.
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center justify-between gap-3 border-t border-border/40 pt-4">
          <Button
            type="button"
            variant="ghost"
            disabled={step === 0 || busy}
            onClick={() => setStep(step - 1)}
            className="gap-2 rounded-xl"
          >
            <ArrowLeft className="size-4" /> Back
          </Button>
          <Button
            type="submit"
            disabled={!stepValid || busy}
            className="gap-2 rounded-xl px-6"
          >
             {busy ? "Processing…" : step < 3 ? "Continue" : "Start 14-day trial"}
            {!busy && <ArrowRight className="size-4" />}
          </Button>
        </div>
      </form>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
} & Omit<React.ComponentProps<typeof Input>, "value" | "onChange">) {
  const id = label.toLowerCase().replace(/[^a-z]+/g, "-");
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-semibold">{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={160}
        className="h-11 rounded-xl"
        {...rest}
      />
    </div>
  );
}
