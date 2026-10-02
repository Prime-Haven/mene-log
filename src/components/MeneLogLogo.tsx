import logo07 from "@/assets/mene-log-logo-07.png";
import logo08 from "@/assets/mene-log-logo-08.png";
// The remote full-logo assets belonged to a previous project and no longer
// resolve (404). Use the bundled local marks so the logo always renders.
const darkLogo = { url: logo07 };
const lightLogo = { url: logo08 };

type Props = {
  variant?: "dark" | "light"; // "dark" = dark logo on white/light bg; "light" = light logo on dark/black bg
  onBackground?: "white" | "black";
  compact?: boolean;
  className?: string;
  forceFull?: boolean;
};

/** Official Mene:Log identity.
 * On mobile view: renders the clean favicon-style icon only,
 * preventing distortion and maintaining perfect orientation and UI balance.
 * - mene-log-logo-07.png is used on white / light backgrounds.
 * - mene-log-logo-08.png is used on black / dark backgrounds.
 * On desktop view: renders the full branding or compact icon as requested.
 */
export function MeneLogLogo({
  variant = "dark",
  onBackground,
  compact = false,
  className = "",
  forceFull = false,
}: Props) {
  // Determine if background is white or black
  const isWhiteBg = onBackground ? onBackground === "white" : variant === "dark";
  const iconSrc = isWhiteBg ? logo07 : logo08;
  const fullLogoUrl = (variant === "light" ? lightLogo : darkLogo).url;

  if (compact) {
    return (
      <img
        src={iconSrc}
        alt="Mene:Log"
        className={`aspect-square object-contain select-none rounded-lg ${className}`}
      />
    );
  }

  if (forceFull) {
    return (
      <img
        src={fullLogoUrl}
        alt="Mene:Log"
        onError={(e) => {
          e.currentTarget.src = iconSrc;
        }}
        className={`w-auto object-contain select-none ${className}`}
      />
    );
  }

  return (
    <span className="inline-flex items-center">
      {/* Tablet & mobile view: standalone icon logo, square aspect ratio, never distorted */}
      <img
        src={iconSrc}
        alt="Mene:Log"
        className="aspect-square size-9 sm:size-10 lg:size-9 object-contain select-none rounded-lg lg:hidden"
      />
      {/* Web / desktop view: full logo */}
      <img
        src={fullLogoUrl}
        alt="Mene:Log"
        onError={(e) => {
          e.currentTarget.src = iconSrc;
        }}
        className={`hidden lg:block w-auto object-contain select-none ${className}`}
      />
    </span>
  );
}
