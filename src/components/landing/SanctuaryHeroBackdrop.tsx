import { memo } from "react";
import churchSkywardBw from "@/assets/images/church_skyward_bw.jpg";

/**
 * HDR Black and White Architectural Church Skyward Backdrop
 * - Towering modern church auditorium facade captured from a low angle pointing straight up to the sky
 * - Congregation people and families walking into the grand auditorium entrance
 * - High Dynamic Range chiaroscuro contrast: deep rich blacks, silvery architectural textures, luminous sky
 * - Gradient scrims calibrated for flawless contrast and readability of foreground text & glass cards
 */
export const SanctuaryHeroBackdrop = memo(function SanctuaryHeroBackdrop({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none select-none overflow-hidden absolute inset-0 ${className}`}
    >
      {/* 1. Primary HDR Black & White Skyward Church Photograph */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-transform duration-1000 scale-100"
        style={{
          backgroundImage: `url(${churchSkywardBw})`,
          filter: "grayscale(1) contrast(1.22) brightness(0.92)",
        }}
      />

      {/* 2. Architectural Skyward Luminous Beam & Zenith Glow (Skyward Accent) */}
      <div className="absolute -top-32 inset-x-0 h-[40rem] bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.22)_0%,rgba(255,255,255,0.06)_40%,transparent_75%)] blur-2xl pointer-events-none mix-blend-screen" />

      {/* 3. Deep Chiaroscuro Contrast & Grain Tone */}
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />

      {/* 4. Left & Center Scrim for High Readability of Display Typography */}
      <div className="absolute inset-y-0 left-0 w-full lg:w-[68%] bg-gradient-to-r from-black/85 via-black/60 to-transparent dark:from-black/92 dark:via-black/75 pointer-events-none" />

      {/* 5. Top Scrim for Floating Glass Navbar (Zero space at top) */}
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/80 via-black/40 to-transparent pointer-events-none" />

      {/* 6. Bottom Scrim for Floating Glass Cards and Smooth Section Transition */}
      <div className="absolute inset-x-0 bottom-0 h-80 bg-gradient-to-t from-black via-black/75 to-transparent pointer-events-none" />
    </div>
  );
});
