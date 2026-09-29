import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  Building2,
  Palette,
  QrCode,
  HeartHandshake,
  Mail,
  Shield,
  Database,
  ImagePlus,
  Copy,
  ExternalLink,
  Check,
  RefreshCw,
  Trash2,
  AlertTriangle,
  Lock,
  Sparkles,
  Sliders,
  Clock,
  Globe,
  DollarSign,
  Phone,
  MapPin,
  Save,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getBrandAssetUrl } from "@/lib/checkin.functions";
import { useServerFn } from "@tanstack/react-start";
import { TwoStepSettings } from "@/components/TwoStep";
import { ExportChurchData } from "@/components/ExportChurchData";
import {
  saveChurchSettings,
  resetWeeklyServices,
  clearTestAttendanceRecords,
  type ChurchSettingsData,
} from "@/lib/church-settings.functions";
import { planLabel } from "@/lib/pricing";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({
    meta: [
      { title: "Church Settings & Governance — Mene:Log" },
      {
        name: "description",
        content:
          "Configure church identity, branding, check-in policies, member care thresholds, and security.",
      },
      { property: "og:title", content: "Church Settings — Mene:Log" },
      {
        property: "og:description",
        content: "Comprehensive church administration and configuration console.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ChurchSettingsPage,
});

const COLOR_PRESETS = [
  { name: "Royal Blue", hex: "#2563eb" },
  { name: "Navy Blue", hex: "#1e3a8a" },
  { name: "Emerald Green", hex: "#059669" },
  { name: "Burgundy", hex: "#881337" },
  { name: "Purple Majesty", hex: "#7c3aed" },
  { name: "Amber Gold", hex: "#d97706" },
  { name: "Dark Slate", hex: "#0f172a" },
];

const TIMEZONE_OPTIONS = [
  "UTC",
  "Africa/Accra",
  "Africa/Lagos",
  "Africa/Nairobi",
  "Africa/Johannesburg",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Singapore",
];

const CURRENCY_OPTIONS = [
  { code: "GHS", label: "Ghanaian Cedi (GH₵)" },
  { code: "USD", label: "US Dollar ($)" },
  { code: "NGN", label: "Nigerian Naira (₦)" },
  { code: "GBP", label: "British Pound (£)" },
  { code: "EUR", label: "Euro (€)" },
  { code: "KES", label: "Kenyan Shilling (KSh)" },
  { code: "ZAR", label: "South African Rand (R)" },
];

export function ChurchSettingsPage() {
  const ctx = useTenant();
  const { tenant, tier, isOwner, isAdmin, can } = ctx;
  const qc = useQueryClient();

  const saveSettingsFn = useServerFn(saveChurchSettings);
  const resetDefaultsFn = useServerFn(resetWeeklyServices);
  const clearAttendanceFn = useServerFn(clearTestAttendanceRecords);

  const existingSettings = (tenant?.settings ?? {}) as Record<string, unknown>;

  // Tab State
  const [activeTab, setActiveTab] = useState<
    "general" | "branding" | "checkin" | "care" | "messaging" | "security" | "danger"
  >("general");

  // Form State: 1. General Profile
  const [name, setName] = useState(tenant?.name ?? "");
  const [denomination, setDenomination] = useState(String(existingSettings.denomination ?? ""));
  const [contactPhone, setContactPhone] = useState(tenant?.contact_phone ?? "");
  const [contactEmail, setContactEmail] = useState(tenant?.contact_email ?? "");
  const [address, setAddress] = useState(String(existingSettings.address ?? ""));
  const [city, setCity] = useState(String(existingSettings.city ?? ""));
  const [country, setCountry] = useState(String(existingSettings.country ?? ""));
  const [timezone, setTimezone] = useState(String(existingSettings.timezone ?? "Africa/Accra"));
  const [currency, setCurrency] = useState(String(existingSettings.currency ?? "GHS"));
  const [memberCodePrefix, setMemberCodePrefix] = useState(
    String(existingSettings.member_code_prefix ?? "ML-"),
  );

  // Form State: 2. Branding & Appearance
  const [primary, setPrimary] = useState(tenant?.brand_primary ?? "#3b82f6");
  const [accent, setAccent] = useState(tenant?.brand_accent ?? "#0f172a");
  const [welcome, setWelcome] = useState(tenant?.welcome_message ?? "");
  const [buttonText, setButtonText] = useState(tenant?.submit_button_text ?? "Check in");
  const [logoPath, setLogoPath] = useState<string | null>(tenant?.logo_path ?? null);
  const [backgroundPath, setBackgroundPath] = useState<string | null>(
    tenant?.background_path ?? null,
  );

  // Form State: 3. Check-in & Attendance Policies
  const [checkinWindow, setCheckinWindow] = useState<number>(
    Number(existingSettings.checkin_window_hours ?? 4),
  );
  const [allowSelfReg, setAllowSelfReg] = useState<boolean>(
    existingSettings.allow_self_registration !== false,
  );
  const [requirePhone, setRequirePhone] = useState<boolean>(
    Boolean(existingSettings.require_phone_on_checkin),
  );
  const [requireResidence, setRequireResidence] = useState<boolean>(
    Boolean(existingSettings.require_residence_on_checkin),
  );

  // Form State: 4. Member Care & Terminology
  const [vocab, setVocab] = useState(tenant?.group_vocabulary ?? "Group");
  const [absence, setAbsence] = useState<number>(Number(tenant?.absence_threshold ?? 3));
  const [autoWelcome, setAutoWelcome] = useState<boolean>(
    Boolean(existingSettings.auto_welcome_enabled),
  );
  const [autoWelcomeMsg, setAutoWelcomeMsg] = useState(
    String(existingSettings.auto_welcome_message ?? "Welcome to our church family!"),
  );
  const [autoAbsent, setAutoAbsent] = useState<boolean>(
    Boolean(existingSettings.auto_absent_enabled),
  );
  const [autoAbsentMsg, setAutoAbsentMsg] = useState(
    String(
      existingSettings.auto_absent_message ?? "We missed you at church today. Hope you are well!",
    ),
  );

  // Form State: 5. Messaging
  const [replyTo, setReplyTo] = useState(tenant?.reply_to_email ?? "");
  const [smsSender, setSmsSender] = useState(tenant?.sms_sender_id ?? "");
  const [quietStart, setQuietStart] = useState<number>(Number(tenant?.quiet_hour_start ?? 21));
  const [quietEnd, setQuietEnd] = useState<number>(Number(tenant?.quiet_hour_end ?? 7));

  // Form State: 6. Security
  const [requireMfa, setRequireMfa] = useState<boolean>(Boolean(tenant?.require_mfa));
  const [sessionTimeout, setSessionTimeout] = useState<number>(
    Number(existingSettings.session_timeout_minutes ?? 60),
  );

  // Danger Zone Dialogs
  const [clearAttendanceModal, setClearAttendanceModal] = useState(false);
  const [confirmClearInput, setConfirmClearInput] = useState("");

  const [copiedLink, setCopiedLink] = useState(false);

  // Asset URLs
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

  // Upload handler for logos and backgrounds
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
      // Also update logo_path directly on tenant
      await supabase.from("tenants").update({ logo_path: path }).eq("id", tenant.id);
    } else {
      setBackgroundPath(path);
      await supabase.from("tenants").update({ background_path: path }).eq("id", tenant.id);
    }
    toast.success(
      `${kind === "logo" ? "Church Logo" : "Background wallpaper"} uploaded and updated`,
    );
    qc.invalidateQueries({ queryKey: ["membership"] });
  }

  // Save full settings
  const saveAll = useMutation({
    mutationFn: async () => {
      if (!tenant) return;
      const payload: ChurchSettingsData = {
        tenant_id: tenant.id,
        name: name.trim() || tenant.name,
        denomination: denomination.trim(),
        contact_phone: contactPhone.trim(),
        contact_email: contactEmail.trim(),
        address: address.trim(),
        city: city.trim(),
        country: country.trim(),
        timezone,
        currency,
        member_code_prefix: memberCodePrefix.trim().toUpperCase() || "ML-",

        brand_primary: primary,
        brand_accent: accent,
        welcome_message: welcome.trim(),
        submit_button_text: buttonText.trim() || "Check in",
        group_vocabulary: vocab.trim() || "Group",

        checkin_window_hours: checkinWindow,
        allow_self_registration: allowSelfReg,
        require_phone_on_checkin: requirePhone,
        require_residence_on_checkin: requireResidence,

        reply_to_email: replyTo.trim(),
        sms_sender_id: smsSender.trim().toUpperCase(),
        quiet_hour_start: quietStart,
        quiet_hour_end: quietEnd,
        absence_threshold: absence,
        auto_welcome_enabled: autoWelcome,
        auto_welcome_message: autoWelcomeMsg.trim(),
        auto_absent_enabled: autoAbsent,
        auto_absent_message: autoAbsentMsg.trim(),

        require_mfa: requireMfa,
        session_timeout_minutes: sessionTimeout,
      };

      const result = await saveSettingsFn({ data: payload });
      if (!result.ok) throw new Error(result.message);
      return result;
    },
    onSuccess: () => {
      toast.success("Church settings saved successfully");
      qc.invalidateQueries({ queryKey: ["membership"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save settings"),
  });

  // Reset default weekly services
  const resetDefaults = useMutation({
    mutationFn: async () => {
      if (!tenant) return;
      const res = await resetDefaultsFn({ data: { tenant_id: tenant.id } });
      if (!res.ok) throw new Error(res.message);
      return res;
    },
    onSuccess: () => {
      toast.success("Sunday, Midweek, and Prayer services verified & active");
      qc.invalidateQueries({ queryKey: ["services"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not reset services"),
  });

  // Clear test attendance
  const clearAttendance = useMutation({
    mutationFn: async () => {
      if (!tenant) return;
      if (confirmClearInput.toLowerCase() !== "clear attendance") {
        throw new Error("Type 'CLEAR ATTENDANCE' exactly to confirm");
      }
      const res = await clearAttendanceFn({ data: { tenant_id: tenant.id } });
      if (!res.ok) throw new Error((res as { message?: string }).message);
      return res;
    },
    onSuccess: (res) => {
      toast.success(
        `Cleared ${res?.deleted_count} test attendance logs. Member records and services are preserved.`,
      );
      setClearAttendanceModal(false);
      setConfirmClearInput("");
      qc.invalidateQueries({ queryKey: ["register"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to clear attendance"),
  });

  const checkinPublicUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/c/${tenant?.subdomain ?? ""}`
      : `/c/${tenant?.subdomain ?? ""}`;

  const copyCheckinUrl = () => {
    navigator.clipboard.writeText(checkinPublicUrl);
    setCopiedLink(true);
    toast.success("Check-in link copied to clipboard");
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="max-w-6xl space-y-7 pb-16">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-eyebrow">Church Governance & Configuration</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
            Church Settings Hub
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Full administrative control over church identity, check-in policies, member care, and
            security.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Badge
            variant="outline"
            className="border-primary/30 bg-primary/10 text-primary font-display font-semibold px-3 py-1 text-xs"
          >
            <Sparkles className="size-3 mr-1 text-primary" /> {planLabel(tier ?? "basic")} Package
          </Badge>

          <Button
            onClick={() => saveAll.mutate()}
            disabled={saveAll.isPending || !isAdmin}
            className="font-semibold shadow-sm"
          >
            <Save className="size-4 mr-1.5" />
            {saveAll.isPending ? "Saving Changes…" : "Save All Settings"}
          </Button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex overflow-x-auto border-b border-border/80 scrollbar-none gap-1">
        <button
          type="button"
          onClick={() => setActiveTab("general")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-all ${
            activeTab === "general"
              ? "border-primary text-primary bg-primary/5"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Building2 className="size-4" />
          General Profile
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("branding")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-all ${
            activeTab === "branding"
              ? "border-primary text-primary bg-primary/5"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Palette className="size-4" />
          Branding & Visuals
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("checkin")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-all ${
            activeTab === "checkin"
              ? "border-primary text-primary bg-primary/5"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <QrCode className="size-4" />
          Check-in & Attendance
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("care")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-all ${
            activeTab === "care"
              ? "border-primary text-primary bg-primary/5"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <HeartHandshake className="size-4" />
          Member Care & Wording
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("messaging")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-all ${
            activeTab === "messaging"
              ? "border-primary text-primary bg-primary/5"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Mail className="size-4" />
          Messaging & Alerts
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("security")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-all ${
            activeTab === "security"
              ? "border-primary text-primary bg-primary/5"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Shield className="size-4" />
          Security & Access
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("danger")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-all ${
            activeTab === "danger"
              ? "border-destructive text-destructive bg-destructive/5"
              : "border-transparent text-muted-foreground hover:text-destructive"
          }`}
        >
          <Database className="size-4" />
          Data Hub & Governance
        </button>
      </div>

      {/* TAB 1: General Church Profile */}
      {activeTab === "general" && (
        <div className="space-y-6">
          <div className="surface rounded-2xl border p-6 shadow-panel space-y-5">
            <h2 className="font-display text-base font-bold text-foreground flex items-center gap-2">
              <Building2 className="size-4 text-primary" /> Church Identity & Campus
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="cname" className="text-xs font-semibold">
                  Official Church Name *
                </Label>
                <Input
                  id="cname"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Grace City Church"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cdenom" className="text-xs font-semibold">
                  Denomination / Network
                </Label>
                <Input
                  id="cdenom"
                  value={denomination}
                  onChange={(e) => setDenomination(e.target.value)}
                  placeholder="e.g. Assemblies of God, Baptist, Non-denominational"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cprefix" className="text-xs font-semibold">
                  Member ID Code Prefix
                </Label>
                <Input
                  id="cprefix"
                  value={memberCodePrefix}
                  onChange={(e) => setMemberCodePrefix(e.target.value.toUpperCase())}
                  placeholder="e.g. ML-, GCC-, HOF-"
                  maxLength={6}
                />
                <p className="text-[11px] text-muted-foreground">
                  Unique member QR and search codes will use this prefix (e.g. {memberCodePrefix}
                  9X2B1A).
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cphone" className="text-xs font-semibold">
                  Church Contact Phone
                </Label>
                <Input
                  id="cphone"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="e.g. +233 24 123 4567"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cemail" className="text-xs font-semibold">
                  Church Office Email
                </Label>
                <Input
                  id="cemail"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="e.g. office@church.org"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="caddress" className="text-xs font-semibold">
                  Physical Campus Address
                </Label>
                <Input
                  id="caddress"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. 14 Airport Residential Area, Near Heights"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ccity" className="text-xs font-semibold">
                  City
                </Label>
                <Input
                  id="ccity"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g. Accra"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ccountry" className="text-xs font-semibold">
                  Country
                </Label>
                <Input
                  id="ccountry"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="e.g. Ghana"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ctimezone" className="text-xs font-semibold">
                  Service Timezone
                </Label>
                <select
                  id="ctimezone"
                  className="h-10 w-full rounded-xl border border-input bg-background px-3 text-xs font-medium"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                >
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ccurrency" className="text-xs font-semibold">
                  Currency for Reports & Financials
                </Label>
                <select
                  id="ccurrency"
                  className="h-10 w-full rounded-xl border border-input bg-background px-3 text-xs font-medium"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  {CURRENCY_OPTIONS.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Public Check-in Link Box */}
          <div className="surface rounded-2xl border p-6 shadow-panel space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Globe className="size-3.5 text-primary" /> Public Check-in URL
            </h3>
            <p className="text-xs text-muted-foreground">
              Share this dedicated link or generate a permanent QR code poster for congregation self
              check-in.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="flex-1 rounded-xl border bg-muted/40 px-3.5 py-2 text-xs font-mono text-foreground break-all">
                {checkinPublicUrl}
              </code>
              <Button size="sm" variant="outline" onClick={copyCheckinUrl} className="gap-1.5">
                {copiedLink ? (
                  <Check className="size-4 text-emerald-500" />
                ) : (
                  <Copy className="size-4" />
                )}
                {copiedLink ? "Copied!" : "Copy URL"}
              </Button>
              <a href={checkinPublicUrl} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="ghost" className="gap-1.5">
                  <ExternalLink className="size-4" /> Open
                </Button>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Branding & Appearance */}
      {activeTab === "branding" && (
        <div className="space-y-6">
          <div className="surface rounded-2xl border p-6 shadow-panel space-y-6">
            <div>
              <h2 className="font-display text-base font-bold text-foreground flex items-center gap-2">
                <Palette className="size-4 text-primary" /> Visual Identity & Custom Colors
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Tailor your public check-in screen with your church colors, custom logo, and
                background graphics.
              </p>
            </div>

            {/* Color Presets & Custom HEX */}
            <div className="space-y-4">
              <div>
                <Label className="text-xs font-semibold">Primary Theme Color</Label>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {COLOR_PRESETS.map((p) => (
                    <button
                      key={p.hex}
                      type="button"
                      onClick={() => setPrimary(p.hex)}
                      className={`size-8 rounded-full border-2 transition-transform ${
                        primary.toLowerCase() === p.hex.toLowerCase()
                          ? "scale-110 border-foreground shadow-md ring-2 ring-primary/40"
                          : "border-transparent hover:scale-105"
                      }`}
                      style={{ backgroundColor: p.hex }}
                      title={p.name}
                    />
                  ))}
                  <div className="flex items-center gap-2 ml-2">
                    <input
                      type="color"
                      value={primary}
                      onChange={(e) => setPrimary(e.target.value)}
                      className="size-8 rounded-lg cursor-pointer border p-0.5 bg-background"
                    />
                    <Input
                      value={primary}
                      onChange={(e) => setPrimary(e.target.value)}
                      className="w-28 font-mono text-xs uppercase h-8"
                      maxLength={7}
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold">Accent / Contrast Color</Label>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="color"
                    value={accent}
                    onChange={(e) => setAccent(e.target.value)}
                    className="size-8 rounded-lg cursor-pointer border p-0.5 bg-background"
                  />
                  <Input
                    value={accent}
                    onChange={(e) => setAccent(e.target.value)}
                    className="w-28 font-mono text-xs uppercase h-8"
                    maxLength={7}
                  />
                </div>
              </div>
            </div>

            {/* Check-in Welcome Copy */}
            <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="cwelcome" className="text-xs font-semibold">
                  Public Check-in Welcome Headline
                </Label>
                <Input
                  id="cwelcome"
                  value={welcome}
                  onChange={(e) => setWelcome(e.target.value)}
                  placeholder="e.g. Welcome Home! We are blessed to have you with us."
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cbtn" className="text-xs font-semibold">
                  Submit Button Text
                </Label>
                <Input
                  id="cbtn"
                  value={buttonText}
                  onChange={(e) => setButtonText(e.target.value)}
                  placeholder="e.g. Check in, Mark Present, I am Here"
                />
              </div>
            </div>

            {/* Logo and Wallpaper Uploads */}
            <div className="grid gap-6 sm:grid-cols-2 pt-4 border-t">
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Church Emblem / Logo</Label>
                <div className="flex items-center gap-4 rounded-xl border p-4 bg-muted/20">
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt="Church logo"
                      className="size-16 rounded-xl object-contain border bg-background p-1"
                    />
                  ) : (
                    <div className="size-16 rounded-xl border-2 border-dashed flex items-center justify-center text-muted-foreground text-xs">
                      No logo
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <label className="cursor-pointer inline-flex items-center gap-1.5 text-xs font-semibold bg-primary text-primary-foreground px-3 py-1.5 rounded-lg shadow-sm hover:opacity-90 transition">
                      <ImagePlus className="size-3.5" /> Upload Logo
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) upload(file, "logo");
                        }}
                      />
                    </label>
                    <p className="text-[11px] text-muted-foreground">PNG, JPG or WebP up to 5 MB</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold">Check-in Wallpaper Background</Label>
                <div className="flex items-center gap-4 rounded-xl border p-4 bg-muted/20">
                  {backgroundUrl ? (
                    <img
                      src={backgroundUrl}
                      alt="Check-in background"
                      className="size-16 rounded-xl object-cover border bg-background"
                    />
                  ) : (
                    <div className="size-16 rounded-xl border-2 border-dashed flex items-center justify-center text-muted-foreground text-xs">
                      Default
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <label className="cursor-pointer inline-flex items-center gap-1.5 text-xs font-semibold bg-muted text-foreground border px-3 py-1.5 rounded-lg shadow-sm hover:bg-muted/80 transition">
                      <ImagePlus className="size-3.5" /> Upload Wallpaper
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) upload(file, "background");
                        }}
                      />
                    </label>
                    <p className="text-[11px] text-muted-foreground">
                      High-res landscape recommended
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Check-in & Attendance Policies */}
      {activeTab === "checkin" && (
        <div className="space-y-6">
          <div className="surface rounded-2xl border p-6 shadow-panel space-y-6">
            <h2 className="font-display text-base font-bold text-foreground flex items-center gap-2">
              <QrCode className="size-4 text-primary" /> Attendance & Check-in Governance
            </h2>

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4 p-4 rounded-xl border bg-muted/20">
                <div>
                  <p className="text-xs font-bold text-foreground">
                    Allow Public Self-Registration / Walk-ins
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    When enabled, first-timers and attendees can check themselves in via your public
                    link.
                  </p>
                </div>
                <Switch checked={allowSelfReg} onCheckedChange={setAllowSelfReg} />
              </div>

              <div className="flex items-center justify-between gap-4 p-4 rounded-xl border bg-muted/20">
                <div>
                  <p className="text-xs font-bold text-foreground">
                    Require Phone Number on Public Check-in
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Mandatory phone field ensures pastoral care team can reach every first-timer.
                  </p>
                </div>
                <Switch checked={requirePhone} onCheckedChange={setRequirePhone} />
              </div>

              <div className="flex items-center justify-between gap-4 p-4 rounded-xl border bg-muted/20">
                <div>
                  <p className="text-xs font-bold text-foreground">
                    Require Residential Area / Neighborhood
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Helpful for assigning first-timers to the closest cell or fellowship group.
                  </p>
                </div>
                <Switch checked={requireResidence} onCheckedChange={setRequireResidence} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2 pt-2">
                <div className="space-y-1.5">
                  <Label htmlFor="cwindow" className="text-xs font-semibold">
                    Attendance Window (Hours after service opens)
                  </Label>
                  <Input
                    id="cwindow"
                    type="number"
                    min={1}
                    max={24}
                    value={checkinWindow}
                    onChange={(e) => setCheckinWindow(Number(e.target.value))}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Services will automatically lock attendance after this duration.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Member Care & Terminology */}
      {activeTab === "care" && (
        <div className="space-y-6">
          <div className="surface rounded-2xl border p-6 shadow-panel space-y-6">
            <h2 className="font-display text-base font-bold text-foreground flex items-center gap-2">
              <HeartHandshake className="size-4 text-primary" /> Pastoral Care & Group Wording
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cvocab" className="text-xs font-semibold">
                  Hierarchy / Group Terminology
                </Label>
                <Input
                  id="cvocab"
                  value={vocab}
                  onChange={(e) => setVocab(e.target.value)}
                  placeholder="e.g. Cell, Fellowship, Zone, Department, Lifegroup"
                />
                <p className="text-[11px] text-muted-foreground">
                  Changes how groups are named throughout your dashboard and reports.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cabsent" className="text-xs font-semibold">
                  Absence Alert Threshold (Consecutive Missed Sundays)
                </Label>
                <Input
                  id="cabsent"
                  type="number"
                  min={1}
                  max={12}
                  value={absence}
                  onChange={(e) => setAbsence(Number(e.target.value))}
                />
                <p className="text-[11px] text-muted-foreground">
                  Flags members as needing care when they miss this number of services in a row.
                </p>
              </div>
            </div>

            {/* Automated Messages Templates */}
            <div className="space-y-4 pt-3 border-t">
              <h3 className="text-xs font-bold text-foreground">Automated Follow-up Templates</h3>

              <div className="space-y-2 p-4 rounded-xl border bg-muted/20">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">
                    First-Timer Welcome Notification
                  </span>
                  <Switch checked={autoWelcome} onCheckedChange={setAutoWelcome} />
                </div>
                {autoWelcome && (
                  <Textarea
                    value={autoWelcomeMsg}
                    onChange={(e) => setAutoWelcomeMsg(e.target.value)}
                    placeholder="Enter welcome message template..."
                    rows={3}
                    className="text-xs rounded-xl"
                  />
                )}
              </div>

              <div className="space-y-2 p-4 rounded-xl border bg-muted/20">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">
                    Absent Member Care Notification
                  </span>
                  <Switch checked={autoAbsent} onCheckedChange={setAutoAbsent} />
                </div>
                {autoAbsent && (
                  <Textarea
                    value={autoAbsentMsg}
                    onChange={(e) => setAutoAbsentMsg(e.target.value)}
                    placeholder="Enter care message template..."
                    rows={3}
                    className="text-xs rounded-xl"
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: Messaging & Alerts */}
      {activeTab === "messaging" && (
        <div className="space-y-6">
          <div className="surface rounded-2xl border p-6 shadow-panel space-y-6">
            <h2 className="font-display text-base font-bold text-foreground flex items-center gap-2">
              <Mail className="size-4 text-primary" /> Outbound Communication Settings
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="creply" className="text-xs font-semibold">
                  Reply-To Email Address
                </Label>
                <Input
                  id="creply"
                  type="email"
                  value={replyTo}
                  onChange={(e) => setReplyTo(e.target.value)}
                  placeholder="e.g. pastor@church.org"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="csender" className="text-xs font-semibold">
                  Alphanumeric SMS Sender ID (Up to 11 chars)
                </Label>
                <Input
                  id="csender"
                  value={smsSender}
                  onChange={(e) => setSmsSender(e.target.value.toUpperCase())}
                  placeholder="e.g. GRACECHURCH"
                  maxLength={11}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cqstart" className="text-xs font-semibold">
                  Quiet Hours Start (24-hour hour, e.g. 21 for 9 PM)
                </Label>
                <Input
                  id="cqstart"
                  type="number"
                  min={0}
                  max={23}
                  value={quietStart}
                  onChange={(e) => setQuietStart(Number(e.target.value))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cqend" className="text-xs font-semibold">
                  Quiet Hours End (24-hour hour, e.g. 7 for 7 AM)
                </Label>
                <Input
                  id="cqend"
                  type="number"
                  min={0}
                  max={23}
                  value={quietEnd}
                  onChange={(e) => setQuietEnd(Number(e.target.value))}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: Security & Access Controls */}
      {activeTab === "security" && (
        <div className="space-y-6">
          <div className="surface rounded-2xl border p-6 shadow-panel space-y-6">
            <h2 className="font-display text-base font-bold text-foreground flex items-center gap-2">
              <Shield className="size-4 text-primary" /> Workspace Security & Two-Factor Auth
            </h2>

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4 p-4 rounded-xl border bg-muted/20">
                <div>
                  <p className="text-xs font-bold text-foreground">
                    Enforce Two-Factor Authentication (2FA) for All Staff
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Requires every church administrator and leader to verify a 6-digit authenticator
                    code on sign-in.
                  </p>
                </div>
                <Switch checked={requireMfa} onCheckedChange={setRequireMfa} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2 pt-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ctimeout" className="text-xs font-semibold">
                    Inactivity Session Timeout
                  </Label>
                  <select
                    id="ctimeout"
                    className="h-10 w-full rounded-xl border border-input bg-background px-3 text-xs font-medium"
                    value={sessionTimeout}
                    onChange={(e) => setSessionTimeout(Number(e.target.value))}
                  >
                    <option value={15}>15 Minutes</option>
                    <option value={30}>30 Minutes</option>
                    <option value={60}>1 Hour (Recommended)</option>
                    <option value={240}>4 Hours</option>
                    <option value={480}>8 Hours</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* 2FA Setup Component for current user */}
          <TwoStepSettings tenantId={tenant?.id ?? ""} isOwner={isOwner} requireMfa={requireMfa} />
        </div>
      )}

      {/* TAB 7: Data Hub & Danger Zone */}
      {activeTab === "danger" && (
        <div className="space-y-6">
          {/* Data Export Card */}
          <ExportChurchData tenantId={tenant?.id ?? ""} subdomain={tenant?.subdomain ?? ""} />

          {/* Re-verify Default Services */}
          <div className="surface rounded-2xl border p-6 shadow-panel space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <RefreshCw className="size-4 text-primary" /> Verify Weekly Default Services
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Restores or checks that Sunday Service, Midweek Service, and Prayer Service
                  templates exist and are open.
                </p>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="text-xs font-semibold shrink-0"
                onClick={() => resetDefaults.mutate()}
                disabled={resetDefaults.isPending}
              >
                {resetDefaults.isPending ? "Verifying…" : "Verify Services"}
              </Button>
            </div>
          </div>

          {/* Danger Zone: Clear Test Attendance Records (Owner Only) */}
          <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 shadow-panel space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-5 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-destructive">
                  Reset / Clear Test Attendance Records (Owner Only)
                </h3>
                <p className="text-xs text-muted-foreground">
                  Wipes only the attendance check-in entries for this church.
                  <strong className="text-foreground">
                    {" "}
                    All members, branches, groups, services, and accounts are 100% PRESERVED.
                  </strong>
                </p>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <Button
                variant="destructive"
                size="sm"
                className="font-semibold text-xs"
                disabled={!isOwner}
                onClick={() => {
                  setConfirmClearInput("");
                  setClearAttendanceModal(true);
                }}
              >
                <Trash2 className="size-3.5 mr-1.5" /> Clear Test Attendance Records
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog for Clearing Attendance */}
      <Dialog open={clearAttendanceModal} onOpenChange={setClearAttendanceModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-5" />
              Clear Attendance Records?
            </DialogTitle>
            <DialogDescription className="space-y-2 pt-2">
              <p>
                This action will delete all recorded attendance logs for this church. It is
                typically used after initial staff training or testing.
              </p>
              <p className="font-semibold text-foreground">
                Your member database and service programs will NOT be deleted.
              </p>
              <p className="text-xs">
                To confirm, type{" "}
                <span className="font-mono font-bold text-destructive">CLEAR ATTENDANCE</span>{" "}
                below:
              </p>
            </DialogDescription>
          </DialogHeader>

          <Input
            value={confirmClearInput}
            onChange={(e) => setConfirmClearInput(e.target.value)}
            placeholder="CLEAR ATTENDANCE"
            className="font-mono text-xs"
          />

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setClearAttendanceModal(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={
                clearAttendance.isPending || confirmClearInput.toLowerCase() !== "clear attendance"
              }
              onClick={() => clearAttendance.mutate()}
            >
              {clearAttendance.isPending ? "Clearing…" : "Confirm Reset Attendance"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ChurchSettingsPage;
