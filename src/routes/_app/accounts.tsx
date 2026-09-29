import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  UserPlus,
  Shield,
  ShieldAlert,
  Sparkles,
  Building2,
  UserCheck,
  CheckCircle2,
  UserX,
  Sliders,
  Settings,
  Lock,
  Trash2,
  KeyRound,
  Check,
  AlertTriangle,
  Star,
  Users,
  MessageSquare,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useTenant, type AppRole } from "@/hooks/useTenant";
import { inviteAccount, updateAccountPermissions, removeAccount } from "@/lib/accounts.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { planLabel } from "@/lib/pricing";

export const Route = createFileRoute("/_app/accounts")({
  head: () => ({
    meta: [
      { title: "Team & Staff Accounts — Mene:Log" },
      {
        name: "description",
        content:
          "Manage team seats, administrators, leaders and ushers with customizable permissions.",
      },
      { property: "og:title", content: "Team Accounts — Mene:Log" },
      {
        property: "og:description",
        content: "Manage staff roles and granular access for your church.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Accounts,
});

type StaffPermissions = {
  can_manage_members: boolean;
  can_manage_attendance: boolean;
  can_scan_qr: boolean;
  can_manage_services: boolean;
  can_manage_followups: boolean;
  can_view_reports: boolean;
  can_send_messages: boolean;
  can_manage_settings: boolean;
};

const DEFAULT_PERMISSIONS = {
  owner: {
    can_manage_members: true,
    can_manage_attendance: true,
    can_scan_qr: true,
    can_manage_services: true,
    can_manage_followups: true,
    can_view_reports: true,
    can_send_messages: true,
    can_manage_settings: true,
  },
  church_admin: {
    can_manage_members: true,
    can_manage_attendance: true,
    can_scan_qr: true,
    can_manage_services: true,
    can_manage_followups: true,
    can_view_reports: true,
    can_send_messages: true,
    can_manage_settings: false,
  },
  branch_admin: {
    can_manage_members: true,
    can_manage_attendance: true,
    can_scan_qr: true,
    can_manage_services: true,
    can_manage_followups: true,
    can_view_reports: true,
    can_send_messages: false,
    can_manage_settings: false,
  },
  leader: {
    can_manage_members: true,
    can_manage_attendance: true,
    can_scan_qr: true,
    can_manage_services: false,
    can_manage_followups: true,
    can_view_reports: false,
    can_send_messages: false,
    can_manage_settings: false,
  },
  usher: {
    can_manage_members: false,
    can_manage_attendance: true,
    can_scan_qr: true,
    can_manage_services: false,
    can_manage_followups: false,
    can_view_reports: false,
    can_send_messages: false,
    can_manage_settings: false,
  },
};

const roleOptions: Array<{ value: AppRole; label: string; desc: string; tiers: string[] }> = [
  {
    value: "church_admin",
    label: "Church Admin",
    desc: "Full administrative access with customizable feature controls",
    tiers: ["basic", "standard", "premium"],
  },
  {
    value: "branch_admin",
    label: "Branch Admin",
    desc: "Manage specific branch services and local attendance",
    tiers: ["premium"],
  },
  {
    value: "leader",
    label: "Cell / Group Leader",
    desc: "Assigned to pastoral groups, care follow-ups, and members",
    tiers: ["standard", "premium"],
  },
  {
    value: "usher",
    label: "Usher / Scanner",
    desc: "At-the-door QR scanning and manual check-in access",
    tiers: ["basic", "standard", "premium"],
  },
];

type AccountRow = {
  id: string;
  role: AppRole;
  status: "active" | "suspended";
  created_at: string;
  position_id: string | null;
  permissions?: Partial<StaffPermissions> | null;
  profiles: {
    full_name: string | null;
    email: string | null;
  } | null;
};

export function Accounts() {
  const { tenant, tier, isOwner, isAdmin, membership, limit } = useTenant();
  const qc = useQueryClient();
  const invite = useServerFn(inviteAccount);
  const updatePerms = useServerFn(updateAccountPermissions);
  const removeAcc = useServerFn(removeAccount);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("usher");
  const [positionId, setPositionId] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");

  // Invite permissions customizer
  const [customPermsOpen, setCustomPermsOpen] = useState(false);
  const [invitePerms, setInvitePerms] = useState<StaffPermissions>(() => DEFAULT_PERMISSIONS.usher);

  // Edit Permissions Dialog State
  const [editingAccount, setEditingAccount] = useState<AccountRow | null>(null);
  const [editRole, setEditRole] = useState<AppRole>("usher");
  const [editPerms, setEditPerms] = useState<StaffPermissions>(() => DEFAULT_PERMISSIONS.usher);

  // Remove Account Dialog State
  const [deleteAccountTarget, setDeleteAccountTarget] = useState<AccountRow | null>(null);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["accounts", tenant?.id],
    enabled: !!tenant,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_users")
        .select(
          "id, role, status, created_at, position_id, permissions, profiles:user_id(full_name, email)",
        )
        .eq("tenant_id", tenant!.id)
        .order("created_at");
      if (error) throw error;
      return (data as unknown as AccountRow[]) ?? [];
    },
  });

  const { data: positions } = useQuery({
    queryKey: ["positions", tenant?.id],
    enabled: !!tenant,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("positions")
        .select("id, group_name")
        .eq("tenant_id", tenant!.id)
        .order("group_name");
      if (error) throw error;
      return data;
    },
  });

  // Allowed roles for current tier
  const allowedRoles = roleOptions.filter((r) => r.tiers.includes(tier ?? "basic"));

  // Seat calculations
  const maxSeats = tier === "free" ? 1 : limit("staff_seats");
  const activeCount = accounts.filter((a) => a.status === "active").length;
  const isSeatLimitReached = activeCount >= maxSeats;

  // Send invitation
  const send = useMutation({
    mutationFn: async () => {
      if (isSeatLimitReached) {
        throw new Error(
          tier === "free"
            ? "Free plan is restricted to 1 account. Upgrade your account to invite team members."
            : `You have reached your limit of ${maxSeats} accounts. Upgrade your account to add more team members.`,
        );
      }
      const result = await invite({
        data: {
          tenant_id: tenant!.id,
          email: email.trim(),
          role,
          branch_id: membership?.branch_id ?? null,
          position_id: positionId || null,
          permissions: invitePerms,
        },
      });
      if (!result.ok) throw new Error(result.message);
      return result;
    },
    onSuccess: () => {
      toast.success("Invitation sent successfully with assigned permissions");
      setEmail("");
      setCustomPermsOpen(false);
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not invite account"),
  });

  // Toggle active / suspended
  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "active" | "suspended" }) => {
      const { error } = await supabase.from("tenant_users").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Account status updated");
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update account"),
  });

  // Save edited permissions
  const savePermissions = useMutation({
    mutationFn: async () => {
      if (!editingAccount || !tenant) return;
      const res = await updatePerms({
        data: {
          tenant_id: tenant.id,
          account_id: editingAccount.id,
          role: editRole,
          permissions: editPerms,
        },
      });
      if (!res.ok) throw new Error(res.message);
      return res;
    },
    onSuccess: () => {
      toast.success("Team member permissions updated");
      setEditingAccount(null);
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update permissions"),
  });

  // Remove account
  const deleteAccount = useMutation({
    mutationFn: async () => {
      if (!deleteAccountTarget || !tenant) return;
      const res = await removeAcc({
        data: {
          tenant_id: tenant.id,
          account_id: deleteAccountTarget.id,
        },
      });
      if (!res.ok) throw new Error(res.message);
      return res;
    },
    onSuccess: () => {
      toast.success("Account removed from church workspace");
      setDeleteAccountTarget(null);
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not remove account"),
  });

  const handleRoleChange = (newRole: AppRole) => {
    setRole(newRole);
    setInvitePerms({ ...DEFAULT_PERMISSIONS[newRole] });
  };

  const handleOpenEdit = (acc: AccountRow) => {
    setEditingAccount(acc);
    setEditRole(acc.role);
    const existing = (acc.permissions ?? {}) as Partial<StaffPermissions>;
    setEditPerms({
      ...DEFAULT_PERMISSIONS[acc.role],
      ...existing,
    });
  };

  const filteredAccounts = accounts.filter((a) => {
    if (filterRole === "all") return true;
    return a.role === filterRole;
  });

  const [activeTab, setActiveTab] = useState<"accounts" | "review">(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      if (p.get("tab") === "review") return "review";
    }
    return "accounts";
  });

  // Church review state
  const reviewQuery = useQuery({
    queryKey: ["my-review-state", tenant?.id],
    enabled: !!tenant?.id && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_review_state");
      if (error) throw error;
      return data as {
        submitted: boolean;
        status?: "pending" | "approved" | "rejected";
        rating?: number;
        quote?: string;
        author_name?: string;
        author_role?: string;
        created_at?: string;
        reviewed_at?: string;
      };
    },
  });

  const [reviewRating, setReviewRating] = useState(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [reviewQuote, setReviewQuote] = useState("");
  const [reviewName, setReviewName] = useState("");
  const [reviewRole, setReviewRole] = useState("Administrator");
  const [isEditingReview, setIsEditingReview] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);

  useEffect(() => {
    if (reviewQuery.data?.submitted) {
      if (reviewQuery.data.rating) setReviewRating(reviewQuery.data.rating);
      if (reviewQuery.data.quote) setReviewQuote(reviewQuery.data.quote);
      if (reviewQuery.data.author_name) setReviewName(reviewQuery.data.author_name);
      if (reviewQuery.data.author_role) setReviewRole(reviewQuery.data.author_role);
    }
  }, [reviewQuery.data]);

  async function handleReviewSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tenant) return;
    setReviewBusy(true);
    try {
      const { error } = await supabase.rpc("submit_church_review", {
        p_tenant: tenant.id,
        p_rating: reviewRating,
        p_quote: reviewQuote.trim(),
        p_author_name: reviewName.trim() || "Church Administrator",
        p_author_role: reviewRole.trim() || "Administrator",
      });
      if (error) throw error;
      toast.success("Review submitted! Prime Haven Super Admin will review it for the homepage.");
      setIsEditingReview(false);
      qc.invalidateQueries({ queryKey: ["my-review-state"] });
      qc.invalidateQueries({ queryKey: ["public-reviews"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not submit review");
    } finally {
      setReviewBusy(false);
    }
  }

  return (
    <div className="space-y-7">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-eyebrow">Access Control & Staff</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Team Accounts & Permissions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Church members never log in. Only appointed administrators, pastors, and ushers have
            access.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Badge
            variant="outline"
            className="border-primary/30 bg-primary/10 text-primary font-display font-semibold px-3 py-1 text-xs"
          >
            <Sparkles className="size-3 mr-1 text-primary" /> {planLabel(tier ?? "basic")} Package
          </Badge>

          <Badge
            variant="secondary"
            className={`font-mono text-xs px-3 py-1 font-semibold ${
              isSeatLimitReached
                ? "bg-amber-500/10 text-amber-500 border border-amber-500/30"
                : "bg-muted text-foreground"
            }`}
          >
            {activeCount} of {maxSeats} seats used
          </Badge>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-border">
        <button
          type="button"
          onClick={() => setActiveTab("accounts")}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition-colors ${
            activeTab === "accounts"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Users className="size-4" />
          <span>Team Accounts ({accounts.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("review")}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition-colors ${
            activeTab === "review"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Star className="size-4 text-amber-500 fill-amber-500" />
          <span>Church Review</span>
          {reviewQuery.data?.submitted && (
            <Badge
              variant="outline"
              className={`ml-1 text-[10px] px-1.5 py-0 capitalize ${
                reviewQuery.data.status === "approved"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
              }`}
            >
              {reviewQuery.data.status === "approved" ? "Live" : reviewQuery.data.status}
            </Badge>
          )}
        </button>
      </div>

      {activeTab === "accounts" ? (
        <>
          {/* Tier Seat Policy Overview Banner */}
          {tier === "free" ? (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <Lock className="size-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-foreground">
                    Free Tier: Single Administrator Account
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    The Free plan includes 1 owner login. Upgrade your account to invite
                    additional team members and assign customized administrative roles.
                  </p>
                </div>
              </div>
              {isOwner && (
                <Link to="/billing">
                  <Button size="sm" className="font-semibold text-xs shrink-0">
                    <Sparkles className="size-3.5 mr-1.5" /> Upgrade Account
                  </Button>
                </Link>
              )}
            </div>
          ) : tier === "basic" ? (
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
              <div>
                <span className="font-bold text-foreground">Account Capacity:</span>{" "}
                <span className="text-muted-foreground">
                  Up to 3 separate accounts (1 primary church owner + 2 additional team members).
                  You can customize permissions for each holder.
                </span>
              </div>
              {isSeatLimitReached && isOwner && (
                <Link to="/billing">
                  <Button size="sm" variant="outline" className="text-xs h-8">
                    Upgrade Account
                  </Button>
                </Link>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
              <div>
                <span className="font-bold text-foreground">
                  {planLabel(tier)} Package Capacity:
                </span>{" "}
                <span className="text-muted-foreground">
                  Up to {maxSeats} team logins with granular permission delegation across members,
                  services, follow-ups, and reports.
                </span>
              </div>
            </div>
          )}

          {/* Invite Account Card (Available if seats remaining or admin) */}
          <div className="surface rounded-2xl border border-border/80 p-5 shadow-panel space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-base font-bold text-ink flex items-center gap-2">
                  <UserPlus className="size-4 text-primary" /> Invite Team Member
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Enter an email address, select their role, and optionally tailor the exact
                  capabilities they can access.
                </p>
              </div>

              {tier !== "free" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs font-semibold h-8"
                  onClick={() => setCustomPermsOpen(!customPermsOpen)}
                >
                  <Sliders className="size-3.5 mr-1.5 text-primary" />
                  {customPermsOpen ? "Hide Custom Permissions" : "Customize Permissions"}
                </Button>
              )}
            </div>

            {tier === "free" ? (
              <div className="p-4 rounded-xl border border-dashed border-border text-center text-xs text-muted-foreground space-y-2">
                <p>Additional team accounts are locked on your current plan. Upgrade to have access to this feature.</p>
                {isOwner && (
                  <Link to="/billing">
                    <Button size="sm" variant="outline" className="font-semibold text-xs">
                      Upgrade to invite team members
                    </Button>
                  </Link>
                )}
              </div>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  send.mutate();
                }}
              >
                <div className="grid gap-4 sm:grid-cols-[1.5fr_1.2fr_1fr_auto] sm:items-end">
                  <div className="space-y-1.5">
                    <Label htmlFor="iemail" className="text-xs font-semibold">
                      Email Address *
                    </Label>
                    <Input
                      id="iemail"
                      type="email"
                      placeholder="e.g. pastor.john@church.org"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={isSeatLimitReached}
                      className="h-10 rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="irole" className="text-xs font-semibold">
                      Assigned Role *
                    </Label>
                    <select
                      id="irole"
                      className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm font-medium focus:ring-2 focus:ring-primary/20"
                      value={role}
                      onChange={(e) => handleRoleChange(e.target.value as AppRole)}
                      disabled={isSeatLimitReached}
                    >
                      {allowedRoles.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="ipos" className="text-xs font-semibold">
                      Cell / Group (Leaders only)
                    </Label>
                    <select
                      id="ipos"
                      className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm font-medium disabled:opacity-50 focus:ring-2 focus:ring-primary/20"
                      value={positionId}
                      onChange={(e) => setPositionId(e.target.value)}
                      disabled={role !== "leader" || isSeatLimitReached}
                    >
                      <option value="">None / Unassigned</option>
                      {(positions ?? []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.group_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <Button
                    type="submit"
                    disabled={send.isPending || !email.trim() || isSeatLimitReached}
                    className="h-10 rounded-xl font-semibold px-5"
                  >
                    <UserPlus className="size-4 mr-1.5" /> Invite
                  </Button>
                </div>

                {/* Granular Permissions Section */}
                {customPermsOpen && (
                  <div className="p-4 rounded-xl border bg-muted/20 space-y-3">
                    <p className="text-xs font-bold text-foreground">
                      Custom Permissions for this invitation:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={invitePerms.can_manage_members}
                          onCheckedChange={(v) =>
                            setInvitePerms((p) => ({ ...p, can_manage_members: Boolean(v) }))
                          }
                        />
                        <span>Manage Members & Profiles</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={invitePerms.can_manage_attendance}
                          onCheckedChange={(v) =>
                            setInvitePerms((p) => ({ ...p, can_manage_attendance: Boolean(v) }))
                          }
                        />
                        <span>Attendance Records & CRUD</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={invitePerms.can_scan_qr}
                          onCheckedChange={(v) =>
                            setInvitePerms((p) => ({ ...p, can_scan_qr: Boolean(v) }))
                          }
                        />
                        <span>QR Scanner & Manual Entry</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={invitePerms.can_manage_services}
                          onCheckedChange={(v) =>
                            setInvitePerms((p) => ({ ...p, can_manage_services: Boolean(v) }))
                          }
                        />
                        <span>Services & Special Programs</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={invitePerms.can_manage_followups}
                          onCheckedChange={(v) =>
                            setInvitePerms((p) => ({ ...p, can_manage_followups: Boolean(v) }))
                          }
                        />
                        <span>First-timer & Pastoral Care</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={invitePerms.can_view_reports}
                          onCheckedChange={(v) =>
                            setInvitePerms((p) => ({ ...p, can_view_reports: Boolean(v) }))
                          }
                        />
                        <span>View Attendance Reports</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={invitePerms.can_send_messages}
                          onCheckedChange={(v) =>
                            setInvitePerms((p) => ({ ...p, can_send_messages: Boolean(v) }))
                          }
                        />
                        <span>Send Emails & Broadcasts</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={invitePerms.can_manage_settings}
                          onCheckedChange={(v) =>
                            setInvitePerms((p) => ({ ...p, can_manage_settings: Boolean(v) }))
                          }
                        />
                        <span>Church Branding & Settings</span>
                      </label>
                    </div>
                  </div>
                )}
              </form>
            )}
          </div>

          {/* Role Explanations */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {roleOptions.map((ro) => {
              const isEligible = ro.tiers.includes(tier ?? "basic");
              return (
                <div
                  key={ro.value}
                  className={`rounded-2xl border p-4 text-xs space-y-1.5 transition-all ${
                    isEligible
                      ? "bg-card border-border/80 text-foreground shadow-sm"
                      : "bg-muted/40 border-dashed border-border/60 text-muted-foreground opacity-75"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold font-display text-sm text-foreground">
                      {ro.label}
                    </span>
                    {isEligible ? (
                      <Badge
                        variant="secondary"
                        className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"
                      >
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        Requires Upgrade
                      </Badge>
                    )}
                  </div>
                  <p className="leading-relaxed">{ro.desc}</p>
                </div>
              );
            })}
          </div>

          {/* Accounts List */}
          <div className="surface rounded-2xl border border-border/80 overflow-hidden shadow-panel">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 p-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Filter by Role:
                </span>
                <select
                  value={filterRole}
                  onChange={(e) => setFilterRole(e.target.value)}
                  className="h-8 rounded-lg border border-input bg-background px-2.5 text-xs font-medium"
                >
                  <option value="all">All Roles ({accounts.length})</option>
                  <option value="owner">Church Owner</option>
                  <option value="church_admin">Church Admins</option>
                  <option value="branch_admin">Branch Admins</option>
                  <option value="leader">Leaders</option>
                  <option value="usher">Ushers / Scanners</option>
                </select>
              </div>

              <span className="text-xs font-medium text-muted-foreground">
                {filteredAccounts.length} team member{filteredAccounts.length === 1 ? "" : "s"}
              </span>
            </div>

            {isLoading ? (
              <div className="p-12 text-center text-sm text-muted-foreground">
                Loading accounts…
              </div>
            ) : filteredAccounts.length === 0 ? (
              <div className="p-12 text-center text-sm text-muted-foreground">
                No accounts match this filter.
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {filteredAccounts.map((a) => {
                  const profile = a.profiles;
                  const isChurchOwner = a.role === "owner";
                  const userPerms = a.permissions as Partial<StaffPermissions> | null;

                  return (
                    <li
                      key={a.id}
                      className="flex flex-wrap items-center justify-between gap-4 p-4 hover:bg-muted/20 transition-colors"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm text-foreground">
                            {profile?.full_name || profile?.email || "Invited User"}
                          </p>
                          {isChurchOwner && (
                            <Badge
                              variant="secondary"
                              className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold"
                            >
                              Account Owner
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{profile?.email}</p>

                        {/* Permissions tags */}
                        {!isChurchOwner && userPerms && (
                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            {userPerms.can_manage_members && (
                              <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full text-foreground">
                                Members
                              </span>
                            )}
                            {userPerms.can_manage_attendance && (
                              <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full text-foreground">
                                Attendance
                              </span>
                            )}
                            {userPerms.can_scan_qr && (
                              <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full text-foreground">
                                Scanner
                              </span>
                            )}
                            {userPerms.can_manage_services && (
                              <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full text-foreground">
                                Services
                              </span>
                            )}
                            {userPerms.can_manage_followups && (
                              <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full text-foreground">
                                Follow-ups
                              </span>
                            )}
                            {userPerms.can_view_reports && (
                              <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full text-foreground">
                                Reports
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2.5">
                        <Badge
                          variant="secondary"
                          className="capitalize text-xs font-semibold px-2.5 py-1"
                        >
                          {a.role.replace("_", " ")}
                        </Badge>

                        <Badge
                          variant={a.status === "active" ? "default" : "outline"}
                          className={`text-xs capitalize ${
                            a.status === "active"
                              ? "bg-emerald-600 hover:bg-emerald-600 text-white"
                              : "text-muted-foreground"
                          }`}
                        >
                          {a.status}
                        </Badge>

                        {/* Edit Permissions button for non-owners */}
                        {!isChurchOwner && isOwner && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs font-semibold gap-1.5"
                            onClick={() => handleOpenEdit(a)}
                          >
                            <Sliders className="size-3.5 text-primary" />
                            Permissions
                          </Button>
                        )}

                        {!isChurchOwner && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-xs font-semibold"
                            onClick={() =>
                              setStatus.mutate({
                                id: a.id,
                                status: a.status === "active" ? "suspended" : "active",
                              })
                            }
                          >
                            {a.status === "active" ? "Suspend" : "Restore"}
                          </Button>
                        )}

                        {!isChurchOwner && isOwner && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteAccountTarget(a)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Edit Permissions Modal */}
          <Dialog open={!!editingAccount} onOpenChange={(open) => !open && setEditingAccount(null)}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <KeyRound className="size-5 text-primary" />
                  Manage Account Permissions
                </DialogTitle>
                <DialogDescription>
                  Control the specific capabilities and system access for{" "}
                  <strong className="text-foreground">
                    {editingAccount?.profiles?.full_name || editingAccount?.profiles?.email}
                  </strong>
                  .
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Assigned Role</Label>
                  <select
                    className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs font-medium"
                    value={editRole}
                    onChange={(e) => {
                      const newR = e.target.value as AppRole;
                      setEditRole(newR);
                      setEditPerms((prev) => ({
                        ...prev,
                        ...DEFAULT_PERMISSIONS[newR],
                      }));
                    }}
                  >
                    {allowedRoles.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2 border-t pt-3">
                  <Label className="text-xs font-semibold text-foreground">
                    Granular Permissions & Feature Access
                  </Label>
                  <div className="space-y-2.5 text-xs">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <Checkbox
                        checked={editPerms.can_manage_members}
                        onCheckedChange={(v) =>
                          setEditPerms((p) => ({ ...p, can_manage_members: Boolean(v) }))
                        }
                      />
                      <div>
                        <p className="font-semibold text-foreground">Manage Members & Profiles</p>
                        <p className="text-muted-foreground text-[11px]">
                          Add, view, edit member records and download rosters.
                        </p>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <Checkbox
                        checked={editPerms.can_manage_attendance}
                        onCheckedChange={(v) =>
                          setEditPerms((p) => ({ ...p, can_manage_attendance: Boolean(v) }))
                        }
                      />
                      <div>
                        <p className="font-semibold text-foreground">Attendance Register & CRUD</p>
                        <p className="text-muted-foreground text-[11px]">
                          Mark present, delete attendance records, and add quick walk-ins.
                        </p>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <Checkbox
                        checked={editPerms.can_scan_qr}
                        onCheckedChange={(v) =>
                          setEditPerms((p) => ({ ...p, can_scan_qr: Boolean(v) }))
                        }
                      />
                      <div>
                        <p className="font-semibold text-foreground">
                          QR Scanner & Member Code Check-in
                        </p>
                        <p className="text-muted-foreground text-[11px]">
                          Use device camera to scan member codes at the door.
                        </p>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <Checkbox
                        checked={editPerms.can_manage_services}
                        onCheckedChange={(v) =>
                          setEditPerms((p) => ({ ...p, can_manage_services: Boolean(v) }))
                        }
                      />
                      <div>
                        <p className="font-semibold text-foreground">Services & Special Programs</p>
                        <p className="text-muted-foreground text-[11px]">
                          Create conferences, edit themes, speakers, and close services.
                        </p>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <Checkbox
                        checked={editPerms.can_manage_followups}
                        onCheckedChange={(v) =>
                          setEditPerms((p) => ({ ...p, can_manage_followups: Boolean(v) }))
                        }
                      />
                      <div>
                        <p className="font-semibold text-foreground">First-timer & Pastoral Care</p>
                        <p className="text-muted-foreground text-[11px]">
                          Log member care interactions and follow-up notes.
                        </p>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <Checkbox
                        checked={editPerms.can_view_reports}
                        onCheckedChange={(v) =>
                          setEditPerms((p) => ({ ...p, can_view_reports: Boolean(v) }))
                        }
                      />
                      <div>
                        <p className="font-semibold text-foreground">Analytics & Reports</p>
                        <p className="text-muted-foreground text-[11px]">
                          View church growth, attendance retention, and demographic trends.
                        </p>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <Checkbox
                        checked={editPerms.can_send_messages}
                        onCheckedChange={(v) =>
                          setEditPerms((p) => ({ ...p, can_send_messages: Boolean(v) }))
                        }
                      />
                      <div>
                        <p className="font-semibold text-foreground">Broadcast Messaging</p>
                        <p className="text-muted-foreground text-[11px]">
                          Compose and send email and SMS broadcasts to congregation.
                        </p>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <Checkbox
                        checked={editPerms.can_manage_settings}
                        onCheckedChange={(v) =>
                          setEditPerms((p) => ({ ...p, can_manage_settings: Boolean(v) }))
                        }
                      />
                      <div>
                        <p className="font-semibold text-foreground">Church Settings & Branding</p>
                        <p className="text-muted-foreground text-[11px]">
                          Update church contact details, logo, colors, and vocabulary.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="ghost" onClick={() => setEditingAccount(null)}>
                  Cancel
                </Button>
                <Button
                  disabled={savePermissions.isPending}
                  onClick={() => savePermissions.mutate()}
                >
                  {savePermissions.isPending ? "Saving…" : "Save Permissions"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Delete / Revoke Account Confirmation Dialog */}
          <Dialog
            open={!!deleteAccountTarget}
            onOpenChange={(open) => !open && setDeleteAccountTarget(null)}
          >
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="size-5" />
                  Remove Team Member?
                </DialogTitle>
                <DialogDescription>
                  Are you sure you want to remove{" "}
                  <strong>
                    {deleteAccountTarget?.profiles?.full_name ||
                      deleteAccountTarget?.profiles?.email}
                  </strong>{" "}
                  from your church workspace? They will immediately lose login access. Their
                  attendance logs and created records will remain in the database.
                </DialogDescription>
              </DialogHeader>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="ghost" onClick={() => setDeleteAccountTarget(null)}>
                  Keep Account
                </Button>
                <Button
                  variant="destructive"
                  disabled={deleteAccount.isPending}
                  onClick={() => deleteAccount.mutate()}
                >
                  {deleteAccount.isPending ? "Removing…" : "Yes, Remove Account"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : (
        /* Church Review Tab */
        <div className="space-y-6 max-w-3xl">
          <div className="surface p-6 md:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-5">
              <div>
                <p className="text-eyebrow">Public Testimonial</p>
                <h2 className="text-xl font-bold tracking-tight">Your Church Review & Rating</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Share your experience with Mene:Log. Approved reviews are featured on the official
                  homepage carousel.
                </p>
              </div>

              {reviewQuery.data?.submitted && (
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`capitalize px-3 py-1 text-xs font-semibold ${
                      reviewQuery.data.status === "approved"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : reviewQuery.data.status === "rejected"
                          ? "border-destructive/30 bg-destructive/10 text-destructive"
                          : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {reviewQuery.data.status === "approved"
                      ? "✓ Published on Homepage"
                      : reviewQuery.data.status === "rejected"
                        ? "Hidden by Operator"
                        : "⏳ Pending Super Admin Approval"}
                  </Badge>
                </div>
              )}
            </div>

            {reviewQuery.data?.submitted && !isEditingReview ? (
              <div className="space-y-6">
                <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-1.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`size-6 ${
                            i < (reviewQuery.data.rating ?? 5)
                              ? "fill-amber-400 text-amber-400"
                              : "text-muted-foreground/30"
                          }`}
                        />
                      ))}
                      <span className="ml-2 font-display text-base font-bold">
                        {reviewQuery.data.rating ?? 5}.0 / 5
                      </span>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditingReview(true)}
                      className="text-xs"
                    >
                      Update Review
                    </Button>
                  </div>

                  <blockquote className="rounded-xl border border-border/60 bg-muted/30 p-4 font-sans text-base italic leading-relaxed text-foreground">
                    “{reviewQuery.data.quote}”
                  </blockquote>

                  <div className="flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-2 pt-2 border-t border-border/40">
                    <div>
                      <span className="font-semibold text-foreground">
                        {reviewQuery.data.author_name}
                      </span>
                      {reviewQuery.data.author_role && (
                        <span> · {reviewQuery.data.author_role}</span>
                      )}
                      <span> · {tenant?.name}</span>
                    </div>
                    {reviewQuery.data.created_at && (
                      <span>
                        Submitted {new Date(reviewQuery.data.created_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                {reviewQuery.data.status === "approved" && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="size-4 shrink-0" />
                      <span>
                        Your review is live on the Mene:Log official homepage for other churches to
                        see!
                      </span>
                    </div>
                    <Button asChild variant="outline" size="sm" className="text-xs shrink-0">
                      <Link to="/">
                        View Homepage <ExternalLink className="size-3 ml-1" />
                      </Link>
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={handleReviewSubmit} className="space-y-6">
                <div className="space-y-3">
                  <Label className="text-sm font-semibold">
                    1. Rate your experience (1 to 5 stars)
                  </Label>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((value) => {
                      const active = (hoverRating ?? reviewRating) >= value;
                      return (
                        <button
                          key={value}
                          type="button"
                          className="p-1 transition-transform hover:scale-125 focus:outline-none"
                          onMouseEnter={() => setHoverRating(value)}
                          onMouseLeave={() => setHoverRating(null)}
                          onClick={() => setReviewRating(value)}
                          aria-label={`Rate ${value} stars`}
                        >
                          <Star
                            className={`size-8 transition-colors ${
                              active
                                ? "fill-amber-400 text-amber-400 drop-shadow-[0_2px_8px_rgba(251,191,36,0.3)]"
                                : "text-muted-foreground/30 hover:text-muted-foreground"
                            }`}
                          />
                        </button>
                      );
                    })}
                    <span className="ml-3 text-xs font-semibold text-primary">
                      {reviewRating === 5
                        ? "★★★★★ 5 Stars — Exceptional platform"
                        : reviewRating === 4
                          ? "★★★★☆ 4 Stars — Very good software"
                          : reviewRating === 3
                            ? "★★★☆☆ 3 Stars — Good & reliable"
                            : reviewRating === 2
                              ? "★★☆☆☆ 2 Stars — Fair, needs improvement"
                              : "★☆☆☆☆ 1 Star — Poor experience"}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tab-quote" className="text-sm font-semibold">
                    2. Your Review & Testimonial
                  </Label>
                  <textarea
                    id="tab-quote"
                    required
                    minLength={20}
                    maxLength={600}
                    rows={4}
                    value={reviewQuote}
                    onChange={(e) => setReviewQuote(e.target.value)}
                    className="w-full rounded-xl border border-input bg-background p-3.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
                    placeholder="Tell other church leaders how Mene:Log has improved attendance tracking, membership follow-ups, or operations in your church..."
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Minimum 20 characters</span>
                    <span>{reviewQuote.length} / 600</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="tab-name" className="text-xs font-semibold">
                      Your Name
                    </Label>
                    <Input
                      id="tab-name"
                      required
                      maxLength={80}
                      placeholder="e.g. Pastor Emmanuel Darko"
                      value={reviewName}
                      onChange={(e) => setReviewName(e.target.value)}
                      className="h-10 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="tab-role" className="text-xs font-semibold">
                      Your Church Role
                    </Label>
                    <Input
                      id="tab-role"
                      maxLength={80}
                      placeholder="e.g. Senior Pastor / Church Administrator"
                      value={reviewRole}
                      onChange={(e) => setReviewRole(e.target.value)}
                      className="h-10 text-sm"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-border/40">
                  {isEditingReview ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setIsEditingReview(false)}
                      className="text-xs"
                    >
                      Cancel Edit
                    </Button>
                  ) : (
                    <div />
                  )}

                  <Button
                    type="submit"
                    disabled={reviewBusy || reviewQuote.trim().length < 20}
                    className="gap-2"
                  >
                    <Star className="size-4 fill-current" />
                    <span>
                      {reviewBusy
                        ? "Submitting…"
                        : reviewQuery.data?.submitted
                          ? "Update Review"
                          : "Submit Review for Approval"}
                    </span>
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Accounts;
