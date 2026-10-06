import {
  X,
  Play,
  ShieldCheck,
  QrCode,
  Users,
  Smartphone,
  Upload,
  Link as LinkIcon,
  RotateCcw,
  Film,
  Check,
} from "lucide-react";
import worshipPoster from "@/assets/mene-worship-poster.jpg";
import defaultWorshipVideo from "@/assets/mene-worship-hero.webm";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type VideoSource = {
  type: "default" | "file" | "url" | "embed";
  src: string;
  name?: string;
};

const STORAGE_KEY = "menelog_interactive_tour_video";

function parseVideoUrl(input: string): { type: "embed" | "url"; src: string } {
  const trimmed = input.trim();
  // YouTube parser
  const ytMatch = trimmed.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/
  );
  if (ytMatch && ytMatch[1]) {
    return {
      type: "embed",
      src: `https://www.youtube-nocookie.com/embed/${ytMatch[1]}?autoplay=1&rel=0`,
    };
  }
  // Vimeo parser
  const vimeoMatch = trimmed.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeoMatch && vimeoMatch[1]) {
    return {
      type: "embed",
      src: `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1`,
    };
  }
  // Direct video link
  return {
    type: "url",
    src: trimmed,
  };
}

export function HeroShowreelModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showUploader, setShowUploader] = useState(false);
  const [uploadTab, setUploadTab] = useState<"file" | "url">("file");
  const [urlInput, setUrlInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize with stored video or fallback to default
  const [videoSource, setVideoSource] = useState<VideoSource>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as VideoSource;
          if (parsed && parsed.src) return parsed;
        }
      } catch (err) {
        console.error("Failed to parse stored tour video:", err);
      }
    }
    return { type: "default", src: defaultWorshipVideo, name: "Default Sanctuary Walkthrough" };
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("video/")) {
      toast.error("Please upload a valid video file (MP4, WebM, MOV).");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const newSource: VideoSource = {
      type: "file",
      src: objectUrl,
      name: file.name,
    };

    setVideoSource(newSource);
    setShowUploader(false);
    toast.success(`Loaded tour video: ${file.name}`);
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) {
      toast.error("Please enter a valid video URL.");
      return;
    }

    const parsed = parseVideoUrl(urlInput);
    const newSource: VideoSource = {
      type: parsed.type,
      src: parsed.src,
      name: urlInput.trim(),
    };

    setVideoSource(newSource);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSource));
    } catch {
      // ignore storage errors
    }

    setShowUploader(false);
    setUrlInput("");
    toast.success("Applied custom video walkthrough URL!");
  };

  const handleResetDefault = () => {
    const defaultSource: VideoSource = {
      type: "default",
      src: defaultWorshipVideo,
      name: "Default Sanctuary Walkthrough",
    };
    setVideoSource(defaultSource);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setShowUploader(false);
    toast.success("Reset to default Mene:Log tour video.");
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mene:Log Interactive Showreel"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
    >
      {/* Frosted Glass Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200"
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-4xl overflow-hidden rounded-3xl border border-white/20 bg-slate-950/95 text-white shadow-2xl backdrop-blur-2xl animate-in zoom-in-95 duration-200">
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 sm:px-6 py-3.5 sm:py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-8 sm:size-9 place-items-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/30">
              <Play className="size-4 fill-current ml-0.5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-sm sm:text-base font-bold text-white">
                  Mene:Log Interactive Tour
                </h3>
                {videoSource.type !== "default" && (
                  <span className="rounded-full bg-blue-500/20 border border-blue-400/30 px-2 py-0.5 text-[10px] font-bold text-blue-300">
                    Custom Video
                  </span>
                )}
              </div>
              <p className="text-[11px] sm:text-xs text-white/60 line-clamp-1">
                {videoSource.name ?? "Live sanctuary check-in & congregation walkthrough"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Upload / Change Video Trigger */}
            <button
              type="button"
              onClick={() => setShowUploader((prev) => !prev)}
              aria-label="Change Video"
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 sm:px-3.5 py-1.5 text-xs font-semibold transition-all ${
                showUploader
                  ? "border-blue-400 bg-blue-600 text-white shadow-md shadow-blue-500/30"
                  : "border-white/20 bg-white/10 text-white/90 hover:bg-white/20 hover:text-white"
              }`}
            >
              <Upload className="size-3.5" />
              <span className="hidden sm:inline">Upload Video</span>
              <span className="sm:hidden inline">Change</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="grid size-8 sm:size-9 place-items-center rounded-full border border-white/15 bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Video Upload / Embed Drawer */}
        {showUploader && (
          <div className="border-b border-white/10 bg-slate-900/95 p-4 sm:p-5 text-white animate-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-white/70">
                Choose Tour Video Source
              </span>
              {videoSource.type !== "default" && (
                <button
                  type="button"
                  onClick={handleResetDefault}
                  className="inline-flex items-center gap-1 text-xs text-amber-300 hover:underline"
                >
                  <RotateCcw className="size-3" />
                  <span>Restore Default Tour</span>
                </button>
              )}
            </div>

            {/* Source Mode Tabs */}
            <div className="flex gap-2 p-1 bg-black/40 rounded-xl border border-white/10 max-w-xs mb-3">
              <button
                type="button"
                onClick={() => setUploadTab("file")}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                  uploadTab === "file"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-white/70 hover:text-white"
                }`}
              >
                <Film className="size-3.5" />
                <span>Upload File</span>
              </button>
              <button
                type="button"
                onClick={() => setUploadTab("url")}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                  uploadTab === "url"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-white/70 hover:text-white"
                }`}
              >
                <LinkIcon className="size-3.5" />
                <span>Video Link</span>
              </button>
            </div>

            {/* Tab 1: Local File Uploader */}
            {uploadTab === "file" && (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="group flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/20 bg-white/5 p-6 text-center cursor-pointer transition-colors hover:border-blue-500/60 hover:bg-blue-500/5"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime,video/ogg"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <span className="grid size-10 place-items-center rounded-full bg-blue-600/20 text-blue-400 group-hover:scale-110 transition-transform">
                  <Upload className="size-5" />
                </span>
                <p className="mt-2 text-sm font-semibold text-white">
                  Click or drag video file to upload
                </p>
                <p className="mt-1 text-xs text-white/50">
                  Supports MP4, WebM, or MOV formats (recommended under 50MB)
                </p>
              </div>
            )}

            {/* Tab 2: Video URL Embedder */}
            {uploadTab === "url" && (
              <form onSubmit={handleUrlSubmit} className="flex flex-col sm:flex-row gap-2">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="Paste YouTube, Vimeo, or direct MP4 link..."
                  className="flex-1 rounded-xl border border-white/20 bg-black/50 px-4 py-2 text-sm text-white placeholder-white/40 focus:border-blue-500 focus:outline-none"
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white shadow-md transition-all hover:bg-blue-500 active:scale-95"
                >
                  <Check className="size-4" />
                  <span>Apply Link</span>
                </button>
              </form>
            )}
          </div>
        )}

        {/* Video / Visual Stage */}
        <div className="relative aspect-video w-full bg-black overflow-hidden group">
          {videoSource.type === "embed" ? (
            <iframe
              src={videoSource.src}
              title="Interactive Tour Video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="size-full border-0"
            />
          ) : (
            <video
              key={videoSource.src}
              src={videoSource.src}
              poster={worshipPoster}
              controls
              autoPlay
              playsInline
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              className="size-full object-cover"
            />
          )}

          {videoSource.type !== "embed" && !isPlaying && (
            <div className="absolute inset-0 grid place-items-center pointer-events-none">
              <span className="grid size-16 place-items-center rounded-full bg-white/90 text-slate-900 shadow-2xl backdrop-blur-md">
                <Play className="size-7 fill-current ml-1" />
              </span>
            </div>
          )}
        </div>

        {/* Highlights Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-white/10 bg-slate-950/60 p-4 sm:p-5 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-white/10 text-primary">
              <QrCode className="size-4" />
            </span>
            <div>
              <p className="font-bold text-white">Sub-4s Scan</p>
              <p className="text-white/60 text-[11px]">Instant member QR</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-white/10 text-emerald-400">
              <Users className="size-4" />
            </span>
            <div>
              <p className="font-bold text-white">First-Timers</p>
              <p className="text-white/60 text-[11px]">Instant welcome slip</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-white/10 text-amber-400">
              <Smartphone className="size-4" />
            </span>
            <div>
              <p className="font-bold text-white">Live Kiosk</p>
              <p className="text-white/60 text-[11px]">Any tablet / phone</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-white/10 text-indigo-400">
              <ShieldCheck className="size-4" />
            </span>
            <div>
              <p className="font-bold text-white">Isolated Security</p>
              <p className="text-white/60 text-[11px]">Church-level RLS</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
