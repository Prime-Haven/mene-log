import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Clock, KeyRound, Loader2, Radio } from "lucide-react";
import { pingWatch, startWatch } from "@/lib/watch.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/live/$subdomain")({
  head: () => ({
    meta: [
      { title: "Watch Live — Mene:Log" },
      { name: "description", content: "Enter your member code to watch your church's live service online." },
      { property: "og:title", content: "Watch Live" },
      { property: "og:description", content: "Watch your church's service live and have your attendance recorded." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WatchLive,
});

type Session = Extract<Awaited<ReturnType<typeof startWatch>>, { ok: true }>;

function embedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") return `https://www.youtube.com/embed/${u.pathname.slice(1)}?autoplay=1`;
    if (host === "youtube.com") {
      const id = u.searchParams.get("v") ?? u.pathname.match(/\/(live|embed|shorts)\/([^/?]+)/)?.[2];
      if (id) return `https://www.youtube.com/embed/${id}?autoplay=1`;
    }
    if (host === "vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean).pop();
      if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}?autoplay=1`;
    }
    if (host === "player.vimeo.com") return url;
    if (host === "facebook.com" || host === "fb.watch") {
      return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&autoplay=true`;
    }
    return null;
  } catch {
    return null;
  }
}

const fmt = (s: number) => `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;

function WatchLive() {
  const { subdomain } = Route.useParams();
  const start = useServerFn(startWatch);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const clean = code.replace(/\s|-/g, "").toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(clean)) {
      setError("Member codes are 32 letters and numbers. Check the code under your QR.");
      return;
    }
    setBusy(true);
    try {
      const res = await start({ data: { subdomain, code: clean } });
      if (!res.ok) setError(res.message);
      else {
        setCode(clean);
        setSession(res);
        setServiceId(res.services[0]?.id ?? null);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const service = session?.services.find((s) => s.id === serviceId) ?? null;

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between">
          <Link to="/c/$subdomain" params={{ subdomain }} className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to check-in
          </Link>
          <span className="inline-flex items-center gap-2 rounded-full bg-destructive/10 px-3 py-1 text-xs font-semibold text-destructive">
            <Radio className="size-3.5 animate-pulse" /> Watch Live
          </span>
        </div>

        <AnimatePresence mode="wait">
          {!session ? (
            <motion.form
              key="code"
              onSubmit={onSubmit}
              initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -12, filter: "blur(6px)" }}
              className="surface mx-auto max-w-md space-y-5 p-8"
            >
              <div className="text-center">
                <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <KeyRound className="size-6" />
                </div>
                <h1 className="font-display text-2xl font-bold">Watch the service live</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Enter your member code — the code printed under your check-in QR. Your attendance is recorded while you watch.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">Member code</Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. 3f9a…"
                  autoComplete="off"
                  className="h-11 font-mono"
                  maxLength={48}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="h-11 w-full" disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Start watching"}
              </Button>
            </motion.form>
          ) : (
            <motion.div key="player" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              <div>
                <p className="text-sm text-muted-foreground">{session.church}</p>
                <h1 className="font-display text-2xl font-bold">Welcome, {session.member}</h1>
              </div>
              {session.services.length === 0 ? (
                <div className="surface p-8 text-center text-sm text-muted-foreground">
                  There's no live service right now. Please come back when the service starts.
                </div>
              ) : (
                <>
                  {session.services.length > 1 && (
                    <div className="flex flex-wrap gap-2">
                      {session.services.map((s) => (
                        <Button key={s.id} size="sm" variant={s.id === serviceId ? "default" : "outline"} onClick={() => setServiceId(s.id)}>
                          {s.name} · {s.date}
                        </Button>
                      ))}
                    </div>
                  )}
                  {service && <Player key={service.id} subdomain={subdomain} code={code} service={service} />}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Player({
  subdomain,
  code,
  service,
}: {
  subdomain: string;
  code: string;
  service: Session["services"][number];
}) {
  const ping = useServerFn(pingWatch);
  const [seconds, setSeconds] = useState(service.watchedSeconds);
  const [recorded, setRecorded] = useState(false);
  const [ended, setEnded] = useState("");
  const secondsRef = useRef(seconds);
  secondsRef.current = seconds;
  const embed = embedUrl(service.url);
  const target = service.minMinutes * 60;

  useEffect(() => {
    let active = true;
    const beat = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await ping({ data: { subdomain, code, service_id: service.id } });
        if (!active) return;
        if (!r.ok) setEnded(r.message);
        else {
          if (r.seconds > secondsRef.current) setSeconds(r.seconds);
          if (r.recorded) setRecorded(true);
        }
      } catch {
        /* transient network issue — next beat retries */
      }
    };
    void beat();
    const t = window.setInterval(beat, 30_000);
    const tick = window.setInterval(() => {
      if (document.visibilityState === "visible") setSeconds((s) => s + 1);
    }, 1000);
    return () => {
      active = false;
      window.clearInterval(t);
      window.clearInterval(tick);
    };
  }, [ping, subdomain, code, service.id]);

  const pct = Math.min(100, Math.round((seconds / Math.max(1, target)) * 100));

  return (
    <div className="space-y-4">
      <div className="surface overflow-hidden p-0">
        {ended ? (
          <div className="grid aspect-video place-items-center p-6 text-center text-sm text-muted-foreground">{ended}</div>
        ) : embed ? (
          <iframe
            src={embed}
            title={service.name}
            className="aspect-video w-full"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        ) : (
          <div className="grid aspect-video place-items-center p-6 text-center">
            <div>
              <p className="text-sm text-muted-foreground">This stream opens on its own site. Keep this page open so your time counts.</p>
              <Button asChild className="mt-4">
                <a href={service.url} target="_blank" rel="noopener noreferrer">Open the live stream</a>
              </Button>
            </div>
          </div>
        )}
      </div>
      <div className="surface flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-3">
          <Clock className="size-5 text-primary" />
          <div>
            <p className="text-sm font-semibold">Watched {fmt(seconds)}</p>
            <p className="text-xs text-muted-foreground">
              {recorded ? "Your attendance is recorded. Thank you for joining!" : `Watch ${service.minMinutes} minutes to be marked present.`}
            </p>
          </div>
        </div>
        {recorded ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
            <CheckCircle2 className="size-4" /> Present
          </span>
        ) : (
          <div className="h-2 w-40 overflow-hidden rounded-full bg-muted">
            <motion.div className="h-full bg-primary" animate={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
