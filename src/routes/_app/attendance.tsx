import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckSquare, Lock, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_app/attendance")({
  head: () => ({
    meta: [
      { title: "Attendance register — Mene:Log" },
      { name: "description", content: "Tick members present for a service." },
      { property: "og:title", content: "Attendance register — Mene:Log" },
      { property: "og:description", content: "Tick members present for a service." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AttendanceRegister,
});

type Register = {
  service: { id: string; name: string; date: string; is_open: boolean };
  writable: boolean;
  present_count: number;
  members: Array<{
    id: string;
    full_name: string;
    status: string;
    present: boolean;
    method: string | null;
  }>;
};

function AttendanceRegister() {
  const { tenant, canManageMembers } = useTenant();
  const qc = useQueryClient();
  const [serviceId, setServiceId] = useState<string>("");
  const [search, setSearch] = useState("");

  const services = useQuery({
    queryKey: ["register-services", tenant?.id],
    enabled: !!tenant,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id, name, service_date, is_open")
        .eq("tenant_id", tenant!.id)
        .order("service_date", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data;
    },
  });
  const activeId = serviceId || services.data?.[0]?.id || "";

  const register = useQuery({
    queryKey: ["register", activeId, search],
    enabled: !!activeId,
    queryFn: async () => {
      const q = search.trim();
      const { data, error } = await supabase.rpc(
        "attendance_register",
        q ? { p_service: activeId, p_search: q } : { p_service: activeId },
      );
      if (error) throw error;
      return data as unknown as Register;
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ ids, present }: { ids: string[]; present: boolean }) => {
      const { error } = await supabase.rpc("set_manual_attendance", {
        p_service: activeId,
        p_members: ids,
        p_present: present,
      });
      if (error) throw error;
    },
    onMutate: async ({ ids, present }) => {
      const key = ["register", activeId, search];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Register>(key);
      if (prev) {
        const set = new Set(ids);
        qc.setQueryData<Register>(key, {
          ...prev,
          members: prev.members.map((m) => (set.has(m.id) ? { ...m, present } : m)),
        });
      }
      return { prev, key };
    },
    onError: (e, _v, c) => {
      if (c?.prev) qc.setQueryData(c.key, c.prev);
      toast.error(e instanceof Error ? e.message : "Could not save");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["register", activeId] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const members = register.data?.members ?? [];
  const presentShown = useMemo(() => members.filter((m) => m.present).length, [members]);
  const writable = register.data?.writable ?? false;

  if (!canManageMembers)
    return (
      <p className="text-sm text-muted-foreground">
        Only church administrators can use the register.
      </p>
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-eyebrow">Workspace</p>
          <h1 className="mt-2 text-2xl font-bold">Attendance register</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tick the members who were present. Every tick saves straight away.
          </p>
        </div>
        {register.data && (
          <p className="text-sm font-semibold">{register.data.present_count} present</p>
        )}
      </div>

      {services.data?.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm">
          Create a service first.{" "}
          <Link to="/services" className="font-semibold text-primary">
            Go to Services
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Select value={activeId} onValueChange={setServiceId}>
            <SelectTrigger aria-label="Service">
              <SelectValue placeholder="Choose a service" />
            </SelectTrigger>
            <SelectContent>
              {services.data?.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} — {s.service_date}
                  {s.is_open ? "" : " (closed)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search members"
              maxLength={80}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            disabled={!writable || toggle.isPending || members.every((m) => m.present)}
            onClick={() =>
              toggle.mutate({
                ids: members.filter((m) => !m.present).map((m) => m.id),
                present: true,
              })
            }
          >
            <CheckSquare className="size-4" /> Mark all shown
          </Button>
        </div>
      )}

      {register.data && !writable && (
        <p className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <Lock className="size-4" /> This service is closed or the account is inactive, so the
          register is read-only.
        </p>
      )}

      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-2 text-xs text-muted-foreground">
          <span>
            {members.length} shown{members.length === 500 ? " (search to narrow)" : ""}
          </span>
          <span>{presentShown} ticked</span>
        </div>
        {register.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading members…</p>
        ) : members.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No members match.</p>
        ) : (
          <ul className="divide-y">
            {members.map((m) => (
              <li key={m.id}>
                <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-muted/40">
                  <Checkbox
                    checked={m.present}
                    disabled={!writable}
                    onCheckedChange={(v) => toggle.mutate({ ids: [m.id], present: v === true })}
                    aria-label={`Mark ${m.full_name} present`}
                  />
                  <span className="flex-1 text-sm font-medium">{m.full_name}</span>
                  {m.status === "first_timer" && (
                    <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
                      First-timer
                    </span>
                  )}
                  {m.present && m.method && m.method !== "manual" && (
                    <span className="text-[11px] text-muted-foreground">
                      {m.method.replace("_", " ")}
                    </span>
                  )}
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
