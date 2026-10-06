import { Link } from "@tanstack/react-router";
import {
  Home,
  LayoutGrid,
  QrCode,
  CreditCard,
  LogIn,
  Heart,
} from "lucide-react";

type Props = {
  activeSection?: string;
  onQuickAction?: () => void;
};

export function MobileAppTabBar({ activeSection = "hero", onQuickAction }: Props) {
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <nav
      aria-label="Mobile Application Navigation"
      className="fixed inset-x-0 bottom-0 z-50 lg:hidden px-3 pt-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] bg-slate-950/92 backdrop-blur-2xl border-t border-white/10 shadow-[0_-10px_35px_rgba(0,0,0,0.5)] transition-all"
    >
      <div className="mx-auto flex max-w-md items-center justify-around">
        {/* 1. Home */}
        <button
          type="button"
          onClick={() => scrollTo("hero")}
          aria-label="Home"
          className={`flex flex-col items-center gap-1 py-1 px-2.5 transition-transform active:scale-90 ${
            activeSection === "hero" ? "text-white font-bold" : "text-white/60 hover:text-white"
          }`}
        >
          <div className="relative">
            <Home className="size-5" />
            {activeSection === "hero" && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 size-1 rounded-full bg-blue-500" />
            )}
          </div>
          <span className="text-[10px] tracking-tight">Home</span>
        </button>

        {/* 2. Features */}
        <button
          type="button"
          onClick={() => scrollTo("features")}
          aria-label="Features"
          className={`flex flex-col items-center gap-1 py-1 px-2.5 transition-transform active:scale-90 ${
            activeSection === "features" ? "text-white font-bold" : "text-white/60 hover:text-white"
          }`}
        >
          <div className="relative">
            <LayoutGrid className="size-5" />
            {activeSection === "features" && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 size-1 rounded-full bg-blue-500" />
            )}
          </div>
          <span className="text-[10px] tracking-tight">Features</span>
        </button>

        {/* 3. Center Elevated App Check-In Action Button */}
        <div className="relative -top-3">
          <Link
            to="/onboarding"
            className="group flex flex-col items-center transition-transform active:scale-90"
            aria-label="Quick Check-In / Start Setup"
          >
            <div className="grid size-12 place-items-center rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white shadow-lg shadow-blue-500/40 border border-white/25 ring-4 ring-slate-950">
              <QrCode className="size-6 transition-transform group-hover:scale-110" />
            </div>
            <span className="mt-1 text-[9px] font-extrabold uppercase tracking-wider text-blue-400">
              Check In
            </span>
          </Link>
        </div>

        {/* 4. Pricing / Plans */}
        <button
          type="button"
          onClick={() => scrollTo("pricing")}
          aria-label="Pricing"
          className={`flex flex-col items-center gap-1 py-1 px-2.5 transition-transform active:scale-90 ${
            activeSection === "pricing" ? "text-white font-bold" : "text-white/60 hover:text-white"
          }`}
        >
          <div className="relative">
            <CreditCard className="size-5" />
            {activeSection === "pricing" && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 size-1 rounded-full bg-blue-500" />
            )}
          </div>
          <span className="text-[10px] tracking-tight">Plans</span>
        </button>

        {/* 5. Sign In */}
        <Link
          to="/auth"
          search={{ mode: "signin" }}
          aria-label="Sign In"
          className="flex flex-col items-center gap-1 py-1 px-2.5 text-white/60 hover:text-white transition-transform active:scale-90"
        >
          <LogIn className="size-5" />
          <span className="text-[10px] tracking-tight">Sign In</span>
        </Link>
      </div>
    </nav>
  );
}
