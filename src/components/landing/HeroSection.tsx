import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Church,
  Clock,
  Play,
  QrCode,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { useState, useEffect } from "react";
import { SanctuaryHeroBackdrop } from "./SanctuaryHeroBackdrop";
import { supabase } from "@/integrations/supabase/client";
import worshipPoster from "@/assets/mene-worship-poster.jpg";
import pastorPortrait from "@/assets/images/pastor_leader_portrait.jpg";

type PublicStats = {
  churches: number;
  members: number;
  checkins: number;
  average_sunday_attendance: number;
};

const compactNumber = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const SPOTLIGHT_SLIDES = [
  {
    tag: "Door Check-in",
    title: "Sub-4-Second QR Arrival",
    description:
      "Instant camera scans at sanctuary doors. First-timers check themselves in and leave with a member code.",
    icon: QrCode,
    metric: "< 4s average scan",
  },
  {
    tag: "Pastoral Care",
    title: "Proactive Absentee Care",
    description:
      "Automatic absentee flagging notifies cell leaders and pastors so no soul falls through the cracks.",
    icon: Users,
    metric: "100% follow-up clarity",
  },
  {
    tag: "Campus Sync",
    title: "Multi-Branch & Unit Mesh",
    description:
      "Synchronize main services, branch campuses, and midweek fellowships under one unified database.",
    icon: Church,
    metric: "Real-time sync",
  },
  {
    tag: "Security & Role Access",
    title: "Protected Church Privacy",
    description:
      "Tenant-isolated databases and role-based permissions ensure confidential member records stay safe.",
    icon: ShieldCheck,
    metric: "Isolated records",
  },
];

export function HeroSection({
  onWatchShowreel,
}: {
  onWatchShowreel?: () => void;
}) {
  const [activeSlide, setActiveSlide] = useState(0);

  // Auto-advance feature spotlight every 6 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % SPOTLIGHT_SLIDES.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  // Fetch live stats with graceful defaults
  const statsQuery = useQuery({
    queryKey: ["hero-platform-stats-live"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("public_platform_stats");
      if (error) throw error;
      return data as unknown as PublicStats;
    },
    staleTime: 60 * 1000,
    retry: false,
  });

  const churchesCount =
    typeof statsQuery.data?.churches === "number"
      ? compactNumber.format(statsQuery.data.churches)
      : statsQuery.isLoading
      ? "—"
      : "0";

  const membersCount =
    typeof statsQuery.data?.members === "number"
      ? compactNumber.format(statsQuery.data.members)
      : statsQuery.isLoading
      ? "—"
      : "0";

  const checkinsCount =
    typeof statsQuery.data?.checkins === "number"
      ? compactNumber.format(statsQuery.data.checkins)
      : statsQuery.isLoading
      ? "—"
      : "0";

  const attendanceCount =
    typeof statsQuery.data?.average_sunday_attendance === "number"
      ? compactNumber.format(statsQuery.data.average_sunday_attendance)
      : statsQuery.isLoading
      ? "—"
      : "0";

  const nextSlide = () => {
    setActiveSlide((prev) => (prev + 1) % SPOTLIGHT_SLIDES.length);
  };

  const prevSlide = () => {
    setActiveSlide(
      (prev) => (prev - 1 + SPOTLIGHT_SLIDES.length) % SPOTLIGHT_SLIDES.length
    );
  };

  const currentHighlight = SPOTLIGHT_SLIDES[activeSlide] ?? SPOTLIGHT_SLIDES[0]!;
  const HighlightIcon = currentHighlight.icon;

  return (
    <section
      id="hero"
      aria-label="Mene:Log Architectural Sanctuary Hero"
      className="relative min-h-[92vh] sm:min-h-screen w-full flex flex-col justify-between pt-24 sm:pt-28 pb-10 sm:pb-16 text-white overflow-hidden"
    >
      {/* 1. Photorealistic Glass Sanctuary Architecture Background */}
      <SanctuaryHeroBackdrop />

      {/* 2. Top-Right Architectural Feature Tags */}
      <div className="absolute top-28 sm:top-32 right-4 sm:right-8 lg:right-12 hidden md:flex flex-col items-end gap-2 z-20 pointer-events-none">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/35 px-4 py-1.5 text-[11px] font-semibold tracking-wider uppercase text-white/90 backdrop-blur-xl shadow-lg">
          <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
          Sanctuary Experience v3.4
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/25 px-3.5 py-1 text-[11px] font-medium text-white/75 backdrop-blur-md">
          Sub-4s QR Door Check-in
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/25 px-3.5 py-1 text-[11px] font-medium text-white/75 backdrop-blur-md">
          99.8% Sunday Morning Reliability
        </span>
      </div>

      {/* 3. Main Hero Typography & Call-To-Action (Left Column) */}
      <div className="relative z-20 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 pt-6 sm:pt-10">
        <div className="max-w-3xl">
          {/* Eyebrow Glass Capsule */}
          <div className="inline-flex items-center gap-2 rounded-full border border-white/35 bg-white/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-white backdrop-blur-xl shadow-lg mb-6">
            <Sparkles className="size-3.5 text-amber-300 animate-spin-slow" />
            <span>Modern Church Attendance & Membership System</span>
          </div>

          {/* Hero Main Headline */}
          <h1 className="font-display text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-[1.08] drop-shadow-lg">
            Architecting Stronger Churches,{" "}
            <span className="bg-gradient-to-r from-blue-300 via-white to-blue-200 bg-clip-text text-transparent">
              One Soul at a Time.
            </span>
          </h1>

          {/* Hero Subtitle */}
          <p className="mt-6 text-base sm:text-lg lg:text-xl leading-relaxed text-slate-100/90 font-sans max-w-2xl drop-shadow-md">
            From lightning-fast 4-second QR door check-ins to deep pastoral care,
            Mene:Log provides the digital sanctuary your congregation needs to flourish,
            connect, and grow together.
          </p>

          {/* Call-to-Action Buttons (Optimized for mobile thumbs and desktop) */}
          <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
            {/* Primary Action: Sleek Dark / Contrast Glass Pill */}
            <Link
              to="/onboarding"
              className="group inline-flex w-full sm:w-auto justify-center items-center gap-3 rounded-full bg-white px-7 py-3.5 text-sm font-bold text-slate-950 shadow-2xl transition-all duration-200 hover:bg-slate-100 hover:shadow-white/20 active:scale-95"
            >
              <span>Start Free Church Setup</span>
              <span className="grid size-6 place-items-center rounded-full bg-slate-900 text-white transition-transform duration-200 group-hover:translate-x-1">
                <ArrowRight className="size-3.5" />
              </span>
            </Link>

            {/* Secondary Action: Frosted Glass Circular Play Button */}
            <button
              type="button"
              onClick={onWatchShowreel}
              className="group inline-flex w-full sm:w-auto justify-center items-center gap-3 rounded-full border border-white/40 bg-white/15 px-5 py-3.5 text-sm font-semibold text-white shadow-xl backdrop-blur-xl transition-all duration-200 hover:bg-white/25 hover:border-white/60 active:scale-95"
            >
              <span className="grid size-7 place-items-center rounded-full bg-white/20 text-white transition-transform duration-200 group-hover:scale-110">
                <Play className="size-3.5 fill-current ml-0.5" />
              </span>
              <span>Watch Interactive Tour</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. Bottom Floating Glassmorphism Cards Deck */}
      <div className="relative z-20 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 mt-12 sm:mt-16">
        <div className="grid gap-4 sm:gap-5 lg:grid-cols-12 items-stretch">
          {/* ------------------------------------------------------------- */}
          {/* Card A: Expanded "Growing together" Metrics Panel (7 Columns)  */}
          {/* ------------------------------------------------------------- */}
          <div className="lg:col-span-7 rounded-3xl border border-white/35 bg-white/20 p-5 sm:p-6 shadow-2xl backdrop-blur-2xl flex flex-col justify-between transition-all duration-300 hover:border-white/50 hover:bg-white/25">
            <div>
              <div className="flex items-center justify-between border-b border-white/20 pb-3">
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-white/90">
                    Growing together
                  </span>
                </div>
                <span className="text-[11px] font-medium text-white/70">
                  Live Platform Telemetry
                </span>
              </div>

              {/* 4-Column Balanced Metrics Grid */}
              <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-3 divide-y sm:divide-y-0 sm:divide-x divide-white/15 text-left">
                <div className="pt-2 sm:pt-0 sm:pr-3">
                  <div className="flex items-center gap-1.5 text-white/75 text-xs">
                    <Church className="size-3.5 text-blue-300" />
                    <span>Churches</span>
                  </div>
                  <div className="mt-2 font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-white tabular-nums">
                    {churchesCount}
                  </div>
                  <p className="mt-1 text-[11px] text-white/70 leading-tight">
                    Active ministries
                  </p>
                </div>

                <div className="pt-2 sm:pt-0 sm:px-3">
                  <div className="flex items-center gap-1.5 text-white/75 text-xs">
                    <Users className="size-3.5 text-amber-300" />
                    <span>Members</span>
                  </div>
                  <div className="mt-2 font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-white tabular-nums">
                    {membersCount}
                  </div>
                  <p className="mt-1 text-[11px] text-white/70 leading-tight">
                    Cared for weekly
                  </p>
                </div>

                <div className="pt-2 sm:pt-0 sm:px-3">
                  <div className="flex items-center gap-1.5 text-white/75 text-xs">
                    <ScanLine className="size-3.5 text-emerald-300" />
                    <span>Check-ins</span>
                  </div>
                  <div className="mt-2 font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-white tabular-nums">
                    {checkinsCount}
                  </div>
                  <p className="mt-1 text-[11px] text-white/70 leading-tight">
                    Sub-4s door scans
                  </p>
                </div>

                <div className="pt-2 sm:pt-0 sm:pl-3">
                  <div className="flex items-center gap-1.5 text-white/75 text-xs">
                    <BarChart3 className="size-3.5 text-purple-300" />
                    <span>Attendance</span>
                  </div>
                  <div className="mt-2 font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-white tabular-nums">
                    {attendanceCount}
                  </div>
                  <p className="mt-1 text-[11px] text-white/70 leading-tight">
                    Sunday average
                  </p>
                </div>
              </div>
            </div>

            {/* Bottom Guarantee Micro-banner */}
            <div className="mt-4 pt-3 border-t border-white/15 flex items-center justify-between text-xs text-white/80">
              <span className="flex items-center gap-1.5">
                <Clock className="size-3.5 text-amber-300" />
                Zero Sunday morning bottlenecks
              </span>
              <Link
                to="/onboarding"
                className="font-semibold text-white hover:underline inline-flex items-center gap-1"
              >
                <span>Join churches</span>
                <ArrowRight className="size-3" />
              </Link>
            </div>
          </div>

          {/* ------------------------------------------------------------- */}
          {/* Card B: Interactive Feature Showcase Carousel (5 Columns)     */}
          {/* ------------------------------------------------------------- */}
          <div className="lg:col-span-5 rounded-3xl border border-white/35 bg-white/20 p-5 sm:p-6 shadow-2xl backdrop-blur-2xl flex flex-col justify-between transition-all duration-300 hover:border-white/50 hover:bg-white/25">
            <div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/20 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                  <HighlightIcon className="size-3" />
                  {currentHighlight.tag}
                </span>

                {/* Prev / Next Controls */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={prevSlide}
                    aria-label="Previous feature"
                    className="grid size-7 place-items-center rounded-full border border-white/30 bg-white/15 text-white transition-colors hover:bg-white/30 active:scale-90"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={nextSlide}
                    aria-label="Next feature"
                    className="grid size-7 place-items-center rounded-full border border-white/30 bg-white/15 text-white transition-colors hover:bg-white/30 active:scale-90"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              </div>

              <div className="mt-3.5 min-h-[5.5rem]">
                <h3 className="font-display text-lg font-bold text-white leading-snug">
                  {currentHighlight.title}
                </h3>
                <p className="mt-1.5 text-xs sm:text-sm text-white/80 leading-relaxed line-clamp-2">
                  {currentHighlight.description}
                </p>
              </div>
            </div>

            {/* Avatar Stack & Dots Navigation */}
            <div className="mt-4 pt-3 border-t border-white/15 flex items-center justify-between">
              {/* Pastoral Avatar Group */}
              <div className="flex items-center gap-2">
                <div className="flex -space-x-2 overflow-hidden">
                  <img
                    className="inline-block size-6 rounded-full ring-2 ring-white/50 object-cover"
                    src={pastorPortrait}
                    alt="Pastor portrait"
                  />
                  <img
                    className="inline-block size-6 rounded-full ring-2 ring-white/50 object-cover"
                    src={worshipPoster}
                    alt="Sanctuary volunteer"
                  />
                  <div className="inline-grid size-6 place-items-center rounded-full bg-blue-600 text-[9px] font-bold ring-2 ring-white/50 text-white">
                    +4k
                  </div>
                </div>
                <span className="text-[11px] font-medium text-white/80">
                  Pastoral leaders
                </span>
              </div>

              {/* Dots */}
              <div className="flex items-center gap-1">
                {SPOTLIGHT_SLIDES.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActiveSlide(i)}
                    aria-label={`Go to slide ${i + 1}`}
                    className={`h-1.5 rounded-full transition-all duration-200 ${
                      activeSlide === i ? "w-5 bg-white" : "w-1.5 bg-white/40"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
