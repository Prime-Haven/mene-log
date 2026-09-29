import { getCheckinContext, requestBranch } from "@/lib/branches.functions";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import {
  CheckCircle2,
  Download,
  ShieldCheck,
  Share2,
  UserCog,
  LogIn,
  UserPlus,
  ArrowRight,
  Sparkles,
  Calendar,
  Lock,
  Mail,
  User,
  Phone,
  Building2,
  AlertCircle,
} from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  getBrandAssetUrl,
  getChurchBranding,
  getPublicOpenServices,
  submitSelfCheckin,
} from "@/lib/checkin.functions";
import { getPublicLeaderTypes, getPublicLeaders, registerLeader } from "@/lib/leaders.functions";
import { passwordChecks, passwordIsStrong, PASSWORD_RULE_TEXT } from "@/lib/password";
import { labelledQr } from "@/lib/qr";
import heroPoster from "@/assets/mene-worship-poster.jpg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/PasswordField";

export const Route = createFileRoute("/c/$subdomain")({
  head: () => ({
    meta: [
      { title: "Check in — Mene:Log" },
      {
        name: "description",
        content: "Check in to today's service and get your personal QR code.",
      },
      { property: "og:title", content: "Church check-in — Mene:Log" },
      {
        property: "og:description",
        content:
          "Check in to your church service in seconds and get your personal member QR code with Mene:Log.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CheckIn,
  errorComponent: () => (
    <div className="flex min-h-screen items-center justify-center p-6 text-center">
      <div className="surface max-w-md p-8">
        <h2 className="font-display text-xl font-bold">Check-in Unavailable</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          We could not load this church's check-in page. Please verify the web address or contact
          the church administrator.
        </p>
        <Button asChild className="mt-6">
          <Link to="/">Return to Mene:Log Home</Link>
        </Button>
      </div>
    </div>
  ),
});

const selectClass =
  "h-11 w-full rounded-xl border border-white/20 bg-neutral-900 text-white px-3 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all";

const educationLevels = [
  "No formal education",
  "Basic / JHS",
  "Secondary / SHS",
  "Technical / Vocational",
  "Diploma / HND",
  "Degree",
  "Masters",
  "Doctorate",
];

function CheckIn() {
  const { subdomain } = Route.useParams();
  const branding = useServerFn(getChurchBranding);
  const loadServices = useServerFn(getPublicOpenServices);
  const loadAsset = useServerFn(getBrandAssetUrl);
  const submit = useServerFn(submitSelfCheckin);
  const loadLeaders = useServerFn(getPublicLeaders);
  const loadLeaderTypes = useServerFn(getPublicLeaderTypes);
  const reduceMotion = useReducedMotion();
  const [tab, setTab] = useState<"member" | "leader" | "branch">("member");

  const { data: church } = useQuery({
    queryKey: ["branding", subdomain],
    queryFn: () => branding({ data: { subdomain } }),
  });

  const { data: services = [], isLoading: servicesLoading } = useQuery({
    queryKey: ["public-open-services", subdomain],
    queryFn: () => loadServices({ data: { subdomain } }),
  });

  const { data: leaders = [] } = useQuery({
    queryKey: ["public-leaders", subdomain],
    queryFn: () => loadLeaders({ data: { subdomain } }),
  });

  const { data: leaderTypes = [] } = useQuery({
    queryKey: ["public-leader-types", subdomain],
    queryFn: () => loadLeaderTypes({ data: { subdomain } }),
  });

  const { data: logoUrl } = useQuery({
    queryKey: ["brand-asset", church?.logo_path],
    enabled: !!church?.logo_path,
    queryFn: () => loadAsset({ data: { path: church!.logo_path! } }),
  });

  const { data: backgroundUrl } = useQuery({
    queryKey: ["brand-asset", church?.background_path],
    enabled: !!church?.background_path,
    queryFn: () => loadAsset({ data: { path: church!.background_path! } }),
  });

  const { data: ctx } = useQuery({
    queryKey: ["checkin-context", subdomain],
    queryFn: () => getCheckinContext({ data: { subdomain } }),
    staleTime: 60_000,
  });
  const leaderAreaOpen = ctx
    ? ctx.leaders
    : church?.tier === "standard" || church?.tier === "premium";
  const showQr = ctx ? ctx.qr : church?.tier !== "free";
  const tabCount = 1 + (leaderAreaOpen ? 1 : 0) + (ctx?.acceptsBranches ? 1 : 0);

  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    date_of_birth: "",
    gender: "",
    marital_status: "",
    residential_area: "",
    occupation: "",
    education_level: "",
    invited_by_leader_id: "",
    invited_by_custom: "",
    service_id: "",
  });

  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{
    qr: string;
    token: string;
    returning: boolean;
    service: string;
    file: string;
  } | null>(null);
  const isiPhone =
    typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);

  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const markTouched = (field: string) => {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  };

  const validateFullName = (val: string): string | null => {
    const trimmed = val.trim();
    if (!trimmed) return "Full name is required";
    if (trimmed.length < 2) return "Name must be at least 2 characters";
    if (!/[a-zA-Z]/.test(trimmed)) return "Name must contain letters";
    return null;
  };

  const validatePhone = (val: string): string | null => {
    const trimmed = val.trim();
    if (!trimmed) return "Phone number is required";
    const clean = trimmed.replace(/[\s()-]/g, "");
    if (clean.length < 9) return "Phone number must be at least 9 digits";
    if (clean.length > 17) return "Phone number is too long";
    if (clean.startsWith("+")) {
      if (!/^\+[0-9]{9,16}$/.test(clean)) {
        return "Enter a valid international phone format (e.g. +233 24 123 4567)";
      }
    } else {
      if (!/^[0-9]{9,15}$/.test(clean)) {
        return "Enter valid digits only (e.g. 024 123 4567)";
      }
      if (clean.startsWith("0") && clean.length !== 10) {
        return "Local Ghanaian phone number must be 10 digits (e.g. 024 000 0000)";
      }
    }
    return null;
  };

  const validateEmail = (val: string): string | null => {
    const trimmed = val.trim();
    if (!trimmed) return null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return "Enter a valid email address (e.g. name@example.com)";
    }
    return null;
  };

  const validateDob = (val: string): string | null => {
    if (!val) return "Date of birth is required";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return "Enter a valid date (YYYY-MM-DD)";
    const [y, m, d] = val.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d);
    if (isNaN(dateObj.getTime())) return "Invalid calendar date";
    const now = new Date();
    if (dateObj > now) return "Date of birth cannot be in the future";
    const ageYears = (now.getTime() - dateObj.getTime()) / (365.25 * 24 * 3600 * 1000);
    if (ageYears < 1) return "Age must be at least 1 year old";
    if (ageYears > 120) return "Please enter a realistic birth date (under 120 years)";
    return null;
  };

  const validateResidential = (val: string): string | null => {
    const trimmed = val.trim();
    if (!trimmed) return "Where you live is required";
    if (trimmed.length < 2) return "Please enter your suburb, area, or landmark";
    return null;
  };

  const validateOccupation = (val: string): string | null => {
    const trimmed = val.trim();
    if (!trimmed) return "Occupation is required";
    if (trimmed.length < 2) return "Please enter your occupation or status (e.g. Student)";
    return null;
  };

  const fieldErrors = {
    full_name: validateFullName(form.full_name),
    phone: validatePhone(form.phone),
    email: validateEmail(form.email),
    date_of_birth: validateDob(form.date_of_birth),
    gender: !form.gender ? "Please select your gender" : null,
    marital_status: !form.marital_status ? "Please select your marital status" : null,
    residential_area: validateResidential(form.residential_area),
    occupation: validateOccupation(form.occupation),
  };

  const hasFormErrors = Object.values(fieldErrors).some((err) => err !== null);

  useEffect(() => {
    if (services.length > 0 && !form.service_id) {
      const today = new Date().toISOString().slice(0, 10);
      const todayService = services.find((s) => s.service_date === today);
      if (todayService) {
        setForm((current) => ({ ...current, service_id: todayService.id }));
      } else {
        setForm((current) => ({ ...current, service_id: services[0]!.id }));
      }
    }
  }, [services, form.service_id]);

  useEffect(() => {
    if (!done || isiPhone) return; // iPhone saves via press-and-hold
    const timer = window.setTimeout(() => {
      const a = document.createElement("a");
      a.href = done.qr;
      a.download = done.file;
      a.click();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [done, isiPhone]);

  async function saveQr() {
    if (!done) return;
    if (isiPhone && navigator.share) {
      try {
        const blob = await (await fetch(done.qr)).blob();
        const file = new File([blob], done.file, { type: "image/png" });
        await navigator.share({ title: "My church member code", files: [file] });
        return;
      } catch {
        /* Keep fallback below */
      }
    }
    const a = document.createElement("a");
    a.href = done.qr;
    a.download = done.file;
    if (isiPhone) window.open(done.qr, "_blank");
    else a.click();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({
      full_name: true,
      phone: true,
      email: true,
      date_of_birth: true,
      gender: true,
      marital_status: true,
      residential_area: true,
      occupation: true,
    });
    if (hasFormErrors) {
      setError("Please check and correct the highlighted fields above.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await submit({
        data: {
          subdomain,
          full_name: form.full_name,
          phone: form.phone,
          email: form.email,
          date_of_birth: form.date_of_birth,
          gender: form.gender as "male" | "female",
          marital_status: form.marital_status as
            "single" | "married" | "divorced" | "widowed" | "separated" | "prefer_not_to_say",
          residential_area: form.residential_area,
          occupation: form.occupation,
          education_level: form.education_level,
          invited_by_leader_id:
            form.invited_by_leader_id === "other" ? "" : form.invited_by_leader_id,
          service_id: form.service_id,
          consent: true as const,
        },
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const qr = await labelledQr(result.token, church?.name ?? "", form.full_name);
      const slug = (v: string) =>
        v
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
      setDone({
        qr,
        token: result.token,
        returning: result.returning,
        service: result.service,
        file: `${slug(church?.name ?? "church")}-${slug(form.full_name)}-qr.png`,
      });
    } catch {
      setError("Something went wrong. Please ask an usher for help.");
    } finally {
      setBusy(false);
    }
  }

  if (church === null) {
    return (
      <div className="grid min-h-screen place-items-center px-5 text-center">
        <p className="text-sm text-muted-foreground">This church check-in page does not exist.</p>
      </div>
    );
  }

  const heroBg = backgroundUrl ?? heroPoster;
  const HeroBackdrop = () => (
    <div aria-hidden className="fixed inset-0 z-0 overflow-hidden">
      <img src={heroBg} alt="" className="size-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/70 to-black/90" />
      <div className="motion-blur motion-blur-large left-[-12rem] top-[-8rem] opacity-40" />
      <div className="motion-blur motion-blur-small bottom-[8%] right-[-5rem] opacity-30 [animation-delay:-5s]" />
    </div>
  );

  if (done) {
    return (
      <div className="dark relative flex min-h-screen items-center justify-center p-4 text-foreground">
        <HeroBackdrop />
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative z-10 w-full max-w-sm rounded-3xl border border-white/15 bg-black/40 p-6 text-center shadow-2xl backdrop-blur-xl"
        >
          {logoUrl && (
            <img
              src={logoUrl}
              alt={`${church?.name ?? "Church"} logo`}
              className="mx-auto mb-3 h-14 max-w-40 object-contain"
            />
          )}
          <p className="font-display text-lg font-extrabold uppercase tracking-wide">
            {church?.name}
          </p>
          <div className="mx-auto mt-4 grid size-12 place-items-center rounded-2xl bg-success/15 text-success">
            <CheckCircle2 className="size-6" />
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold">You're checked in!</h1>
          <p className="mt-1 text-sm text-muted-foreground">{done.service}</p>
          {!showQr ? (
            <p className="mt-6 rounded-2xl border border-white/15 bg-white/5 p-4 text-sm text-white/80">
              You're on the register. An usher will mark your attendance at the service — just give
              them your name.
            </p>
          ) : (
            <>
              <div className="mt-6 rounded-2xl bg-white p-4">
                <img
                  src={done.qr}
                  alt="Your member check-in QR code"
                  className="mx-auto aspect-square w-full max-w-[240px]"
                />
              </div>
              <p className="mt-3 text-[11px] uppercase tracking-wide text-muted-foreground">
                Member code (for Watch Live)
              </p>
              <p className="select-all break-all font-mono text-xs text-white/90">{done.token}</p>
              <p className="mt-4 text-xs text-muted-foreground">
                {isiPhone
                  ? "iPhone: press and hold the code above, then tap “Save to Photos”. Show it at the door next time."
                  : "Your code has downloaded. Show it at the door next time for instant check-in."}
              </p>
            </>
          )}
          <div className="mt-6 flex flex-col gap-2">
            {showQr && (
              <Button onClick={saveQr} className="gap-2 rounded-xl">
                <Download className="size-4" /> Save member code
              </Button>
            )}
            <Button variant="outline" onClick={() => setDone(null)} className="rounded-xl">
              Check in another person
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div
      className="dark relative min-h-svh px-4 py-8 text-foreground sm:py-12"
      style={
        {
          "--church-primary": church?.brand_primary ?? "#3b82f6",
          "--church-accent": church?.brand_accent ?? "#0f172a",
        } as React.CSSProperties
      }
    >
      <HeroBackdrop />
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 mx-auto max-w-md"
      >
        <div className="text-center">
          {logoUrl && (
            <img
              src={logoUrl}
              alt={`${church?.name ?? "Church"} logo`}
              className="mx-auto mb-4 h-24 max-w-56 object-contain drop-shadow-[0_8px_30px_rgba(0,0,0,0.6)]"
            />
          )}
          <h1 className="font-display text-3xl font-extrabold uppercase leading-tight tracking-tight text-white sm:text-4xl">
            {church?.name ?? "Loading…"}
          </h1>
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="size-3" /> Welcome — let's check you in
          </span>
          <p className="mt-3 text-xs leading-relaxed text-white/70 sm:text-sm">
            {church?.welcome_message ||
              "Fill in your details below to check in and receive your personal QR code."}
          </p>
          {(ctx ? ctx.watchLive : church?.tier === "premium") && (
            <Link
              to="/live/$subdomain"
              params={{ subdomain }}
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-destructive/80 px-4 py-2 text-xs font-semibold text-destructive-foreground shadow-lg backdrop-blur transition-transform hover:scale-105"
            >
              <span className="size-2 animate-pulse rounded-full bg-destructive-foreground" /> Watch
              Live
            </Link>
          )}
          {ctx?.parent && (
            <p className="mt-3 text-xs text-white/60">
              A branch of{" "}
              <Link
                to="/c/$subdomain"
                params={{ subdomain: ctx.parent.subdomain }}
                className="font-semibold text-white underline-offset-2 hover:underline"
              >
                {ctx.parent.name}
              </Link>
            </p>
          )}
        </div>

        {/* Member / Leader / Branch tab switch */}
        <div
          className={`mt-6 grid gap-1.5 rounded-2xl border border-white/20 bg-black/40 p-1.5 shadow-md backdrop-blur-xl ${tabCount === 3 ? "grid-cols-3" : tabCount === 2 ? "grid-cols-2" : "grid-cols-1"}`}
        >
          <Button
            type="button"
            variant="ghost"
            onClick={() => setTab("member")}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-all sm:text-sm ${
              tab === "member"
                ? "bg-primary text-primary-foreground shadow-md"
                : "text-white/80 hover:text-white hover:bg-white/10"
            }`}
          >
            <User className="size-4" /> Member Check-in
          </Button>
          {leaderAreaOpen && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setTab("leader")}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-all sm:text-sm ${
                tab === "leader"
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-white/80 hover:text-white hover:bg-white/10"
              }`}
            >
              <UserCog className="size-4" /> Leader Area
            </Button>
          )}
          {ctx?.acceptsBranches && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setTab("branch")}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-all sm:text-sm ${
                tab === "branch"
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-white/80 hover:text-white hover:bg-white/10"
              }`}
            >
              <Building2 className="size-4" /> Branch Portal
            </Button>
          )}
        </div>

        {tab === "branch" && ctx?.acceptsBranches ? (
          <BranchArea
            parent={subdomain}
            churchName={church?.name ?? "this church"}
            branches={ctx.branches}
          />
        ) : tab === "leader" ? (
          <LeaderArea
            subdomain={subdomain}
            churchName={church?.name ?? "this church"}
            leaderTypes={leaderTypes}
          />
        ) : (
          <form
            onSubmit={onSubmit}
            className="mt-6 min-h-[460px] rounded-3xl border border-white/15 bg-black/40 space-y-4 p-5 sm:p-6 shadow-xl backdrop-blur-xl text-white"
          >
            <div className="space-y-1.5">
              <Label htmlFor="service" className="text-xs font-semibold">
                Service
              </Label>
              <select
                id="service"
                required
                className={selectClass}
                value={form.service_id}
                onChange={(e) => setForm({ ...form, service_id: e.target.value })}
                disabled={services.length === 0}
              >
                <option value="">
                  {servicesLoading
                    ? "Loading services…"
                    : services.length
                      ? "Select a service"
                      : "No open service available"}
                </option>
                {services.map((service) => {
                  const isDefault =
                    service.is_default ||
                    service.service_type === "sunday" ||
                    service.service_type === "midweek" ||
                    service.service_type === "prayer" ||
                    service.name.toLowerCase() === "sunday service" ||
                    service.name.toLowerCase() === "midweek service" ||
                    service.name.toLowerCase() === "prayer service";

                  // Default services: NO date attached!
                  if (isDefault) {
                    return (
                      <option key={service.id} value={service.id}>
                        {service.name}
                      </option>
                    );
                  }

                  // Only admin-created services have dates attached:
                  const parts = (service.service_date || "").split("-").map(Number);
                  const d =
                    parts.length === 3
                      ? new Date(parts[0]!, parts[1]! - 1, parts[2]!)
                      : new Date(service.service_date ?? "");
                  const dateStr = !isNaN(d.getTime())
                    ? d.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : service.service_date;
                  const themeStr = service.theme ? ` • "${service.theme}"` : "";
                  return (
                    <option key={service.id} value={service.id}>
                      {service.name}
                      {themeStr} ({dateStr})
                    </option>
                  );
                })}
              </select>
              {!servicesLoading && services.length === 0 && (
                <p className="text-xs text-destructive">
                  Please ask an usher or admin to open a service.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="n" className="text-xs font-semibold text-white/90">
                  Full name
                </Label>
                {touched.full_name && !fieldErrors.full_name && (
                  <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="size-3" /> Valid
                  </span>
                )}
              </div>
              <Input
                id="n"
                required
                minLength={2}
                value={form.full_name}
                onBlur={() => markTouched("full_name")}
                onChange={(e) => {
                  markTouched("full_name");
                  setForm({ ...form, full_name: e.target.value });
                }}
                placeholder="First and last name"
                className={`h-11 rounded-xl text-white transition-colors ${
                  touched.full_name && fieldErrors.full_name
                    ? "border-rose-500/70 bg-rose-500/10 placeholder:text-rose-300/40 focus:border-rose-400 focus:bg-rose-500/15"
                    : touched.full_name && !fieldErrors.full_name
                      ? "border-emerald-500/50 bg-emerald-500/5 placeholder:text-white/40 focus:border-emerald-400"
                      : "border-white/20 bg-white/10 placeholder:text-white/40 focus:border-primary focus:bg-white/15"
                }`}
              />
              {touched.full_name && fieldErrors.full_name && (
                <p className="text-xs text-rose-400 font-medium flex items-center gap-1.5 mt-1">
                  <AlertCircle className="size-3.5 shrink-0" /> {fieldErrors.full_name}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="p" className="text-xs font-semibold text-white/90">
                  Phone number
                </Label>
                {touched.phone && !fieldErrors.phone && (
                  <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="size-3" /> Valid
                  </span>
                )}
              </div>
              <Input
                id="p"
                required
                inputMode="tel"
                placeholder="024 000 0000 or +233..."
                value={form.phone}
                onBlur={() => markTouched("phone")}
                onChange={(e) => {
                  markTouched("phone");
                  setForm({ ...form, phone: e.target.value });
                }}
                className={`h-11 rounded-xl text-white transition-colors ${
                  touched.phone && fieldErrors.phone
                    ? "border-rose-500/70 bg-rose-500/10 placeholder:text-rose-300/40 focus:border-rose-400 focus:bg-rose-500/15"
                    : touched.phone && !fieldErrors.phone
                      ? "border-emerald-500/50 bg-emerald-500/5 placeholder:text-white/40 focus:border-emerald-400"
                      : "border-white/20 bg-white/10 placeholder:text-white/40 focus:border-primary focus:bg-white/15"
                }`}
              />
              {touched.phone && fieldErrors.phone && (
                <p className="text-xs text-rose-400 font-medium flex items-center gap-1.5 mt-1">
                  <AlertCircle className="size-3.5 shrink-0" /> {fieldErrors.phone}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="email" className="text-xs font-semibold text-white/90">
                  Email <span className="font-normal text-white/50">(optional)</span>
                </Label>
                {touched.email && form.email && !fieldErrors.email && (
                  <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="size-3" /> Valid
                  </span>
                )}
              </div>
              <Input
                id="email"
                type="email"
                inputMode="email"
                maxLength={160}
                value={form.email}
                onBlur={() => markTouched("email")}
                onChange={(e) => {
                  markTouched("email");
                  setForm({ ...form, email: e.target.value });
                }}
                placeholder="your.email@example.com"
                className={`h-11 rounded-xl text-white transition-colors ${
                  touched.email && fieldErrors.email
                    ? "border-rose-500/70 bg-rose-500/10 placeholder:text-rose-300/40 focus:border-rose-400 focus:bg-rose-500/15"
                    : touched.email && form.email && !fieldErrors.email
                      ? "border-emerald-500/50 bg-emerald-500/5 placeholder:text-white/40 focus:border-emerald-400"
                      : "border-white/20 bg-white/10 placeholder:text-white/40 focus:border-primary focus:bg-white/15"
                }`}
              />
              {touched.email && fieldErrors.email && (
                <p className="text-xs text-rose-400 font-medium flex items-center gap-1.5 mt-1">
                  <AlertCircle className="size-3.5 shrink-0" /> {fieldErrors.email}
                </p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="d" className="text-xs font-semibold text-white/90">
                    Date of birth
                  </Label>
                  {touched.date_of_birth && !fieldErrors.date_of_birth && (
                    <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                      <CheckCircle2 className="size-3" /> Valid
                    </span>
                  )}
                </div>
                <Input
                  id="d"
                  type="date"
                  required
                  max={new Date().toISOString().slice(0, 10)}
                  value={form.date_of_birth}
                  onBlur={() => markTouched("date_of_birth")}
                  onChange={(e) => {
                    markTouched("date_of_birth");
                    setForm({ ...form, date_of_birth: e.target.value });
                  }}
                  className={`h-11 rounded-xl text-white transition-colors ${
                    touched.date_of_birth && fieldErrors.date_of_birth
                      ? "border-rose-500/70 bg-rose-500/10 focus:border-rose-400 focus:bg-rose-500/15"
                      : touched.date_of_birth && !fieldErrors.date_of_birth
                        ? "border-emerald-500/50 bg-emerald-500/5 focus:border-emerald-400"
                        : "border-white/20 bg-white/10 focus:border-primary focus:bg-white/15"
                  }`}
                />
                {touched.date_of_birth && fieldErrors.date_of_birth && (
                  <p className="text-xs text-rose-400 font-medium flex items-center gap-1.5 mt-1">
                    <AlertCircle className="size-3.5 shrink-0" /> {fieldErrors.date_of_birth}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="g" className="text-xs font-semibold text-white/90">
                    Gender
                  </Label>
                  {touched.gender && !fieldErrors.gender && (
                    <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                      <CheckCircle2 className="size-3" /> Selected
                    </span>
                  )}
                </div>
                <select
                  id="g"
                  required
                  className={`${selectClass} ${
                    touched.gender && fieldErrors.gender
                      ? "border-rose-500/70 bg-rose-500/10 focus:border-rose-400"
                      : touched.gender && !fieldErrors.gender
                        ? "border-emerald-500/50 bg-emerald-500/5"
                        : ""
                  }`}
                  value={form.gender}
                  onBlur={() => markTouched("gender")}
                  onChange={(e) => {
                    markTouched("gender");
                    setForm({ ...form, gender: e.target.value });
                  }}
                >
                  <option value="" className="bg-neutral-900 text-white">Select gender</option>
                  <option value="male" className="bg-neutral-900 text-white">Male</option>
                  <option value="female" className="bg-neutral-900 text-white">Female</option>
                </select>
                {touched.gender && fieldErrors.gender && (
                  <p className="text-xs text-rose-400 font-medium flex items-center gap-1.5 mt-1">
                    <AlertCircle className="size-3.5 shrink-0" /> {fieldErrors.gender}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="marital" className="text-xs font-semibold text-white/90">
                  Marital status
                </Label>
                {touched.marital_status && !fieldErrors.marital_status && (
                  <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="size-3" /> Selected
                  </span>
                )}
              </div>
              <select
                id="marital"
                required
                className={`${selectClass} ${
                  touched.marital_status && fieldErrors.marital_status
                    ? "border-rose-500/70 bg-rose-500/10 focus:border-rose-400"
                    : touched.marital_status && !fieldErrors.marital_status
                      ? "border-emerald-500/50 bg-emerald-500/5"
                      : ""
                }`}
                value={form.marital_status}
                onBlur={() => markTouched("marital_status")}
                onChange={(e) => {
                  markTouched("marital_status");
                  setForm({ ...form, marital_status: e.target.value });
                }}
              >
                <option value="" className="bg-neutral-900 text-white">Select status</option>
                <option value="single" className="bg-neutral-900 text-white">Single</option>
                <option value="married" className="bg-neutral-900 text-white">Married</option>
                <option value="divorced" className="bg-neutral-900 text-white">Divorced</option>
                <option value="widowed" className="bg-neutral-900 text-white">Widowed</option>
                <option value="separated" className="bg-neutral-900 text-white">Separated</option>
                <option value="prefer_not_to_say" className="bg-neutral-900 text-white">Prefer not to say</option>
              </select>
              {touched.marital_status && fieldErrors.marital_status && (
                <p className="text-xs text-rose-400 font-medium flex items-center gap-1.5 mt-1">
                  <AlertCircle className="size-3.5 shrink-0" /> {fieldErrors.marital_status}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="a" className="text-xs font-semibold text-white/90">
                  Where do you live?
                </Label>
                {touched.residential_area && !fieldErrors.residential_area && (
                  <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="size-3" /> Valid
                  </span>
                )}
              </div>
              <Input
                id="a"
                required
                maxLength={120}
                value={form.residential_area}
                onBlur={() => markTouched("residential_area")}
                onChange={(e) => {
                  markTouched("residential_area");
                  setForm({ ...form, residential_area: e.target.value });
                }}
                placeholder="Suburb, neighborhood or landmark"
                className={`h-11 rounded-xl text-white transition-colors ${
                  touched.residential_area && fieldErrors.residential_area
                    ? "border-rose-500/70 bg-rose-500/10 placeholder:text-rose-300/40 focus:border-rose-400 focus:bg-rose-500/15"
                    : touched.residential_area && !fieldErrors.residential_area
                      ? "border-emerald-500/50 bg-emerald-500/5 placeholder:text-white/40 focus:border-emerald-400"
                      : "border-white/20 bg-white/10 placeholder:text-white/40 focus:border-primary focus:bg-white/15"
                }`}
              />
              {touched.residential_area && fieldErrors.residential_area && (
                <p className="text-xs text-rose-400 font-medium flex items-center gap-1.5 mt-1">
                  <AlertCircle className="size-3.5 shrink-0" /> {fieldErrors.residential_area}
                </p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="occupation" className="text-xs font-semibold text-white/90">
                    Occupation
                  </Label>
                  {touched.occupation && !fieldErrors.occupation && (
                    <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                      <CheckCircle2 className="size-3" /> Valid
                    </span>
                  )}
                </div>
                <Input
                  id="occupation"
                  required
                  maxLength={120}
                  value={form.occupation}
                  onBlur={() => markTouched("occupation")}
                  onChange={(e) => {
                    markTouched("occupation");
                    setForm({ ...form, occupation: e.target.value });
                  }}
                  placeholder="e.g. Student, Accountant"
                  className={`h-11 rounded-xl text-white transition-colors ${
                    touched.occupation && fieldErrors.occupation
                      ? "border-rose-500/70 bg-rose-500/10 placeholder:text-rose-300/40 focus:border-rose-400 focus:bg-rose-500/15"
                      : touched.occupation && !fieldErrors.occupation
                        ? "border-emerald-500/50 bg-emerald-500/5 placeholder:text-white/40 focus:border-emerald-400"
                        : "border-white/20 bg-white/10 placeholder:text-white/40 focus:border-primary focus:bg-white/15"
                  }`}
                />
                {touched.occupation && fieldErrors.occupation && (
                  <p className="text-xs text-rose-400 font-medium flex items-center gap-1.5 mt-1">
                    <AlertCircle className="size-3.5 shrink-0" /> {fieldErrors.occupation}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="education" className="text-xs font-semibold text-white/90">
                  Educational level
                </Label>
                <select
                  id="education"
                  className={selectClass}
                  value={form.education_level}
                  onChange={(e) => setForm({ ...form, education_level: e.target.value })}
                >
                  <option value="" className="bg-neutral-900 text-white">Select level</option>
                  {educationLevels.map((level) => (
                    <option key={level} value={level} className="bg-neutral-900 text-white">
                      {level}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="leader" className="text-xs font-semibold text-white/90">
                Who invited you?
              </Label>
              <select
                id="leader"
                className={selectClass}
                value={form.invited_by_leader_id}
                onChange={(e) => setForm({ ...form, invited_by_leader_id: e.target.value })}
              >
                <option value="" className="bg-neutral-900 text-white">Self / walk-in</option>
                {leaderAreaOpen &&
                  leaders.map((leader) => (
                    <option key={leader.id} value={leader.id} className="bg-neutral-900 text-white">
                      {leader.full_name}
                      {leader.leader_type ? ` — ${leader.leader_type}` : ""}
                    </option>
                  ))}
              </select>
            </div>

            <label className="flex items-start gap-2.5 rounded-xl border border-white/15 bg-white/5 p-3 text-xs leading-relaxed text-white/80">
              <input
                type="checkbox"
                className="mt-0.5 size-4 rounded border-white/20"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                required
              />
              <span>
                I agree to {church?.name ?? "this church"} keeping my details to record attendance
                and contact me for pastoral care.
              </span>
            </label>

            {error && <p className="text-sm font-medium text-destructive">{error}</p>}

            <Button
              type="submit"
              className="h-12 w-full rounded-xl text-base font-semibold shadow-lg transition-transform active:scale-[0.99]"
              style={{ backgroundColor: church?.brand_primary }}
              disabled={busy || !consent || services.length === 0}
            >
              {busy ? "Checking you in…" : church?.submit_button_text || "Check In"}
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-[11px] text-white/50">
          Powered by Mene:Log · Protected by the privacy guarantee · No public directory access
        </p>
      </motion.div>
    </div>
  );
}

function BranchArea({
  parent,
  churchName,
  branches,
}: {
  parent: string;
  churchName: string;
  branches: Array<{ name: string; subdomain: string }>;
}) {
  const navigate = useNavigate();
  const [branchMode, setBranchMode] = useState<"login" | "register">("login");

  // Branch Login state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState("");

  // Branch Register state
  const [f, setF] = useState({
    name: "",
    subdomain: "",
    city: "",
    contact_name: "",
    email: "",
    phone: "",
    password: "",
    confirm: "",
  });
  const [busy, setBusy] = useState(false);
  const [registerError, setRegisterError] = useState("");
  const [sent, setSent] = useState<string | null>(null);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({
      ...f,
      [k]:
        k === "subdomain"
          ? e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")
          : e.target.value,
    });

  async function handleBranchLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginBusy(true);
    setLoginError("");
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword,
      });
      if (error) throw error;
      toast.success("Welcome back! Loading your branch dashboard…");
      navigate({ to: "/dashboard" });
    } catch (err) {
      setLoginError(
        err instanceof Error ? err.message : "Could not sign in with these branch credentials.",
      );
    } finally {
      setLoginBusy(false);
    }
  }

  async function handleBranchRegister(e: React.FormEvent) {
    e.preventDefault();
    setRegisterError("");
    if (f.password.length < 8) {
      setRegisterError("Password must be at least 8 characters.");
      return;
    }
    if (f.password !== f.confirm) {
      setRegisterError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const r = await requestBranch({
        data: {
          parent,
          name: f.name,
          subdomain: f.subdomain,
          city: f.city,
          contact_name: f.contact_name,
          email: f.email,
          phone: f.phone,
          password: f.password,
        },
      });
      if (r.ok) setSent(r.message);
      else setRegisterError(r.message);
    } catch {
      setRegisterError("Please check the branch details and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 min-h-[460px] rounded-3xl border border-white/15 bg-black/40 p-5 sm:p-6 shadow-xl backdrop-blur-xl text-white space-y-4">
      {/* Existing Approved Branches List */}
      {branches.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-white/70">
            Approved Branches of {churchName}
          </p>
          <div className="mt-2.5 grid gap-2">
            {branches.map((b) => (
              <Link
                key={b.subdomain}
                to="/c/$subdomain"
                params={{ subdomain: b.subdomain }}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-xs transition-colors hover:bg-white/15"
              >
                <span className="font-semibold text-white">{b.name}</span>
                <span className="font-mono text-white/60">/c/{b.subdomain}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Branch Portal Sub-tab switcher */}
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-white/10 p-1 text-xs font-semibold border border-white/10">
        <button
          type="button"
          onClick={() => {
            setBranchMode("login");
            setSent(null);
          }}
          className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 transition-all ${
            branchMode === "login"
              ? "bg-white text-neutral-900 shadow-md font-bold"
              : "text-white/70 hover:text-white hover:bg-white/5"
          }`}
        >
          <LogIn className="size-3.5" /> Branch Admin Login
        </button>
        <button
          type="button"
          onClick={() => setBranchMode("register")}
          className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 transition-all ${
            branchMode === "register"
              ? "bg-white text-neutral-900 shadow-md font-bold"
              : "text-white/70 hover:text-white hover:bg-white/5"
          }`}
        >
          <Building2 className="size-3.5" /> Register a Branch
        </button>
      </div>

      <AnimatePresence mode="wait">
        {branchMode === "login" ? (
          <motion.form
            key="branch-login"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            onSubmit={handleBranchLogin}
            className="space-y-4 pt-1"
          >
            <div>
              <h2 className="font-display text-lg font-bold text-white">Branch Administrator Sign-In</h2>
              <p className="mt-1 text-xs text-white/70">
                Log into your approved branch church dashboard and management console.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="branch-email" className="text-xs font-semibold text-white/90">
                Branch Administrator Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3.5 size-4 text-white/50" />
                <Input
                  id="branch-email"
                  type="email"
                  required
                  placeholder="branch-admin@example.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="h-11 rounded-xl bg-white/10 border-white/20 text-white placeholder:text-white/40 pl-10 focus:border-primary focus:bg-white/15"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="branch-password" className="text-xs font-semibold text-white/90">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 size-4 text-white/50 z-10" />
                <PasswordInput
                  id="branch-password"
                  required
                  placeholder="••••••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="h-11 rounded-xl bg-white/10 border-white/20 text-white placeholder:text-white/40 pl-10 focus:border-primary focus:bg-white/15"
                />
              </div>
            </div>

            {loginError && (
              <p className="text-xs font-semibold text-rose-300 bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20">
                {loginError}
              </p>
            )}

            <Button type="submit" disabled={loginBusy} className="h-11 w-full rounded-xl">
              {loginBusy ? "Signing in…" : "Sign In to Branch Console"}
            </Button>

            <div className="text-center">
              <Button
                type="button"
                variant="link"
                onClick={() => setBranchMode("register")}
                className="text-xs text-primary-foreground/90 hover:underline"
              >
                Need to register a new branch? Submit branch request
              </Button>
            </div>
          </motion.form>
        ) : sent ? (
          <motion.div
            key="branch-sent"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-4 p-4 text-center"
          >
            <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-emerald-500/20 text-emerald-400">
              <CheckCircle2 className="size-6" />
            </div>
            <h2 className="font-display text-lg font-bold text-white">Branch Request Submitted</h2>
            <p className="text-xs text-white/80 leading-relaxed max-w-sm mx-auto">{sent}</p>
            <Button
              onClick={() => {
                setSent(null);
                setBranchMode("login");
              }}
              className="w-full rounded-xl"
            >
              Go to Branch Admin Login
            </Button>
          </motion.div>
        ) : (
          <motion.form
            key="branch-register"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            onSubmit={handleBranchRegister}
            className="space-y-3 pt-1"
          >
            <div>
              <h2 className="font-display text-lg font-bold text-white">Register a branch of {churchName}</h2>
              <p className="mt-0.5 text-xs text-white/70">
                The head office will approve your branch request before the branch goes live.
              </p>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-white/90">Branch Campus Name</Label>
              <Input
                required
                placeholder="e.g. Grace City Kumasi Campus"
                value={f.name}
                onChange={set("name")}
                maxLength={120}
                className="h-11 rounded-xl bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:border-primary focus:bg-white/15"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-white/90">Check-in Address (Subdomain)</Label>
              <Input
                required
                placeholder="e.g. grace-kumasi"
                value={f.subdomain}
                onChange={set("subdomain")}
                minLength={3}
                maxLength={40}
                className="h-11 rounded-xl bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:border-primary focus:bg-white/15 font-mono"
              />
              <span className="text-[11px] text-white/50">
                Permanent link: menelog.site/c/{f.subdomain || "branch"}
              </span>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-white/90">Town or City</Label>
              <Input
                required
                placeholder="e.g. Kumasi, Ashanti Region"
                value={f.city}
                onChange={set("city")}
                maxLength={80}
                className="h-11 rounded-xl bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:border-primary focus:bg-white/15"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-white/90">Branch Leader's Full Name</Label>
              <Input
                required
                placeholder="e.g. Pastor Emmanuel Osei"
                value={f.contact_name}
                onChange={set("contact_name")}
                maxLength={120}
                className="h-11 rounded-xl bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:border-primary focus:bg-white/15"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-white/90">Branch Admin Email</Label>
                <Input
                  required
                  type="email"
                  placeholder="admin@branch.org"
                  value={f.email}
                  onChange={set("email")}
                  className="h-11 rounded-xl bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:border-primary focus:bg-white/15"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-white/90">Contact Phone Number</Label>
                <Input
                  required
                  type="tel"
                  placeholder="024 000 0000"
                  value={f.phone}
                  onChange={set("phone")}
                  minLength={9}
                  maxLength={20}
                  className="h-11 rounded-xl bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:border-primary focus:bg-white/15"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-white/90">Branch Admin Password</Label>
                <PasswordInput
                  required
                  placeholder="Min 8 characters"
                  value={f.password}
                  onChange={(e) => setF({ ...f, password: e.target.value })}
                  className="h-11 rounded-xl bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:border-primary focus:bg-white/15"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-white/90">Confirm Password</Label>
                <PasswordInput
                  required
                  placeholder="Re-type password"
                  value={f.confirm}
                  onChange={(e) => setF({ ...f, confirm: e.target.value })}
                  className="h-11 rounded-xl bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:border-primary focus:bg-white/15"
                />
              </div>
            </div>

            {registerError && (
              <p className="text-xs font-semibold text-rose-300 bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20">
                {registerError}
              </p>
            )}

            <Button type="submit" disabled={busy} className="h-11 w-full rounded-xl font-semibold">
              {busy ? "Sending request…" : "Send Branch Request"}
            </Button>

            <div className="text-center">
              <Button
                type="button"
                variant="link"
                onClick={() => setBranchMode("login")}
                className="text-xs text-primary-foreground/90 hover:underline"
              >
                Already registered? Sign in to branch console
              </Button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

function LeaderArea({
  subdomain,
  churchName,
  leaderTypes,
}: {
  subdomain: string;
  churchName: string;
  leaderTypes: Array<{ id: string; name: string }>;
}) {
  const navigate = useNavigate();
  const register = useServerFn(registerLeader);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");

  // Leader Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState("");

  // Leader Register form state
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    date_of_birth: "",
    location: "",
    leader_type_id: "",
    access_code: "",
    password: "",
    confirm: "",
    photo: "",
  });
  const [registerBusy, setRegisterBusy] = useState(false);
  const [registerError, setRegisterError] = useState("");
  const [sent, setSent] = useState(false);
  const checks = passwordChecks(form.password);

  async function handleLeaderLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginBusy(true);
    setLoginError("");
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword,
      });
      if (error) throw error;
      toast.success("Welcome back! Loading your leader dashboard…");
      navigate({ to: "/my-members" });
    } catch (err) {
      setLoginError(
        err instanceof Error ? err.message : "Could not sign in with these credentials.",
      );
    } finally {
      setLoginBusy(false);
    }
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    if (file.size > 1_500_000) {
      setRegisterError("Please choose a photo smaller than 1.5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setForm((current) => ({ ...current, photo: String(reader.result ?? "") }));
    reader.readAsDataURL(file);
  }

  async function handleLeaderRegister(event: React.FormEvent) {
    event.preventDefault();
    setRegisterError("");
    if (!passwordIsStrong(form.password)) {
      setRegisterError(PASSWORD_RULE_TEXT);
      return;
    }
    if (form.password !== form.confirm) {
      setRegisterError("The two passwords do not match.");
      return;
    }
    setRegisterBusy(true);
    try {
      const result = await register({
        data: {
          subdomain,
          access_code: form.access_code,
          full_name: form.full_name,
          email: form.email,
          password: form.password,
          phone: form.phone,
          date_of_birth: form.date_of_birth,
          location: form.location,
          leader_type_id: form.leader_type_id,
          photo: form.photo,
        },
      });
      if (!result.ok) {
        setRegisterError(result.message);
        return;
      }
      setSent(true);
    } catch {
      setRegisterError("Could not complete leader registration. Please try again.");
    } finally {
      setRegisterBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="mt-6 min-h-[460px] flex flex-col justify-center rounded-3xl border border-white/15 bg-black/40 p-6 text-center shadow-xl backdrop-blur-xl text-white space-y-4">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-emerald-500/20 text-emerald-400">
          <CheckCircle2 className="size-6" />
        </div>
        <h2 className="font-display text-xl font-bold text-white">Leader Account Created</h2>
        <p className="text-sm leading-relaxed text-white/80">
          Your leader account for <b className="text-white">{form.full_name}</b> has been set up at {churchName}. You can sign in immediately below.
        </p>
        <Button
          onClick={() => {
            setSent(false);
            setAuthMode("login");
          }}
          className="w-full rounded-xl"
        >
          Proceed to Leader Log in
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-6 min-h-[460px] rounded-3xl border border-white/15 bg-black/40 p-5 sm:p-6 shadow-xl backdrop-blur-xl text-white">
      {/* Sub-tab switcher */}
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-white/10 p-1 text-xs font-semibold border border-white/10">
        <button
          type="button"
          onClick={() => setAuthMode("login")}
          className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 transition-all ${
            authMode === "login"
              ? "bg-white text-neutral-900 shadow-md font-bold"
              : "text-white/70 hover:text-white hover:bg-white/5"
          }`}
        >
          <LogIn className="size-3.5" /> Leader Login
        </button>
        <button
          type="button"
          onClick={() => setAuthMode("register")}
          className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 transition-all ${
            authMode === "register"
              ? "bg-white text-neutral-900 shadow-md font-bold"
              : "text-white/70 hover:text-white hover:bg-white/5"
          }`}
        >
          <UserPlus className="size-3.5" /> Register as Leader
        </button>
      </div>

      <AnimatePresence mode="wait">
        {authMode === "login" ? (
          <motion.form
            key="leader-login"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            onSubmit={handleLeaderLogin}
            className="mt-5 space-y-4"
          >
            <div>
              <h2 className="font-display text-lg font-bold text-white">Sign in as Leader</h2>
              <p className="mt-1 text-xs text-white/70">
                View your disciples, members, and pastoral follow-ups.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="leader-email" className="text-xs font-semibold text-white/90">
                Email address
              </Label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3.5 size-4 text-white/50" />
                <Input
                  id="leader-email"
                  type="email"
                  required
                  placeholder="leader@example.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="h-11 rounded-xl bg-white/10 border-white/20 text-white placeholder:text-white/40 pl-10 focus:border-primary focus:bg-white/15"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="leader-password" className="text-xs font-semibold text-white/90">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 size-4 text-white/50 z-10" />
                <PasswordInput
                  id="leader-password"
                  required
                  placeholder="••••••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="h-11 rounded-xl bg-white/10 border-white/20 text-white placeholder:text-white/40 pl-10 focus:border-primary focus:bg-white/15"
                />
              </div>
            </div>

            {loginError && (
              <p className="text-xs font-semibold text-rose-300 bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20">
                {loginError}
              </p>
            )}

            <Button type="submit" disabled={loginBusy} className="h-11 w-full rounded-xl">
              {loginBusy ? "Signing in…" : "Sign In to Leader Portal"}
            </Button>

            <div className="text-center">
              <Button
                type="button"
                variant="link"
                onClick={() => setAuthMode("register")}
                className="text-xs text-primary-foreground/90 hover:underline"
              >
                Need to register? Create leader account
              </Button>
            </div>
          </motion.form>
        ) : (
          <motion.form
            key="leader-register"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            onSubmit={handleLeaderRegister}
            className="mt-5 space-y-4"
          >
            <div>
              <h2 className="font-display text-lg font-bold text-white">Register as a leader</h2>
              <p className="mt-1 text-xs text-white/70">
                You will need the leader access code provided by your church administrator.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lname" className="text-xs font-semibold text-white/90">
                Full name
              </Label>
              <Input
                id="lname"
                required
                minLength={2}
                maxLength={120}
                placeholder="First and last name"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                className="h-11 rounded-xl bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:border-primary focus:bg-white/15"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lemail" className="text-xs font-semibold text-white/90">
                Email address
              </Label>
              <Input
                id="lemail"
                type="email"
                required
                maxLength={160}
                placeholder="leader@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="h-11 rounded-xl bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:border-primary focus:bg-white/15"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lphone" className="text-xs font-semibold text-white/90">
                Phone number
              </Label>
              <Input
                id="lphone"
                required
                inputMode="tel"
                placeholder="024 000 0000"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="h-11 rounded-xl bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:border-primary focus:bg-white/15"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lphoto" className="text-xs font-semibold text-white/90">
                Profile photo <span className="font-normal text-white/50">(optional)</span>
              </Label>
              <Input
                id="lphoto"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => onPhoto(e.target.files?.[0])}
                className="h-11 rounded-xl bg-white/10 border-white/20 text-white file:text-white file:bg-white/10 file:rounded-lg file:border-0"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ldob" className="text-xs font-semibold text-white/90">
                  Date of birth
                </Label>
                <Input
                  id="ldob"
                  type="date"
                  max={new Date().toISOString().slice(0, 10)}
                  value={form.date_of_birth}
                  onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
                  className="h-11 rounded-xl bg-white/10 border-white/20 text-white focus:border-primary focus:bg-white/15"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lloc" className="text-xs font-semibold text-white/90">
                  Location
                </Label>
                <Input
                  id="lloc"
                  maxLength={120}
                  placeholder="e.g. East Legon"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  className="h-11 rounded-xl bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:border-primary focus:bg-white/15"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ltype" className="text-xs font-semibold text-white/90">
                Type of leader
              </Label>
              <select
                id="ltype"
                className={selectClass}
                value={form.leader_type_id}
                onChange={(e) => setForm({ ...form, leader_type_id: e.target.value })}
              >
                <option value="" className="bg-neutral-900 text-white">Select your leadership role</option>
                {leaderTypes.map((type) => (
                  <option key={type.id} value={type.id} className="bg-neutral-900 text-white">
                    {type.name}
                  </option>
                ))}
                {!leaderTypes.length && <option value="general" className="bg-neutral-900 text-white">Cell / Department Leader</option>}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lcode" className="text-xs font-semibold text-white/90">
                Leader access code
              </Label>
              <Input
                id="lcode"
                required
                minLength={4}
                maxLength={24}
                placeholder="Ask church admin for code"
                value={form.access_code}
                onChange={(e) => setForm({ ...form, access_code: e.target.value })}
                className="h-11 rounded-xl bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:border-primary focus:bg-white/15 font-mono uppercase"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lpass" className="text-xs font-semibold text-white/90">
                Password
              </Label>
              <PasswordInput
                id="lpass"
                required
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="h-11 rounded-xl bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:border-primary focus:bg-white/15"
              />
              <ul className="grid gap-1 pt-1 text-xs text-white/70">
                {checks.map((check) => (
                  <li
                    key={check.label}
                    className={`flex items-center gap-1.5 ${check.met ? "text-emerald-400 font-semibold" : "text-white/50"}`}
                  >
                    <span>{check.met ? "✓" : "•"}</span> {check.label}
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lconfirm" className="text-xs font-semibold text-white/90">
                Confirm password
              </Label>
              <PasswordInput
                id="lconfirm"
                required
                autoComplete="new-password"
                value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                className="h-11 rounded-xl bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:border-primary focus:bg-white/15"
              />
            </div>

            {registerError && (
              <p className="text-xs font-semibold text-rose-300 bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20">
                {registerError}
              </p>
            )}

            <Button type="submit" className="h-11 w-full rounded-xl" disabled={registerBusy}>
              {registerBusy ? "Creating your account…" : "Create Leader Account"}
            </Button>

            <div className="flex items-start gap-2 pt-1 text-xs text-white/60">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                Leaders only see the members assigned to them or who chose them. Sensitive
                church-wide records remain confidential.
              </span>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
