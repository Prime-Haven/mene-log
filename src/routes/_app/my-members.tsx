import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Cake,
  Download,
  MessageCircle,
  Phone,
  QrCode,
  Search,
  UserMinus,
  UserPlus,
  Users,
  CalendarCheck,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { labelledQr } from "@/lib/qr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_app/my-members")({
  head: () => ({
    meta: [
      { title: "My members — Mene:Log" },
      {
        name: "description",
        content: "Your leader dashboard: your members, first-timers, absentees and demographics.",
      },
      { property: "og:title", content: "My members — Mene:Log" },
      { property: "og:description", content: "Leader dashboard for your members." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MyMembers,
});

type Person = { id: string; full_name: string; phone: string | null };
type Dash = {
  ok: boolean;
  church?: string;
  full_name?: string;
  absence_threshold: number;
  sundays_counted: number;
  stats: {
    members: number;
    first_timers_month: number;
    present_last_sunday: number;
    absent: number;
  };
  members: Array<
    Person & {
      email: string | null;
      status: string;
      joined_on: string;
      last_seen: string | null;
      residential_area: string | null;
    }
  >;
  first_timers: Array<Person & { joined_on: string; followup_status: string | null }>;
  absentees: Array<
    Person & {
      last_seen: string | null;
      last_outcome: string | null;
      last_note: string | null;
      last_contact: string | null;
    }
  >;
  demographics: Record<
    "gender" | "marital" | "age" | "location" | "occupation",
    Record<string, number>
  >;
  birthdays: Array<Person & { date_of_birth: string }>;
  my_streak: number;
};

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "never";
const wa = (phone: string) => `https://wa.me/${phone.replace(/\D/g, "").replace(/^0/, "233")}`;

function MyMembers() {
  const { tenant } = useTenant();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"members" | "first" | "absent" | "demo">("members");
  const [logFor, setLogFor] = useState<Person | null>(null);
  const [outcome, setOutcome] = useState("called");
  const [note, setNote] = useState("");
  const [myQr, setMyQr] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["leader-dashboard"],
    queryFn: async () => {
      const { data: r, error } = await supabase.rpc("leader_dashboard");
      if (error) throw error;
      return r as unknown as Dash;
    },
  });

  const log = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("leader_log_contact", {
        p_member: logFor!.id,
        p_outcome: outcome,
        p_note: note.slice(0, 500),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contact saved");
      setLogFor(null);
      setNote("");
      qc.invalidateQueries({ queryKey: ["leader-dashboard"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });

  const openQr = useMutation({
    mutationFn: async () => {
      const { data: r, error } = await supabase.rpc("leader_my_qr");
      if (error) throw error;
      const q = r as unknown as { token: string; full_name: string };
      return labelledQr(q.token, tenant?.name ?? data?.church ?? "", q.full_name, "Leader");
    },
    onSuccess: setMyQr,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not load your code"),
  });

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.members ?? []).filter(
      (m) => !q || m.full_name.toLowerCase().includes(q) || (m.phone ?? "").includes(q),
    );
  }, [data, search]);

  if (isLoading)
    return <p className="p-8 text-center text-sm text-muted-foreground">Loading your members…</p>;
  if (!data?.ok)
    return (
      <p className="surface p-8 text-center text-sm text-muted-foreground">
        This page is for registered leaders on the Standard or Premium package.
      </p>
    );

  const stats = [
    { label: "My members", value: data.stats.members, icon: Users },
    { label: "First-timers this month", value: data.stats.first_timers_month, icon: UserPlus },
    { label: "Present last Sunday", value: data.stats.present_last_sunday, icon: CalendarCheck },
    {
      label: `Missed ${data.absence_threshold}+ Sundays`,
      value: data.stats.absent,
      icon: UserMinus,
    },
  ];

  const Contact = ({ p }: { p: Person }) =>
    p.phone ? (
      <span className="flex gap-1">
        <Button asChild size="icon" variant="ghost" className="size-8">
          <a href={`tel:${p.phone}`} aria-label={`Call ${p.full_name}`}>
            <Phone className="size-4" />
          </a>
        </Button>
        <Button asChild size="icon" variant="ghost" className="size-8">
          <a
            href={wa(p.phone)}
            target="_blank"
            rel="noreferrer"
            aria-label={`WhatsApp ${p.full_name}`}
          >
            <MessageCircle className="size-4" />
          </a>
        </Button>
      </span>
    ) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-eyebrow">{data.church}</p>
          <h1 className="mt-2 text-2xl font-bold">Welcome, {data.full_name?.split(" ")[0]}</h1>
          <p className="text-sm text-muted-foreground">
            Only the people who chose you or were assigned to you appear here. You've attended{" "}
            {data.my_streak} of the last 12 Sundays.
          </p>
        </div>
        <Button onClick={() => openQr.mutate()} disabled={openQr.isPending}>
          <QrCode className="size-4" /> My leader QR code
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              {label}
              <Icon className="size-4 text-primary" />
            </div>
            <p className="mt-2 font-display text-3xl font-bold">{value}</p>
          </div>
        ))}
      </div>

      {data.birthdays.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Cake className="size-4 text-primary" /> Birthdays in the next 30 days
          </h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {data.birthdays.map((b) => (
              <span key={b.id} className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">
                {b.full_name} · {fmt(b.date_of_birth)}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["members", "My members"],
            ["first", "First-timers"],
            ["absent", "Absentees"],
            ["demo", "Demographics"],
          ] as const
        ).map(([k, l]) => (
          <Button
            key={k}
            size="sm"
            variant={tab === k ? "default" : "outline"}
            onClick={() => setTab(k)}
          >
            {l}
          </Button>
        ))}
      </div>

      {tab === "members" && (
        <div className="rounded-lg border bg-card">
          <div className="relative border-b p-3">
            <Search className="absolute left-6 top-5.5 size-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by name or phone"
              maxLength={80}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {shown.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No one yet. Ask people to pick your name when they check in.
            </p>
          ) : (
            <ul className="divide-y">
              {shown.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{m.full_name}</p>
                    <p className="text-xs capitalize text-muted-foreground">
                      {m.status.replace("_", " ")}
                      {m.residential_area ? ` · ${m.residential_area}` : ""} · last seen{" "}
                      {fmt(m.last_seen)}
                    </p>
                  </div>
                  <Contact p={m} />
                  <Button size="sm" variant="outline" onClick={() => setLogFor(m)}>
                    Log contact
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "first" && (
        <div className="rounded-lg border bg-card">
          {data.first_timers.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No first-timers yet.</p>
          ) : (
            <ul className="divide-y">
              {data.first_timers.map((f) => (
                <li key={f.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <div className="flex-1">
                    <p className="font-semibold">{f.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      First came {fmt(f.joined_on)} · follow-up:{" "}
                      {f.followup_status?.replace("_", " ") ?? "not started"}
                    </p>
                  </div>
                  <Contact p={f} />
                  <Button size="sm" variant="outline" onClick={() => setLogFor(f)}>
                    Log contact
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "absent" && (
        <div className="rounded-lg border bg-card">
          {data.sundays_counted < data.absence_threshold ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Absentees appear once your church has held {data.absence_threshold} Sunday services.
            </p>
          ) : data.absentees.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Everyone has been in church recently. 🙌
            </p>
          ) : (
            <ul className="divide-y">
              {data.absentees.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{a.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      Last seen {fmt(a.last_seen)}
                      {a.last_outcome
                        ? ` · you ${a.last_outcome} on ${fmt(a.last_contact)}`
                        : " · not contacted yet"}
                    </p>
                    {a.last_note && (
                      <p className="text-xs text-muted-foreground">“{a.last_note}”</p>
                    )}
                  </div>
                  <Contact p={a} />
                  <Button size="sm" onClick={() => setLogFor(a)}>
                    Log contact
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "demo" && (
        <div className="grid gap-3 md:grid-cols-2">
          {(
            [
              ["gender", "Gender"],
              ["age", "Age"],
              ["marital", "Marital status"],
              ["location", "Where they live"],
              ["occupation", "Occupation"],
            ] as const
          ).map(([k, l]) => {
            const entries = Object.entries(data.demographics[k] ?? {}).sort((a, b) => b[1] - a[1]);
            const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
            return (
              <div key={k} className="rounded-lg border bg-card p-4">
                <h3 className="text-sm font-semibold">{l}</h3>
                {entries.length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">No data yet.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {entries.map(([name, v]) => (
                      <div key={name}>
                        <div className="flex justify-between text-xs capitalize">
                          <span>{name.replace(/_/g, " ")}</span>
                          <span className="text-muted-foreground">{v}</span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${(v / total) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!logFor} onOpenChange={(o) => !o && setLogFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log contact — {logFor?.full_name}</DialogTitle>
            <DialogDescription>
              Your church admin sees this on the Follow-ups page.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            {["called", "visited", "messaged", "unreachable", "other"].map((o) => (
              <Button
                key={o}
                size="sm"
                variant={outcome === o ? "default" : "outline"}
                className="capitalize"
                onClick={() => setOutcome(o)}
              >
                {o}
              </Button>
            ))}
          </div>
          <Textarea
            placeholder="Short note (optional)"
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <DialogFooter>
            <Button disabled={log.isPending} onClick={() => log.mutate()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!myQr} onOpenChange={(o) => !o && setMyQr(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>My leader QR code</DialogTitle>
            <DialogDescription>
              Show this at the door. Scans are recorded as leader attendance.
            </DialogDescription>
          </DialogHeader>
          {myQr && <img src={myQr} alt="Leader QR code" className="mx-auto w-64 rounded-md" />}
          <DialogFooter>
            <Button asChild>
              <a href={myQr ?? ""} download="my-leader-qr.png">
                <Download className="size-4" /> Download
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
