import {
  Home,
  LayoutGrid,
  Heart,
  HelpCircle,
  Play,
  Landmark,
  CreditCard,
} from "lucide-react";
import { useEffect, useState } from "react";
import worshipPoster from "@/assets/mene-worship-poster.jpg";

type SectionItem = {
  id: string;
  label: string;
  icon: typeof Home;
};

const SECTIONS: SectionItem[] = [
  { id: "hero", label: "Home", icon: Home },
  { id: "why", label: "Overview", icon: Landmark },
  { id: "features", label: "Features", icon: LayoutGrid },
  { id: "care", label: "Care & Community", icon: Heart },
  { id: "pricing", label: "Pricing", icon: CreditCard },
  { id: "faq", label: "FAQ", icon: HelpCircle },
];

export function HeroSideNav({
  activeSection: propActiveSection,
  onWatchShowreel,
}: {
  activeSection?: string;
  onWatchShowreel?: () => void;
}) {
  const [internalActiveSection, setInternalActiveSection] = useState<string>("hero");
  const activeSection = propActiveSection ?? internalActiveSection;

  useEffect(() => {
    if (propActiveSection) return;
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 320;

      // Find which section is currently in view
      for (let i = SECTIONS.length - 1; i >= 0; i--) {
        const item = SECTIONS[i];
        if (!item) continue;
        const el = document.getElementById(item.id);
        if (el) {
          const top = el.offsetTop;
          if (scrollPosition >= top) {
            setInternalActiveSection(item.id);
            return;
          }
        }
      }
      setInternalActiveSection("hero");
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [propActiveSection]);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <aside
      aria-label="Section Navigation Dock"
      className="fixed left-4 lg:left-6 top-1/2 -translate-y-1/2 z-40 hidden xl:flex flex-col items-center gap-3 rounded-full border border-white/30 bg-slate-950/65 p-2 shadow-[0_16px_40px_rgba(0,0,0,0.35)] backdrop-blur-2xl transition-all duration-300"
    >
      {/* Navigation Icons Stack */}
      <div className="flex flex-col items-center gap-1.5">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          const isActive = activeSection === section.id;

          return (
            <button
              key={section.id}
              type="button"
              onClick={() => scrollTo(section.id)}
              aria-label={`Scroll to ${section.label}`}
              title={section.label}
              className={`group relative grid size-10 place-items-center rounded-full transition-all duration-200 ${
                isActive
                  ? "bg-white text-slate-950 shadow-lg scale-105 font-bold"
                  : "text-white/70 hover:text-white hover:bg-white/15"
              }`}
            >
              <Icon className="size-4 transition-transform group-hover:scale-110" />

              {/* Floating Tooltip */}
              <span className="pointer-events-none absolute left-14 whitespace-nowrap rounded-xl border border-white/20 bg-slate-950/95 px-3 py-1.5 text-xs font-semibold text-white shadow-2xl backdrop-blur-xl opacity-0 transition-opacity duration-200 group-hover:opacity-100 z-50">
                {section.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Divider */}
      <div className="w-5 h-px bg-white/20 my-0.5" />

      {/* Circular Photo Thumbnail (Sanctuary preview) */}
      <div
        className="relative size-8 overflow-hidden rounded-full border border-white/40 shadow-sm cursor-pointer hover:scale-110 transition-transform"
        onClick={onWatchShowreel}
        title="Interactive Tour"
      >
        <img
          src={worshipPoster}
          alt="Mene:Log sanctuary"
          referrerPolicy="no-referrer"
          className="size-full object-cover"
        />
        <span className="absolute inset-0 bg-blue-600/20 mix-blend-overlay" />
      </div>

      {/* Bottom Showreel Pill Button */}
      <button
        type="button"
        onClick={onWatchShowreel}
        aria-label="Watch Showreel"
        className="group flex flex-col items-center gap-1 rounded-full p-1 transition-transform hover:scale-105 active:scale-95"
      >
        <span className="grid size-8 place-items-center rounded-full border border-white/30 bg-white/20 text-white shadow-sm backdrop-blur-md transition-colors group-hover:bg-white group-hover:text-slate-950">
          <Play className="size-3 fill-current ml-0.5" />
        </span>
        <span className="text-[9px] font-bold uppercase tracking-wider text-white/70 leading-tight text-center group-hover:text-white transition-colors">
          Tour
        </span>
      </button>
    </aside>
  );
}
