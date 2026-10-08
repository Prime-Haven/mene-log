import { useState, useRef, useEffect } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  RotateCcw,
  Sparkles,
  Compass,
  CheckCircle,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import demoVideo from "@/assets/mene-worship-hero.webm";
import posterImg from "@/assets/mene-worship-poster.jpg";
import { Button } from "@/components/ui/button";

/**
 * ============================================================================
 * SYSTEM TUTORIAL VIDEO CONFIGURATION
 * 
 * Once you finish editing your official tutorial video, replace 'TUTORIAL_VIDEO_SRC'
 * below with your new video file or URL.
 * 
 * Example:
 *   import officialTutorial from "@/assets/official-tutorial.mp4";
 *   export const TUTORIAL_VIDEO_SRC = officialTutorial;
 * ============================================================================
 */
export const TUTORIAL_VIDEO_SRC = demoVideo;

export function DashboardTutorialBanner({
  tenantName,
  className = "",
}: {
  tenantName?: string;
  className?: string;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isWatched, setIsWatched] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Initialize dismissed/watched state
  useEffect(() => {
    try {
      const stored = localStorage.getItem("menelog_tutorial_watched");
      if (stored === "true") {
        setIsWatched(true);
        setIsCollapsed(true);
      }
    } catch {
      // ignore
    }
  }, []);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const toggleFullscreen = () => {
    if (!videoRef.current) return;
    if (videoRef.current.requestFullscreen) {
      videoRef.current.requestFullscreen();
    }
  };

  const handleMarkWatched = () => {
    setIsWatched(true);
    setIsCollapsed(true);
    try {
      localStorage.setItem("menelog_tutorial_watched", "true");
    } catch {
      // ignore
    }
  };

  const handleRestartTour = () => {
    window.dispatchEvent(new CustomEvent("menelog:start-walkthrough"));
  };

  return (
    <div
      data-tour="dashboard-tutorial-banner"
      className={`rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-background p-5 sm:p-6 shadow-md transition-all ${className}`}
    >
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-primary/20 text-primary shrink-0 mt-0.5">
            <Sparkles className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-base sm:text-lg font-bold text-foreground">
                Mene:Log System Tutorial & Orientation
              </h2>
              {isWatched && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle className="size-3" />
                  Watched
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed max-w-2xl">
              Welcome{tenantName ? `, ${tenantName}` : ""}! Watch this quick walkthrough to master
              everyday door check-in, member directories, Sunday rosters, and pastoral care.
            </p>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRestartTour}
            className="h-8 gap-1.5 text-xs font-semibold"
          >
            <Compass className="size-3.5 text-primary" />
            <span>Interactive Walkthrough</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsCollapsed((prev) => !prev)}
            className="h-8 gap-1 text-xs text-muted-foreground"
          >
            {isCollapsed ? (
              <>
                <span>Watch Video</span>
                <ChevronDown className="size-3.5" />
              </>
            ) : (
              <>
                <span>Collapse</span>
                <ChevronUp className="size-3.5" />
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Expandable Video Player Section */}
      {!isCollapsed && (
        <div className="mt-5 space-y-4">
          <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-black shadow-inner group">
            <video
              ref={videoRef}
              src={TUTORIAL_VIDEO_SRC}
              poster={posterImg}
              playsInline
              preload="metadata"
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              className="size-full object-cover"
            >
              <source src={TUTORIAL_VIDEO_SRC} type="video/webm" />
              <source src="/videos/tutorial-demo.webm" type="video/webm" />
            </video>

            {/* Big center play button if not playing */}
            {!isPlaying && (
              <button
                type="button"
                onClick={togglePlay}
                aria-label="Play video"
                className="absolute inset-0 grid place-items-center bg-black/40 transition-colors hover:bg-black/30"
              >
                <span className="grid size-16 sm:size-20 place-items-center rounded-full bg-primary text-primary-foreground shadow-2xl transition-transform hover:scale-105 active:scale-95">
                  <Play className="size-7 sm:size-8 fill-current ml-1" />
                </span>
              </button>
            )}

            {/* Video overlay controls bar */}
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3 text-white transition-opacity duration-300 opacity-90 group-hover:opacity-100">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={togglePlay}
                  aria-label={isPlaying ? "Pause" : "Play"}
                  className="grid size-8 place-items-center rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                >
                  {isPlaying ? (
                    <Pause className="size-4 fill-current" />
                  ) : (
                    <Play className="size-4 fill-current ml-0.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={toggleMute}
                  aria-label={isMuted ? "Unmute" : "Mute"}
                  className="grid size-8 place-items-center rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                >
                  {isMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                </button>

                <span className="text-[11px] font-medium text-white/80">
                  Church Orientation Tutorial (Demo Video)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  aria-label="Fullscreen"
                  className="grid size-8 place-items-center rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                >
                  <Maximize2 className="size-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Bottom video footnote & complete action */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-muted-foreground pt-1">
            <p>
              💡 Once you finish watching the tutorial, your congregation's digital sanctuary is
              completely configured for Sunday door check-in.
            </p>

            <div className="flex items-center gap-2">
              {!isWatched && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleMarkWatched}
                  className="h-8 gap-1.5 text-xs font-semibold"
                >
                  <CheckCircle className="size-3.5 text-emerald-500" />
                  <span>Mark as Completed</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
