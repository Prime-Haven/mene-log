import { Link } from "@tanstack/react-router";
import { ArrowRight, Menu, X, QrCode } from "lucide-react";
import { useEffect, useState } from "react";
import { MeneLogLogo } from "@/components/MeneLogLogo";

type NavItem = {
  label: string;
  href: string;
  id: string;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "#hero", id: "hero" },
  { label: "Features", href: "#features", id: "features" },
  { label: "Care & Community", href: "#care", id: "care" },
  { label: "Pricing", href: "#pricing", id: "pricing" },
  { label: "FAQ", href: "#faq", id: "faq" },
];

export function HeroNavbar({
  activeSection,
}: {
  activeSection?: string;
  onOpenSearch?: () => void;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleScrollTo = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <header className="fixed top-0 inset-x-0 z-50 pointer-events-none pt-2.5 sm:pt-4 px-3 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <nav
          aria-label="Main Navigation"
          className={`pointer-events-auto mx-auto flex items-center justify-between rounded-full border transition-all duration-300 px-3.5 sm:px-6 py-2 sm:py-2.5 shadow-2xl backdrop-blur-2xl ${
            scrolled
              ? "border-white/25 bg-black/85 text-white shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
              : "border-white/30 bg-black/45 text-white shadow-xl backdrop-blur-xl"
          }`}
        >
          {/* ===================================================================== */}
          {/* Brand: full Mene:Log logo on web (lg+), compact icon on mobile/tablet */}
          {/* ===================================================================== */}
          <Link
            to="/"
            className="flex items-center transition-transform hover:scale-105 shrink-0"
            aria-label="Mene:Log Home"
          >
            <MeneLogLogo
              variant="light"
              onBackground="black"
              className="h-9 sm:h-10 lg:h-8 xl:h-9 w-auto"
            />
          </Link>

          {/* Center: Frosted Glass Nav Links (Desktop Web View) */}
          <div className="hidden lg:flex items-center gap-1 rounded-full border border-white/15 bg-white/10 p-1 backdrop-blur-xl">
            {NAV_ITEMS.map((item) => {
              const isCurrent = activeSection === item.id;
              return (
                <a
                  key={item.id}
                  href={item.href}
                  onClick={(e) => handleScrollTo(e, item.href)}
                  className={`relative flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200 ${
                    isCurrent
                      ? "bg-white text-slate-950 shadow-md font-bold"
                      : "text-white/80 hover:text-white hover:bg-white/15"
                  }`}
                >
                  <span>{item.label}</span>
                  {isCurrent && (
                    <span className="size-1 rounded-full bg-blue-600 animate-pulse" />
                  )}
                </a>
              );
            })}
          </div>

          {/* Right Actions: Mobile App Optimized */}
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/auth"
              search={{ mode: "signin" }}
              className="hidden sm:inline-flex rounded-full px-3.5 py-1.5 text-xs font-semibold text-white/90 hover:text-white transition-colors"
            >
              Sign In
            </Link>

            {/* Mobile App Quick Action / Web CTA */}
            <Link
              to="/onboarding"
              className="group inline-flex items-center gap-1.5 sm:gap-2 rounded-full border border-white/30 bg-blue-600 pl-3.5 sm:pl-4 pr-1.5 sm:pr-2 py-1.5 text-xs font-bold text-white shadow-lg shadow-blue-600/35 backdrop-blur-md transition-all hover:bg-blue-500 hover:shadow-xl hover:shadow-blue-500/40 active:scale-95"
            >
              <span className="sm:inline hidden">Get Started</span>
              <span className="sm:hidden inline">Setup</span>
              <span className="grid size-5 place-items-center rounded-full bg-white/20 text-white transition-transform duration-200 group-hover:translate-x-0.5">
                <ArrowRight className="size-3" />
              </span>
            </Link>

            {/* Mobile menu toggle button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((open) => !open)}
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              className="grid size-8 sm:size-9 place-items-center rounded-full border border-white/25 bg-white/15 text-white shadow-sm lg:hidden backdrop-blur-md hover:bg-white/25 transition-colors"
            >
              {mobileMenuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
            </button>
          </div>
        </nav>

        {/* Mobile dropdown sheet with Glassmorphism */}
        {mobileMenuOpen && (
          <div className="pointer-events-auto mt-2 flex flex-col gap-1.5 rounded-3xl border border-white/25 bg-slate-950/95 p-4 shadow-2xl backdrop-blur-2xl lg:hidden text-white animate-in fade-in slide-in-from-top-2 duration-200">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.id}
                href={item.href}
                onClick={(e) => handleScrollTo(e, item.href)}
                className="rounded-2xl px-4 py-2.5 text-sm font-semibold text-white/85 hover:bg-white/15 hover:text-white transition-colors"
              >
                {item.label}
              </a>
            ))}
            <div className="my-1 border-t border-white/15" />
            <Link
              to="/auth"
              search={{ mode: "signin" }}
              className="rounded-2xl px-4 py-2.5 text-sm font-semibold text-white/85 hover:bg-white/15 transition-colors"
            >
              Sign In to Your Church
            </Link>
            <Link
              to="/onboarding"
              className="flex items-center justify-between rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-md hover:bg-blue-500 transition-colors"
            >
              <span>Get Started Free</span>
              <ArrowRight className="size-4" />
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
