import { useEffect, useState } from "react";

/**
 * Daniel 5:25 — the verse Mene is named after — typed out translation by
 * translation. Visitors who ask for reduced motion see the KJV text at rest.
 */
export const DANIEL_VERSES = [
  { translation: "KJV", text: "And this is the writing that was written, MENE, MENE, TEKEL, UPHARSIN." },
  { translation: "NIV", text: "This is the inscription that was written: mene, mene, tekel, parsin." },
  { translation: "NLT", text: "This is the message that was written: Mene, Mene, Tekel, and Parsin." },
  { translation: "TPT", text: "This is the writing on the wall: Mene, Mene, Tekel, Parsin." },
] as const;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export function VerseTyper() {
  const reduced = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [length, setLength] = useState(0);
  const [wiping, setWiping] = useState(false);

  const current = DANIEL_VERSES[index]!;

  useEffect(() => {
    if (reduced) return;
    if (!wiping && length < current.text.length) {
      const timer = setTimeout(() => setLength((value) => value + 1), 42);
      return () => clearTimeout(timer);
    }
    if (!wiping && length >= current.text.length) {
      const timer = setTimeout(() => setWiping(true), 2600);
      return () => clearTimeout(timer);
    }
    if (wiping && length > 0) {
      const timer = setTimeout(() => setLength((value) => value - 3), 14);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => {
      setWiping(false);
      setLength(0);
      setIndex((value) => (value + 1) % DANIEL_VERSES.length);
    }, 320);
    return () => clearTimeout(timer);
  }, [reduced, wiping, length, current.text.length, index]);

  const shown = reduced ? DANIEL_VERSES[0]!.text : current.text.slice(0, Math.max(0, length));
  const label = reduced ? "KJV" : current.translation;

  return (
    <div className="mx-auto max-w-3xl">
      <p
        role="text"
        className="min-h-[9.5rem] font-display text-[clamp(1.6rem,4.6vw,3.6rem)] font-bold leading-[1.1] text-deep-foreground sm:min-h-[11rem]"
        aria-label={`Daniel 5:25 — ${DANIEL_VERSES[0]!.text}`}
      >
        <span>{shown}</span>
        {!reduced && <span className="ml-1 inline-block w-[0.06em] animate-pulse bg-deep-foreground align-middle" style={{ height: "0.9em" }} />}
      </p>
      <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-deep-foreground/60">
        Daniel 5:25 · {label}
      </p>
    </div>
  );
}
