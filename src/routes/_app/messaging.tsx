import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Mail, MessageSquare, Send, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { UpgradePanel } from "@/components/FeatureGate";
import { flushMessageQueue, getMessagingStatus, sendBroadcast } from "@/lib/messaging.functions";

export const Route = createFileRoute("/_app/messaging")({
  head: () => ({
    meta: [
      { title: "Messaging — Mene:Log" },
      {
        name: "description",
        content: "Send branded emails and text messages to your members, and see every delivery.",
      },
      { property: "og:title", content: "Messaging — Mene:Log" },
      { property: "og:description", content: "Reach your members by email and text message." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Messaging,
});

type AudienceKind = "all" | "branch" | "group" | "first_timers" | "absent" | "birthdays_month";

const STATUS_TONE: Record<string, string> = {
  sent: "text-emerald-600",
  queued: "text-muted-foreground",
  sending: "text-muted-foreground",
  failed: "text-destructive",
  skipped: "text-muted-foreground",
};

function Messaging() {
  const ctx = useTenant();
  const { tenant, isAdmin } = ctx;
  const qc = useQueryClient();

  const [channel, setChannel] = useState<"email" | "sms">("email");
  const [kind, setKind] = useState<AudienceKind>("all");
  const [ref, setRef] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState<number | null>(null);

  const status = useServerFn(getMessagingStatus);
  const broadcast = useServerFn(sendBroadcast);
  const flush = useServerFn(flushMessageQueue);

  const { data: providers } = useQuery({
    queryKey: ["messaging-status"],
    queryFn: () => status(),
  });

  const { data: usage } = useQuery({
    queryKey: ["tenant-usage", tenant?.id],
    enabled: !!tenant,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("tenant_usage", { p_tenant: tenant!.id });
      if (error) throw error;
      return data as unknown as { messages_today: number; messages_month: number };
    },
  });

  const { data: groups } = useQuery({
    queryKey: ["audience-groups", tenant?.id],
    enabled: !!tenant && ctx.can("groups"),
    queryFn: async () => {
      const { data, error } = await supabase.from("positions").select("id, group_name").limit(200);
      if (error) throw error;
      return data;
    },
  });

  const { data: branches } = useQuery({
    queryKey: ["audience-branches", tenant?.id],
    enabled: !!tenant && ctx.can("branches"),
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("id, name").limit(200);
      if (error) throw error;
      return data;
    },
  });

  const { data: history } = useQuery({
    queryKey: ["message-history", tenant?.id],
    enabled: !!tenant,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, channel, recipient, subject, trigger, status, error, created_at")
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      return data;
    },
  });

  const send = useMutation({
    mutationFn: async (dryRun: boolean) => {
      const result = await broadcast({
        data: {
          tenant_id: tenant!.id,
          channel,
          subject,
          body,
          audience_kind: kind,
          audience_ref: kind === "branch" || kind === "group" ? ref || null : null,
          dry_run: dryRun,
        },
      });
      if (!result.ok) throw new Error(result.message);
      if (!dryRun) await flush({ data: { tenant_id: tenant!.id } });
      return result;
    },
    onSuccess: (result) => {
      if (result.dry_run) {
        setPreview(result.recipients);
        toast.success(`${result.recipients} people would receive this`);
      } else {
        setPreview(null);
        setBody("");
        setSubject("");
        toast.success(`Sending to ${result.queued} people`);
        qc.invalidateQueries({ queryKey: ["message-history"] });
        qc.invalidateQueries({ queryKey: ["tenant-usage"] });
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not send"),
  });

  if (!ctx.isLoading && !ctx.can("broadcasts")) {
    return <UpgradePanel feature="broadcasts" canUpgrade={ctx.isOwner} />;
  }
  if (!isAdmin) {
    return (
      <p className="surface p-6 text-center text-sm text-muted-foreground">
        Only church administrators can send messages.
      </p>
    );
  }

  const channelReady = channel === "email" ? providers?.email : providers?.sms;
  const smsAvailable = ctx.can("sms");

  return (
    <div className="space-y-6">
      <div>
        <p className="text-eyebrow">Outreach</p>
        <h1 className="mt-2 text-2xl font-bold">Messaging</h1>
        <p className="text-sm text-muted-foreground">
          Reach members by email{smsAvailable ? " or text message" : ""}. Every send is recorded,
          and anyone who has opted out is skipped automatically.
        </p>
      </div>

      {providers && !channelReady && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            {channel === "email"
              ? "Email sending is not switched on yet. Once the email credentials are saved, everything here starts working — you can still preview who would receive a message."
              : "Text messaging is not switched on yet. Once the text credentials are saved, sending starts working immediately."}
          </p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <form
          data-tour="page-messaging-form"
          className="surface space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            send.mutate(false);
          }}
        >
          <div className="flex gap-2">
            <Button
              type="button"
              variant={channel === "email" ? "default" : "outline"}
              size="sm"
              onClick={() => setChannel("email")}
            >
              <Mail className="size-4" /> Email
            </Button>
            <Button
              type="button"
              variant={channel === "sms" ? "default" : "outline"}
              size="sm"
              disabled={!smsAvailable}
              title={smsAvailable ? undefined : "Upgrade to have access to text messages"}
              onClick={() => setChannel("sms")}
            >
              <MessageSquare className="size-4" /> Text message
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="aud">Who receives it</Label>
              <select
                id="aud"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value as AudienceKind);
                  setRef("");
                  setPreview(null);
                }}
              >
                <option value="all">Everyone</option>
                <option value="first_timers">First-timers</option>
                <option value="absent">Members we have not seen lately</option>
                <option value="birthdays_month">Birthdays this month</option>
                {ctx.can("groups") && <option value="group">A specific group</option>}
                {ctx.can("branches") && <option value="branch">A specific branch</option>}
              </select>
            </div>

            {(kind === "group" || kind === "branch") && (
              <div className="space-y-2">
                <Label htmlFor="ref">{kind === "group" ? "Group" : "Branch"}</Label>
                <select
                  id="ref"
                  required
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={ref}
                  onChange={(e) => {
                    setRef(e.target.value);
                    setPreview(null);
                  }}
                >
                  <option value="">Choose one</option>
                  {kind === "group"
                    ? (groups ?? []).map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.group_name}
                        </option>
                      ))
                    : (branches ?? []).map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                </select>
              </div>
            )}
          </div>

          {channel === "email" && (
            <div className="space-y-2">
              <Label htmlFor="subj">Subject</Label>
              <Input
                id="subj"
                required
                maxLength={200}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="You are invited this Sunday"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="msg">Message</Label>
            <Textarea
              id="msg"
              required
              rows={channel === "sms" ? 4 : 8}
              maxLength={channel === "sms" ? 480 : 1200}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                setPreview(null);
              }}
              placeholder={"Hello {{name}}, we would love to see you this Sunday at 9am."}
            />
            <p className="text-xs text-muted-foreground">
              Use <code>{"{{name}}"}</code> to greet each person by their first name. {body.length}/
              {channel === "sms" ? 480 : 1200} characters.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={send.isPending || body.trim().length < 2}
              onClick={() => send.mutate(true)}
            >
              <Users className="size-4" /> Check who receives it
            </Button>
            <Button type="submit" disabled={send.isPending || !channelReady}>
              <Send className="size-4" /> Send now
            </Button>
            {preview !== null && (
              <span className="text-sm font-semibold">{preview} recipients</span>
            )}
          </div>
        </form>

        <div className="space-y-4">
          <div className="surface p-5">
            <h2 className="text-base font-semibold">Today's sending</h2>
            <p className="mt-1 text-3xl font-bold">
              {usage?.messages_today ?? 0}
              <span className="text-sm font-medium text-muted-foreground">
                {" "}
                / {ctx.limit("daily_messages")}
              </span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {usage?.messages_month ?? 0} sent this month.
            </p>
          </div>

          <div className="surface p-5">
            <h2 className="text-base font-semibold">Automatic messages</h2>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>Welcome message with a QR code after a first check-in</li>
              <li>Birthday wishes on the day</li>
              <li>
                A gentle note to anyone we have not seen for {tenant?.absence_threshold ?? 3} weeks
              </li>
            </ul>
            {!ctx.can("automations") && (
              <p className="mt-3 text-xs font-semibold text-muted-foreground">
                Automatic messaging is locked. Upgrade to have access to this feature.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-base font-semibold">Recent messages</h2>
        </div>
        <div className="divide-y divide-border">
          {(history ?? []).map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{m.subject ?? m.recipient}</p>
                <p className="text-xs text-muted-foreground">
                  {m.channel === "email" ? "Email" : "Text"} · {m.recipient} ·{" "}
                  {new Date(m.created_at).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize">
                  {m.trigger}
                </Badge>
                <span className={`text-xs font-semibold capitalize ${STATUS_TONE[m.status] ?? ""}`}>
                  {m.status}
                </span>
              </div>
            </div>
          ))}
          {(history ?? []).length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Nothing sent yet. Your first message will appear here.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
