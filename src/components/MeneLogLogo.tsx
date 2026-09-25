import darkLogo from "@/assets/mene-log-logo-dark.png.asset.json";
import lightLogo from "@/assets/mene-log-logo-light.png.asset.json";
import symbol from "@/assets/mene-log-symbol-dark.png.asset.json";

type Props = {
  variant?: "dark" | "light";
  compact?: boolean;
  className?: string;
};

/** Official Mene:Log identity for platform-owned surfaces. */
export function MeneLogLogo({ variant = "dark", compact = false, className = "" }: Props) {
  return (
    <img
      src={(compact ? symbol : variant === "light" ? lightLogo : darkLogo).url}
      alt="Mene:Log"
      className={`${compact ? "aspect-square object-contain" : "w-auto object-contain"} ${className}`}
    />
  );
}