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
      aria-label="Mene:Log Sanctuary Hero"
      className="relative min-h-[92vh] sm:min-h-screen w-full flex flex-col justify-between overflow-hidden bg-black text-white pt-28 sm:pt-36 pb-10 sm:pb-14"
    >
      {/* 1. Sanctuary photo backdrop */}
      <SanctuaryHeroBackdrop />

      {/* 2. Cinematic overlay + atmospheric blue glow */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/40 to-black" />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/30 to-transparent" />
        <div className="absolute -top-[10%] -right-[10%] size-[520px] rounded-full bg-sky-500/10 blur-[130px]" />
        <div className="absolute -bottom-[10%] -left-[5%] size-[420px] rounded-full bg-sky-300/5 blur-[110px]" />
      </div>

      {/* 3. Main hero content */}
      <div className="relative z-20 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-12">
        <div className="max-w-4xl">
          {/* Hero Main Headline */}
          <h1 className="font-display text-5xl sm:text-7xl lg:text-8xl font-extrabold tracking-tighter leading-[0.95] text-white">
            Architecting Stronger Churches,{" "}
            <span className="text-sky-300">One Soul</span> at a Time.
          </h1>

          {/* Hero Subtitle */}
          <p className="mt-8 text-lg sm:text-xl leading-relaxed text-zinc-400 max-w-2xl">
            From lightning-fast 4-second QR door check-ins to deep pastoral care,
            Mene:Log provides the digital sanctuary your congregation needs to
            flourish, connect, and grow together.
          </p>

          {/* Call-to-Action Buttons */}
          <div className="mt-10 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            <Link
              to="/onboarding"
              className="group inline-flex w-full sm:w-auto justify-center items-center gap-3 rounded-full bg-white px-8 py-4 text-sm font-bold text-black shadow-[0_0_30px_-8px_rgba(255,255,255,0.35)] transition-all duration-300 hover:bg-sky-300 active:scale-95"
            >
              <span>Start Free Church Setup</span>
              <ArrowRight className="size-5 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>

            <button
              type="button"
              onClick={onWatchShowreel}
              className="group inline-flex w-full sm:w-auto justify-center items-center gap-3 rounded-full border border-white/10 bg-white/5 px-8 py-4 text-sm font-semibold text-white backdrop-blur-md transition-all duration-300 hover:bg-white/10 active:scale-95"
            >
              <span className="grid size-8 place-items-center rounded-full bg-white/10 transition-colors duration-300 group-hover:bg-white/20">
                <Play className="size-4 fill-current ml-0.5" />
              </span>
              <span>Watch Interactive Tour</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. Bottom glass cards deck */}
      <div className="relative z-20 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-12 mt-14 sm:mt-16">
        <div className="grid gap-6 lg:grid-cols-12 items-stretch">
          {/* Card A: "Growing together" live telemetry (7 columns) */}
          <div className="lg:col-span-7 group rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-8 backdrop-blur-2xl flex flex-col justify-between transition-colors duration-300 hover:border-sky-500/30">
            <div>
              <div className="flex items-start justify-between mb-6 sm:mb-8">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-sky-400 animate-pulse" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300">
                      Growing Together
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                    Live Platform Telemetry
                  </p>
                </div>
              </div>

              {/* 4-column metrics grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-8 border-y border-white/5 py-5 sm:py-6 text-left">
                <div>
                  <div className="flex items-center gap-2 text-zinc-500">
                    <Church className="size-4" />
                    <span className="text-[11px] font-semibold">Churches</span>
                  </div>
                  <div className="mt-2 font-display text-3xl font-bold tracking-tight text-white tabular-nums">
                    {churchesCount}
                  </div>
                  <p className="mt-1 text-[10px] font-medium text-zinc-600">
                    Active ministries
                  </p>
                </div>

                <div>
                  <div className="flex items-center gap-2 text-zinc-500">
                    <Users className="size-4" />
                    <span className="text-[11px] font-semibold">Members</span>
                  </div>
                  <div className="mt-2 font-display text-3xl font-bold tracking-tight text-white tabular-nums">
                    {membersCount}
                  </div>
                  <p className="mt-1 text-[10px] font-medium text-zinc-600">
                    Cared for weekly
                  </p>
                </div>

                <div>
                  <div className="flex items-center gap-2 text-zinc-500">
                    <ScanLine className="size-4" />
                    <span className="text-[11px] font-semibold">Check-ins</span>
                  </div>
                  <div className="mt-2 font-display text-3xl font-bold tracking-tight text-white tabular-nums">
                    {checkinsCount}
                  </div>
                  <p className="mt-1 text-[10px] font-medium text-zinc-600">
                    Sub-4s door scans
                  </p>
                </div>

                <div>
                  <div className="flex items-center gap-2 text-zinc-500">
                    <BarChart3 className="size-4" />
                    <span className="text-[11px] font-semibold">Attendance</span>
                  </div>
                  <div className="mt-2 font-display text-3xl font-bold tracking-tight text-sky-300 tabular-nums">
                    {attendanceCount}
                  </div>
                  <p className="mt-1 text-[10px] font-medium text-zinc-600">
                    Sunday average
                  </p>
                </div>
              </div>
            </div>

            {/* Bottom micro-banner */}
            <div className="mt-6 flex items-center justify-between">
              <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                <Clock className="size-4 text-sky-400" />
                Zero Sunday morning bottlenecks
              </span>
              <Link
                to="/onboarding"
                className="inline-flex items-center gap-2 text-xs font-bold text-white transition-colors hover:text-sky-300"
              >
                <span>Join churches</span>
                <ArrowUpRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            </div>
          </div>

          {/* Card B: Feature spotlight carousel (5 columns) */}
          <div className="lg:col-span-5 group relative overflow-hidden rounded-3xl border border-white/15 bg-white/[0.05] p-6 sm:p-8 backdrop-blur-2xl flex flex-col justify-between transition-colors duration-300 hover:border-sky-500/30">
            {/* Decorative corner glow */}
            <div className="absolute -bottom-6 -right-6 size-24 rounded-full bg-sky-500/5 blur-2xl transition-all duration-700 group-hover:bg-sky-500/20" />

            <div>
              <div className="flex items-center justify-between mb-6">
                <span className="inline-flex items-center gap-2 rounded-lg border border-sky-500/20 bg-sky-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-sky-400">
                  <HighlightIcon className="size-4" />
                  {currentHighlight.tag}
                </span>

                {/* Prev / Next Controls */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={prevSlide}
                    aria-label="Previous feature"
                    className="grid size-8 place-items-center rounded-full border border-white/10 bg-white/5 text-white transition-colors hover:bg-white/10 active:scale-90"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={nextSlide}
                    aria-label="Next feature"
                    className="grid size-8 place-items-center rounded-full border border-white/10 bg-white/5 text-white transition-colors hover:bg-white/10 active:scale-90"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              </div>

              <div className="min-h-[6rem]">
                <h3 className="font-display text-2xl font-bold leading-snug tracking-tight text-white">
                  {currentHighlight.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                  {currentHighlight.description}
                </p>
              </div>
            </div>

            {/* Avatar stack & dots */}
            <div className="mt-8 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2 overflow-hidden">
                  <img
                    className="inline-block size-7 rounded-full border-2 border-black object-cover"
                    src={pastorPortrait}
                    alt="Pastor portrait"
                  />
                  <img
                    className="inline-block size-7 rounded-full border-2 border-black object-cover"
                    src={worshipPoster}
                    alt="Sanctuary volunteer"
                  />
                  <div className="inline-grid size-7 place-items-center rounded-full border-2 border-black bg-sky-500 text-[10px] font-bold text-white">
                    +4k
                  </div>
                </div>
                <span className="text-[11px] font-bold uppercase tracking-tight text-zinc-500">
                  Pastoral leaders
                </span>
              </div>

              {/* Dots */}
              <div className="flex items-center gap-1.5">
                {SPOTLIGHT_SLIDES.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActiveSlide(i)}
                    aria-label={`Go to slide ${i + 1}`}
                    className={`h-1.5 rounded-full transition-all duration-200 ${
                      activeSlide === i ? "w-6 bg-white" : "w-1.5 bg-white/20"
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
