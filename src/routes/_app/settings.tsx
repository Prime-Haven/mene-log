import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Palette } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getBrandAssetUrl } from "@/lib/checkin.functions";
import { useServerFn } from "@tanstack/react-start";
import { TwoStepSettings } from "@/components/TwoStep";
import { ExportChurchData } from "@/components/ExportChurchData";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Mene:Log" },
      {
        name: "description",
        content: "Church name, group vocabulary and your public check-in link.",
      },
      { property: "og:title", content: "Settings — Mene:Log" },
      { property: "og:description", content: "Church name, wording and check-in link." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Settings,
});

function Settings() {
  const ctx = useTenant();
  const { tenant } = ctx;
  const qc = useQueryClient();
  const [name, setName] = useState(tenant?.name ?? "");
  const [vocab, setVocab] = useState(tenant?.group_vocabulary ?? "Group");
  const [primary, setPrimary] = useState(tenant?.brand_primary ?? "#3b82f6");
  const [accent, setAccent] = useState(tenant?.brand_accent ?? "#0f172a");
  const [welcome, setWelcome] = useState(tenant?.welcome_message ?? "");
  const [buttonText, setButtonText] = useState(tenant?.submit_button_text ?? "Check in");
  const [logoPath, setLogoPath] = useState<string | null>(tenant?.logo_path ?? null);
  const [backgroundPath, setBackgroundPath] = useState<string | null>(
    tenant?.background_path ?? null,
  );
  const loadAsset = useServerFn(getBrandAssetUrl);
  const { data: logoUrl } = useQuery({
    queryKey: ["settings-logo", logoPath],
    enabled: !!logoPath,
    queryFn: () => loadAsset({ data: { path: logoPath! } }),
  });
  const { data: backgroundUrl } = useQuery({
    queryKey: ["settings-background", backgroundPath],
    enabled: !!backgroundPath,
    queryFn: () => loadAsset({ data: { path: backgroundPath! } }),
  });

  async function upload(file: File, kind: "logo" | "background") {
    if (
      !tenant ||
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 5_000_000
    ) {
      throw new Error("Use a PNG, JPG or WebP image smaller than 5 MB");
    }
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${tenant.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("tenant-branding")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    if (kind === "logo") {
      setLogoPath(path);
    } else {
      setBackgroundPath(path);
    }
    toast.success(`${kind === "logo" ? "Logo" : "Background"} ready — save changes to publish it`);
  }

  const save = useMutation({
    mutationFn: async () => {
      const { error: brandError } = await supabase.rpc("update_tenant_branding", {
        p_tenant: tenant!.id,
        p_name: name.trim(),
        p_primary: primary,
        p_accent: accent,
        p_welcome: welcome,
        p_button: buttonText,
        p_logo_path: logoPath as string,
        p_background_path: backgroundPath as string,
      });
      if (brandError) throw brandError;
      const { error: vocabError } = await supabase.rpc("update_tenant_vocabulary", {
        p_tenant: tenant!.id,
        p_vocabulary: vocab.trim() || "Group",
      });
      if (vocabError) throw vocabError;
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["membership"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });

  const [replyTo, setReplyTo] = useState(tenant?.reply_to_email ?? "");
  const [smsSender, setSmsSender] = useState(tenant?.sms_sender_id ?? "");
  const [quietStart, setQuietStart] = useState(String(tenant?.quiet_hour_start ?? 21));
  const [quietEnd, setQuietEnd] = useState(String(tenant?.quiet_hour_end ?? 7));
  const [absence, setAbsence] = useState(String(tenant?.absence_threshold ?? 3));

  const saveMessaging = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("update_messaging_settings", {
        p_tenant: tenant!.id,
        p_reply_to: replyTo.trim(),
        p_sms_sender: smsSender.trim(),
        p_quiet_start: Number(quietStart),
        p_quiet_end: Number(quietEnd),
        p_absence: Number(absence),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Messaging settings saved");
      qc.invalidateQueries({ queryKey: ["membership"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });

  const checkinPath = `/c/${tenant?.subdomain ?? ""}`;

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <p className="text-eyebrow">Church</p>
        <h1 className="mt-2 text-2xl font-bold">Settings</h1>
      </div>

      {tenant && (
        <div className="grid gap-5 lg:grid-cols-2">
          <TwoStepSettings
            tenantId={tenant.id}
            isOwner={ctx.isOwner}
            requireMfa={tenant.require_mfa}
          />
          {ctx.isOwner && <ExportChurchData tenantId={tenant.id} subdomain={tenant.subdomain} />}
        </div>
      )}

      <form
        className="grid gap-5 lg:grid-cols-[1fr_.9fr]"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="surface space-y-5 p-5 sm:p-6">
          <div>
            <p className="text-eyebrow">Identity</p>
            <h2 className="mt-1 text-lg font-semibold">Church branding</h2>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cname">Church name</Label>
            <Input
              id="cname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="primary">Primary colour</Label>
              <div className="flex gap-2">
                <input
                  id="primary"
                  type="color"
                  className="h-10 w-12 rounded border bg-white p-1"
                  value={primary}
                  onChange={(e) => setPrimary(e.target.value)}
                />
                <Input
                  value={primary}
                  onChange={(e) => setPrimary(e.target.value)}
                  pattern="#[0-9a-fA-F]{6}"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="accent">Accent colour</Label>
              <div className="flex gap-2">
                <input
                  id="accent"
                  type="color"
                  className="h-10 w-12 rounded border bg-white p-1"
                  value={accent}
                  onChange={(e) => setAccent(e.target.value)}
                />
                <Input
                  value={accent}
                  onChange={(e) => setAccent(e.target.value)}
                  pattern="#[0-9a-fA-F]{6}"
                />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="welcome">Welcome message</Label>
            <Input
              id="welcome"
              value={welcome}
              onChange={(e) => setWelcome(e.target.value)}
              maxLength={240}
              placeholder="Welcome to our church family."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="button">Check-in button wording</Label>
            <Input
              id="button"
              value={buttonText}
              onChange={(e) => setButtonText(e.target.value)}
              maxLength={40}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed p-3 text-center text-sm hover:bg-secondary">
              <ImagePlus className="mb-2 size-5 text-primary" />
              Upload logo
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) =>
                  e.target.files?.[0] &&
                  upload(e.target.files[0], "logo").catch((err) => toast.error(err.message))
                }
              />
            </label>
            <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed p-3 text-center text-sm hover:bg-secondary">
              <Palette className="mb-2 size-5 text-primary" />
              Upload background
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) =>
                  e.target.files?.[0] &&
                  upload(e.target.files[0], "background").catch((err) => toast.error(err.message))
                }
              />
            </label>
          </div>
          <div className="space-y-2">
            <Label htmlFor="vocab">What you call a group</Label>
            <Input
              id="vocab"
              value={vocab}
              onChange={(e) => setVocab(e.target.value)}
              placeholder="Cell, Unit, Ministry, Zone"
              maxLength={40}
            />
          </div>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save and publish"}
          </Button>
        </div>
        <div>
          <p className="mb-2 text-eyebrow">Live preview</p>
          <div
            className="surface min-h-[520px] overflow-hidden bg-cover bg-center p-5"
            style={{
              backgroundImage: backgroundUrl
                ? `linear-gradient(rgb(255 255 255 / .9), rgb(255 255 255 / .95)), url(${backgroundUrl})`
                : undefined,
            }}
          >
            {logoUrl ? (
              <img src={logoUrl} alt="Logo preview" className="h-14 max-w-40 object-contain" />
            ) : (
              <div
                className="grid size-12 place-items-center rounded-xl text-white"
                style={{ background: primary }}
              >
                {name.slice(0, 1) || "C"}
              </div>
            )}
            <p
              className="mt-5 text-xs font-bold uppercase tracking-widest"
              style={{ color: primary }}
            >
              {name || "Your church"}
            </p>
            <h3 className="mt-2 text-2xl">Welcome — let's check you in</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {welcome || "Your welcome message will appear here."}
            </p>
            <div className="mt-6 space-y-3">
              <div className="h-11 rounded-lg border bg-white" />
              <div className="h-11 rounded-lg border bg-white" />
              <button
                type="button"
                className="h-11 w-full rounded-lg font-semibold text-white"
                style={{ background: primary }}
              >
                {buttonText || "Check in"}
              </button>
            </div>
          </div>
        </div>
      </form>

      <form
        className="surface space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          saveMessaging.mutate();
        }}
      >
        <div>
          <p className="text-eyebrow">Messages</p>
          <h2 className="mt-1 text-lg font-semibold">How your church reaches members</h2>
          <p className="text-sm text-muted-foreground">
            These settings apply to welcome messages, birthday wishes, follow-ups and broadcasts.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="replyto">Reply-to email</Label>
            <Input
              id="replyto"
              type="email"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              maxLength={160}
              placeholder="office@yourchurch.org"
            />
          </div>
          {ctx.can("sms") && (
            <div className="space-y-2">
              <Label htmlFor="smssender">Text-message sender name</Label>
              <Input
                id="smssender"
                value={smsSender}
                onChange={(e) => setSmsSender(e.target.value)}
                maxLength={11}
                placeholder="MyChurch"
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="qstart">Stop sending after (hour)</Label>
            <Input
              id="qstart"
              type="number"
              min={0}
              max={23}
              value={quietStart}
              onChange={(e) => setQuietStart(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="qend">Start sending again at (hour)</Label>
            <Input
              id="qend"
              type="number"
              min={0}
              max={23}
              value={quietEnd}
              onChange={(e) => setQuietEnd(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="absence">Follow up after this many weeks away</Label>
            <Input
              id="absence"
              type="number"
              min={1}
              max={12}
              value={absence}
              onChange={(e) => setAbsence(e.target.value)}
            />
          </div>
        </div>
        <Button type="submit" variant="outline" disabled={saveMessaging.isPending}>
          {saveMessaging.isPending ? "Saving…" : "Save message settings"}
        </Button>
      </form>

      <div className="surface space-y-2 p-5">
        <p className="text-eyebrow">Public check-in link</p>
        <p className="font-mono text-sm break-all">{checkinPath}</p>
        <p className="text-sm text-muted-foreground">
          Share this with first-timers, or print it as a QR code at the entrance. It never shows any
          member's details.
        </p>
        <Button asChild variant="outline" size="sm">
          <a href={checkinPath} target="_blank" rel="noopener noreferrer">
            Open check-in form
          </a>
        </Button>
      </div>
    </div>
  );
}
