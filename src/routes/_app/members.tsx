import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { BellOff, BellRing, Download, Lock, QrCode, Search, Trash2, Upload, UserPlus } from "lucide-react";
import { labelledQr } from "@/lib/qr";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/members")({
  head: () => ({
    meta: [
      { title: "Members — Mene:Log" },
      { name: "description", content: "Your church member registry: add, import, issue QR codes and export." },
      { property: "og:title", content: "Members — Mene:Log" },
      { property: "og:description", content: "Manage your church member registry." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Members,
});

type MemberRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  date_of_birth: string | null;
  gender: "male" | "female" | "other" | null;
  residential_area: string | null;
  marital_status: string | null;
  occupation: string | null;
  status: "first_timer" | "active" | "archived" | "anonymised";
  is_minor: boolean;
  position_id: string | null;
  messaging_opt_out: boolean;
};

function Members() {
  const { tenant, membership, isAdmin, canManageMembers, can } = useTenant();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [qr, setQr] = useState<{ id: string; name: string; dataUrl: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    date_of_birth: "",
    gender: "",
    residential_area: "",
    marital_status: "",
    occupation: "",
  });

  const { data: members, isLoading } = useQuery({
    queryKey: ["members", tenant?.id],
    enabled: !!tenant,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("members")
        .select(
          "id, full_name, phone, email, date_of_birth, gender, residential_area, marital_status, occupation, status, is_minor, position_id, messaging_opt_out",
        )
        .neq("status", "anonymised")
        .order("full_name")
        .limit(2000);
      if (error) throw error;
      return data as MemberRow[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members ?? [];
    return (members ?? []).filter(
      (m) =>
        m.full_name.toLowerCase().includes(q) ||
        (m.phone ?? "").includes(q) ||
        (m.residential_area ?? "").toLowerCase().includes(q) ||
        (m.occupation ?? "").toLowerCase().includes(q),
    );
  }, [members, search]);

  const addMember = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("create_member", {
        p_tenant: tenant!.id, p_branch: membership?.branch_id as string,
        p_full_name: form.full_name.trim(), p_phone: form.phone.trim(), p_email: form.email.trim(),
        p_dob: form.date_of_birth as string, p_gender: form.gender as "male" | "female" | "other",
        p_marital_status: form.marital_status, p_area: form.residential_area.trim(), p_occupation: form.occupation.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Member added");
      setAddOpen(false);
      setForm({ full_name: "", phone: "", email: "", date_of_birth: "", gender: "", residential_area: "", marital_status: "", occupation: "" });
      qc.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add member"),
  });

  const issueQr = useMutation({
    mutationFn: async (member: MemberRow) => {
      const { data, error } = await supabase.rpc("get_member_qr", { p_member: member.id });
      if (error) throw error;
      const r = data as unknown as { token: string; kind: string };
      const dataUrl = await labelledQr(r.token, tenant?.name ?? "", member.full_name, r.kind === "leader" ? "Leader" : "Member");
      return { id: member.id, name: member.full_name, dataUrl, token: r.token };
    },
    onSuccess: (res) => setQr(res),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not open this code"),
  });

  const resetQr = useMutation({
    mutationFn: async () => {
      if (!qr) return null;
      const { data, error } = await supabase.rpc("issue_qr_token", { p_member: qr.id });
      if (error) throw error;
      return { ...qr, token: String(data), dataUrl: await labelledQr(String(data), tenant?.name ?? "", qr.name) };
    },
    onSuccess: (res) => { if (res) { setQr(res); toast.success("New code issued — the old one no longer works"); } },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not reset"),
  });

  const [zipBusy, setZipBusy] = useState(false);
  async function downloadAllQrs() {
    if (!tenant) return;
    setZipBusy(true);
    try {
      const { data, error } = await supabase.rpc("get_all_member_qrs", { p_tenant: tenant.id });
      if (error) throw error;
      const rows = data as unknown as Array<{ id: string; full_name: string; kind: string; token: string }>;
      const { zipSync } = await import("fflate");
      const files: Record<string, Uint8Array> = {};
      const used = new Set<string>();
      for (const r of rows) {
        const url = await labelledQr(r.token, tenant.name, r.full_name, r.kind === "leader" ? "Leader" : "Member");
        let name = r.full_name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "member";
        if (used.has(name)) name = `${name}-${r.id.slice(0, 6)}`;
        used.add(name);
        files[`${name}.png`] = Uint8Array.from(atob(url.split(",")[1] ?? ""), (c) => c.charCodeAt(0));
      }
      const blob = new Blob([zipSync(files, { level: 0 })], { type: "application/zip" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${tenant.subdomain}-qr-codes.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success(`${rows.length} QR codes downloaded`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not download codes");
    } finally {
      setZipBusy(false);
    }
  }

  const toggleMessaging = useMutation({
    mutationFn: async (member: MemberRow) => {
      const { error } = await supabase.rpc("set_member_messaging", {
        p_member: member.id,
        p_opt_out: !member.messaging_opt_out,
      });
      if (error) throw error;
      return !member.messaging_opt_out;
    },
    onSuccess: (optedOut) => {
      toast.success(optedOut ? "This member will not be messaged" : "Messaging turned back on");
      qc.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update"),
  });

  const anonymise = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("anonymise_member", { p_member: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Member anonymised");
      qc.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not anonymise"),
  });

  const importRows = useMutation({
    mutationFn: async (file: File) => {
      const { default: Papa } = await import("papaparse");
      const parsed = Papa.parse<Record<string, unknown>>(await file.text(), {
        header: true,
        skipEmptyLines: true,
      });
      if (parsed.errors.length) throw new Error(`Could not read CSV row ${parsed.errors[0]?.row ?? 1}.`);
      const rows = parsed.data;

      const pick = (row: Record<string, unknown>, keys: string[]) => {
        for (const key of Object.keys(row)) {
          if (keys.includes(key.trim().toLowerCase())) {
            const value = String(row[key] ?? "").trim();
            if (value) return value;
          }
        }
        return "";
      };

      const payload = rows
        .map((row) => ({
          full_name: pick(row, ["name", "full name", "fullname", "member name"]),
          phone: pick(row, ["phone", "phone number", "contact", "mobile"]),
          email: pick(row, ["email", "e-mail"]),
          date_of_birth: pick(row, ["date of birth", "dob", "birthday"]),
          gender: pick(row, ["gender", "sex"]),
          residential_area: pick(row, ["area", "residential area", "location", "address"]),
          marital_status: pick(row, ["marital status", "marital", "status of marriage"]),
          occupation: pick(row, ["occupation", "job", "profession"]),
        }))
        .filter((r) => r.full_name.length > 1);

      if (payload.length === 0) throw new Error("No rows with a name column were found");

      // Imports go through a protected database function that validates every
      // row, matches duplicates by phone and respects the package member limit.
      const { data, error } = await supabase.rpc("import_members_batch", {
        p_tenant: tenant!.id,
        p_branch: membership?.branch_id as string,
        p_filename: file.name,
        p_rows: payload,
      });
      if (error) throw error;
      return data as unknown as { inserted: number; skipped: number };
    },
    onSuccess: (result) => {
      toast.success(
        `${result.inserted} members added${result.skipped ? `, ${result.skipped} skipped` : ""}`,
      );
      qc.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Import failed"),
  });

  async function exportCsv() {
    const rows = filtered.map((m) => [
      m.full_name,
      m.is_minor && !isAdmin ? "" : (m.phone ?? ""),
      m.is_minor && !isAdmin ? "" : (m.email ?? ""),
      m.date_of_birth ?? "",
      m.gender ?? "",
      m.residential_area ?? "",
      m.occupation ?? "",
      m.marital_status ?? "",
      m.status,
    ]);
    const csv = [
      ["Name", "Phone", "Email", "Date of birth", "Gender", "Area", "Occupation", "Marital status", "Status"],
      ...rows,
    ]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tenant?.subdomain ?? "members"}-registry.csv`;
    a.click();
    URL.revokeObjectURL(url);
    await supabase.rpc("log_member_export", { p_tenant: tenant!.id, p_count: rows.length });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-eyebrow">Registry</p>
          <h1 className="mt-2 text-2xl font-bold">Members</h1>
          <p className="text-sm text-muted-foreground">{members?.length ?? 0} records</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void exportCsv()}>
            <Download className="size-4" /> Export CSV
          </Button>
          {isAdmin && (
            <Button variant="outline" disabled={zipBusy} onClick={() => void downloadAllQrs()}>
              <QrCode className="size-4" /> {zipBusy ? "Preparing…" : "All QR codes (ZIP)"}
            </Button>
          )}
          {canManageMembers && (
            <>
              {can("import") ? (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) importRows.mutate(file);
                      e.target.value = "";
                    }}
                  />
                  <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importRows.isPending}>
                    <Upload className="size-4" /> Import CSV
                  </Button>
                </>
              ) : (
                <Button variant="outline" asChild>
                  <Link to="/billing">
                    <Lock className="size-4" /> Import CSV — upgrade
                  </Link>
                </Button>
              )}
              <Button onClick={() => setAddOpen(true)}>
                <UserPlus className="size-4" /> Add member
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by name, phone, area or occupation"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="surface overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border">
            <tr className="text-left">
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Phone</th>
              <th className="px-4 py-3 font-semibold">Area</th>
              <th className="px-4 py-3 font-semibold">Occupation</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <tr key={m.id} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-3 font-medium">
                  {m.full_name}
                  {m.is_minor && (
                    <Badge variant="outline" className="ml-2 text-xs">
                      Minor
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {m.is_minor && !isAdmin ? "Hidden" : (m.phone ?? "—")}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{m.residential_area ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{m.occupation ?? "—"}</td>
                <td className="px-4 py-3">
                  <Badge variant={m.status === "first_timer" ? "default" : "secondary"}>
                    {m.status.replace("_", " ")}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    {canManageMembers && (
                      <Button size="sm" variant="ghost" onClick={() => issueQr.mutate(m)}>
                        <QrCode className="size-4" />
                      </Button>
                    )}
                    {isAdmin && (
                      <Button
                        size="sm"
                        variant="ghost"
                        title={
                          m.messaging_opt_out
                            ? "Allow messages to this member"
                            : "Stop messaging this member"
                        }
                        onClick={() => toggleMessaging.mutate(m)}
                      >
                        {m.messaging_opt_out ? (
                          <BellOff className="size-4 text-muted-foreground" />
                        ) : (
                          <BellRing className="size-4" />
                        )}
                      </Button>
                    )}
                    {isAdmin && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Anonymise ${m.full_name}? Attendance totals are kept.`))
                            anonymise.mutate(m.id);
                        }}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  No members yet. Import your spreadsheet or add someone.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a member</DialogTitle>
            <DialogDescription>Only fields with a pastoral purpose are collected.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              addMember.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="mn">Full name</Label>
              <Input
                id="mn"
                required
                minLength={2}
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </div>
            <div className="space-y-2"><Label htmlFor="me">Email</Label><Input id="me" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="mp">Phone</Label>
                <Input
                  id="mp"
                  required
                  inputMode="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="md">Date of birth</Label>
                <Input
                  id="md"
                  type="date"
                  required
                  max={new Date().toISOString().slice(0, 10)}
                  value={form.date_of_birth}
                  onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="mm">Marital status</Label><select id="mm" required className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.marital_status} onChange={(e) => setForm({ ...form, marital_status: e.target.value })}><option value="">Select status</option><option value="single">Single</option><option value="married">Married</option><option value="divorced">Divorced</option><option value="widowed">Widowed</option><option value="separated">Separated</option><option value="prefer_not_to_say">Prefer not to say</option></select></div>
              <div className="space-y-2"><Label htmlFor="mo">Occupation</Label><Input id="mo" required maxLength={120} value={form.occupation} onChange={(e) => setForm({ ...form, occupation: e.target.value })} /></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="mg">Gender</Label>
                <select
                  id="mg"
                  required
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.gender}
                  onChange={(e) => setForm({ ...form, gender: e.target.value })}
                >
                  <option value="">Select gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ma">Residential area</Label>
                <Input
                  id="ma"
                  required
                  maxLength={120}
                  value={form.residential_area}
                  onChange={(e) => setForm({ ...form, residential_area: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={addMember.isPending}>
                Add member
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!qr} onOpenChange={(open) => !open && setQr(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{qr?.name}</DialogTitle>
            <DialogDescription>
              This is the member's current code. Download it and send it to them.
            </DialogDescription>
          </DialogHeader>
          {qr && <img src={qr.dataUrl} alt="Member QR code" className="mx-auto rounded-md" />}
          {qr?.token && <div className="text-center"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Member code (for Watch Live)</p><p className="select-all break-all font-mono text-xs">{qr.token}</p></div>}
          <DialogFooter>
            <Button asChild variant="outline">
              <a href={qr?.dataUrl} download={`${qr?.name}-qr.png`}>
                Download
              </a>
            </Button>
            <Button variant="ghost" disabled={resetQr.isPending} onClick={() => resetQr.mutate()}>
              Issue new code
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
