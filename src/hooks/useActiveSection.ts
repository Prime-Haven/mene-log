import { useEffect, useState } from "react";

export function useActiveSection(sectionIds: string[], offset: number = 280): string {
  const [activeId, setActiveId] = useState<string>(sectionIds[0] ?? "hero");
  const sectionKey = sectionIds.join(",");

  useEffect(() => {
    const ids = sectionKey.split(",");
    const handleScroll = () => {
      const marker = Math.min(offset, window.innerHeight * 0.25);

      for (let i = ids.length - 1; i >= 0; i--) {
        const id = ids[i];
        if (!id) continue;
        const el = document.getElementById(id);
        if (el) {
          // All sections must be compared in viewport coordinates: offsetTop
          // is relative to each section's parent, not necessarily the document.
          const top = el.getBoundingClientRect().top;
          if (marker >= top) {
            setActiveId(id);
            return;
          }
        }
      }
      setActiveId(ids[0] ?? "hero");
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);
    handleScroll();
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [sectionKey, offset]);

  return activeId;
}
