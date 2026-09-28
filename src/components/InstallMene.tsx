import { useEffect, useState } from "react";
import { Download, Share } from "lucide-react";
import { Button } from "@/components/ui/button";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

export function InstallMene({ compact = false }: { compact?: boolean }) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setIsIos(/iPhone|iPad|iPod/i.test(navigator.userAgent));
    setInstalled(
      window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true,
    );
    const capture = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", capture);
    return () => window.removeEventListener("beforeinstallprompt", capture);
  }, []);

  if (installed || (!prompt && !isIos)) return null;
  return (
    <div className={compact ? "px-1" : "surface p-5"}>
      <Button
        variant="outline"
        size={compact ? "sm" : "default"}
        className="w-full justify-start"
        onClick={async () => {
          if (prompt) {
            await prompt.prompt();
            const result = await prompt.userChoice;
            if (result.outcome === "accepted") setInstalled(true);
          } else
            alert(
              "On iPhone: tap Share, then choose ‘Add to Home Screen’. You may need to scroll down in the share menu.",
            );
        }}
      >
        {isIos && !prompt ? <Share className="size-4" /> : <Download className="size-4" />}
        Install Mene:Log
      </Button>
      {!compact && (
        <p className="mt-2 text-xs text-muted-foreground">
          Add Mene:Log to your home screen for app-like access. An internet connection is still
          required.
        </p>
      )}
    </div>
  );
}
