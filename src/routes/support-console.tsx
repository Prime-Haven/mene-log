import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  LifeBuoy,
  Shield,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Trash2,
  Lock,
  MessageSquare,
  Send,
  ArrowLeft,
  Search,
  Clock,
  Building2,
  Mail,
  Phone,
  AlertTriangle,
  ExternalLink,
  LogOut,
  RefreshCw,
  Eye,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MeneLogLogo } from "@/components/MeneLogLogo";
import {
  supportOperatorSignIn,
  getSupportOperatorSession,
  listSupportConsoleTickets,
  getSupportConsoleTicket,
  updateSupportConsoleTicket,
  replySupportConsoleTicket,
  listSupportStaffAccounts,
  createSupportStaffAccount,
  removeSupportStaffAccount,
} from "@/lib/support.functions";

export const Route = createFileRoute("/support-console")({
  validateSearch: (search: Record<string, unknown>) => ({
    ticketId: typeof search["ticketId"] === "string" ? search["ticketId"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Mene:Log Support Console — Operations & Helpdesk" },
      {
        name: "description",
        content: "Mene:Log operator ticket triage, tenant communication, and resolution desk.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SupportConsolePage,
});

type TicketPriority = "low" | "normal" | "high" | "urgent";
type TicketStatus = "open" | "in_progress" | "resolved" | "closed";

type SupportStaffItem = {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  email: string;
  created_at: string;
  created_by?: string | null;
};

type ConsoleReplyItem = {
  id: string;
  ticket_id: string;
  author_type: "church" | "support" | "super_admin";
  author_id: string;
  message: string;
  is_internal: boolean;
  created_at: string;
};

type ConsoleTicketItem = {
  id: string;
  tenant_id: string;
  submitted_by_user_id: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  tenant_name?: string;
  tenant_subdomain?: string;
  tenant_contact_email?: string;
  reply_count?: number;
};

function priorityBadgeClass(priority: TicketPriority) {
  switch (priority) {
    case "urgent":
      return "border-red-500/30 bg-red-500/10 text-red-400";
    case "high":
      return "border-amber-500/30 bg-amber-500/10 text-amber-400";
    case "normal":
      return "border-blue-500/30 bg-blue-500/10 text-blue-400";
    case "low":
    default:
      return "border-slate-500/30 bg-slate-500/10 text-slate-400";
  }
}

function statusBadgeClass(status: TicketStatus) {
  switch (status) {
    case "open":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
    case "in_progress":
      return "border-blue-500/30 bg-blue-500/10 text-blue-400";
    case "resolved":
      return "border-violet-500/30 bg-violet-500/10 text-violet-400";
    case "closed":
    default:
      return "border-slate-500/30 bg-slate-500/10 text-slate-400";
  }
}

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function SupportConsolePage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/support-console" });
  const { session, loading: isAuthLoading } = useAuth();
  const qc = useQueryClient();

  // Server functions
  const signInFn = useServerFn(supportOperatorSignIn);
  const getSessionFn = useServerFn(getSupportOperatorSession);
  const listTicketsFn = useServerFn(listSupportConsoleTickets);
  const getTicketFn = useServerFn(getSupportConsoleTicket);
  const updateTicketFn = useServerFn(updateSupportConsoleTicket);
  const replyTicketFn = useServerFn(replySupportConsoleTicket);
  const listStaffFn = useServerFn(listSupportStaffAccounts);
  const createStaffFn = useServerFn(createSupportStaffAccount);
  const removeStaffFn = useServerFn(removeSupportStaffAccount);

  // Sign-in form state
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Active view state
  const [activeTab, setActiveTab] = useState<"queue" | "staff">("queue");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(search.ticketId || null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Reply form state
  const [replyMessage, setReplyMessage] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);

  // Add staff modal state
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
  const [staffUsername, setStaffUsername] = useState("");
  const [staffDisplayName, setStaffDisplayName] = useState("");
  const [staffPassword, setStaffPassword] = useState("");

  // Sync search ticketId
  useEffect(() => {
    if (search.ticketId && search.ticketId !== selectedTicketId) {
      setSelectedTicketId(search.ticketId);
    }
  }, [search.ticketId, selectedTicketId]);

  // Auth header helper
  async function getAuthHeader() {
    const { data } = await supabase.auth.getSession();
    return {
      Authorization: `Bearer ${data.session?.access_token ?? ""}`,
    };
  }

  // Check operator session & role
  const {
    data: operatorSession,
    isLoading: isLoadingSession,
    error: sessionError,
  } = useQuery({
    queryKey: ["support-operator-session", session?.user?.id],
    enabled: !!session && !isAuthLoading,
    queryFn: async () => {
      const headers = await getAuthHeader();
      return getSessionFn({ headers });
    },
    retry: false,
  });

  const isOperator = !!operatorSession && !sessionError;
  const isSuperAdmin = operatorSession?.role === "super_admin";

  // Operator Sign In Action
  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setIsSigningIn(true);
    try {
      const res = await signInFn({
        data: { username: username.trim(), password },
      });

      if (!res.ok) {
        throw new Error(res.error || "Sign-in failed");
      }

      const { error: sessionSetError } = await supabase.auth.setSession({
        access_token: res.access_token,
        refresh_token: res.refresh_token,
      });

      if (sessionSetError) throw sessionSetError;

      toast.success(`Signed in as ${res.username} (${res.role})`);
      qc.invalidateQueries({ queryKey: ["support-operator-session"] });
      qc.invalidateQueries({ queryKey: ["support-console-tickets"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Invalid operator credentials");
    } finally {
      setIsSigningIn(false);
    }
  }

  // Sign out
  async function handleSignOut() {
    await supabase.auth.signOut();
    qc.clear();
    toast.info("Signed out of Support Console");
  }

  // Query console tickets
  const {
    data: tickets = [],
    isLoading: isLoadingTickets,
    refetch: refetchTickets,
  } = useQuery({
    queryKey: ["support-console-tickets", isOperator, statusFilter, priorityFilter, searchTerm],
    enabled: isOperator,
    queryFn: async () => {
      const headers = await getAuthHeader();
      return listTicketsFn({
        data: {
          status: statusFilter === "all" ? undefined : (statusFilter as TicketStatus),
          priority: priorityFilter === "all" ? undefined : (priorityFilter as TicketPriority),
          search: searchTerm.trim() || undefined,
        },
        headers,
      });
    },
  });

  // Query single ticket detail & thread
  const { data: threadData, isLoading: isLoadingThread } = useQuery({
    queryKey: ["support-console-ticket-thread", selectedTicketId],
    enabled: isOperator && !!selectedTicketId,
    queryFn: async () => {
      if (!selectedTicketId) return null;
      const headers = await getAuthHeader();
      return getTicketFn({
        data: { ticket_id: selectedTicketId },
        headers,
      });
    },
  });

  // Query support staff accounts (super_admin only)
  const { data: staffList = [], isLoading: isLoadingStaff } = useQuery({
    queryKey: ["support-staff-list", isSuperAdmin],
    enabled: isOperator && isSuperAdmin && activeTab === "staff",
    queryFn: async () => {
      const headers = await getAuthHeader();
      return listStaffFn({ headers });
    },
  });

  // Update ticket mutation
  const updateTicketMutation = useMutation({
    mutationFn: async (vars: { status?: TicketStatus; priority?: TicketPriority }) => {
      if (!selectedTicketId) throw new Error("No ticket selected");
      const headers = await getAuthHeader();
      return updateTicketFn({
        data: { ticket_id: selectedTicketId, ...vars },
        headers,
      });
    },
    onSuccess: () => {
      toast.success("Ticket updated");
      qc.invalidateQueries({ queryKey: ["support-console-tickets"] });
      qc.invalidateQueries({ queryKey: ["support-console-ticket-thread", selectedTicketId] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Could not update ticket");
    },
  });

  // Post reply mutation
  const replyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTicketId) throw new Error("No ticket selected");
      const headers = await getAuthHeader();
      return replyTicketFn({
        data: {
          ticket_id: selectedTicketId,
          message: replyMessage.trim(),
          is_internal: isInternalNote,
        },
        headers,
      });
    },
    onSuccess: () => {
      toast.success(isInternalNote ? "Internal staff note recorded" : "Reply sent to church");
      setReplyMessage("");
      qc.invalidateQueries({ queryKey: ["support-console-ticket-thread", selectedTicketId] });
      qc.invalidateQueries({ queryKey: ["support-console-tickets"] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Failed to post reply");
    },
  });

  // Add staff mutation
  const addStaffMutation = useMutation({
    mutationFn: async () => {
      const headers = await getAuthHeader();
      return createStaffFn({
        data: {
          username: staffUsername.trim(),
          display_name: staffDisplayName.trim(),
          password: staffPassword,
        },
        headers,
      });
    },
    onSuccess: () => {
      toast.success("Support staff operator created");
      setIsAddStaffOpen(false);
      setStaffUsername("");
      setStaffDisplayName("");
      setStaffPassword("");
      qc.invalidateQueries({ queryKey: ["support-staff-list"] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Could not create support staff");
    },
  });

  // Remove staff mutation
  const removeStaffMutation = useMutation({
    mutationFn: async (staffId: string) => {
      const headers = await getAuthHeader();
      return removeStaffFn({
        data: { staff_id: staffId },
        headers,
      });
    },
    onSuccess: () => {
      toast.success("Support staff access revoked");
      qc.invalidateQueries({ queryKey: ["support-staff-list"] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Could not revoke staff access");
    },
  });

  // If loading auth state
  if (isAuthLoading || (session && isLoadingSession)) {
    return (
      <div className="grid min-h-screen place-items-center bg-deep text-deep-foreground">
        <div className="text-center space-y-3">
          <MeneLogLogo className="h-10 mx-auto" />
          <p className="text-sm text-muted-foreground animate-pulse">
            Verifying operator credentials…
          </p>
        </div>
      </div>
    );
  }

  // If not logged in as support operator or session error -> show sign-in screen
  if (!session || !isOperator) {
    return (
      <main className="grid min-h-screen place-items-center bg-deep px-5 py-10 text-deep-foreground">
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md rounded-lg border border-deep-foreground/15 bg-background p-7 text-foreground shadow-2xl space-y-6"
        >
          <MeneLogLogo className="h-12 max-w-56" />

          <div>
            <p className="text-eyebrow">Restricted Support Entrance</p>
            <h1 className="mt-1 font-display text-2xl font-bold text-foreground">
              Support Operations Console
            </h1>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              Triage church support tickets, assist ministry partners, and manage operational
              inquiries. Billing, tier changes, and tenant deletion are strictly restricted to Super
              Admins.
            </p>
          </div>

          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="support-username">Operator Username</Label>
              <Input
                id="support-username"
                autoComplete="username"
                autoCapitalize="none"
                required
                maxLength={60}
                placeholder="e.g. support_john or prime_haven"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="support-password">Password</Label>
              <Input
                id="support-password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={72}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <Button type="submit" disabled={isSigningIn} className="w-full gap-2">
              <ShieldCheck className="size-4" />
              <span>{isSigningIn ? "Authenticating…" : "Sign In to Support Console"}</span>
            </Button>
          </form>

          <div className="border-t border-border/60 pt-4 text-center">
            <p className="text-xs text-muted-foreground">
              Full Super Admin Console?{" "}
              <Link to="/super-admin" className="text-primary hover:underline font-medium">
                Prime Haven Super Admin &rarr;
              </Link>
            </p>
          </div>
        </motion.section>
      </main>
    );
  }

  // Active ticket object
  const selectedQueueTicket = tickets.find((t) => t.id === selectedTicketId);
  const activeTicket = threadData?.ticket || selectedQueueTicket;
  const activeTenant = threadData?.tenant;

  // Stats
  const openCount = tickets.filter((t) => t.status === "open").length;
  const inProgressCount = tickets.filter((t) => t.status === "in_progress").length;
  const urgentCount = tickets.filter(
    (t) => t.priority === "urgent" || t.priority === "high",
  ).length;
  const resolvedCount = tickets.filter((t) => t.status === "resolved").length;

  return (
    <div className="min-h-screen bg-deep text-foreground flex flex-col">
      {/* Top Console Navigation Bar */}
      <header className="border-b border-border/80 bg-background/95 backdrop-blur px-5 py-3 sticky top-0 z-30 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <MeneLogLogo className="h-8 max-w-36" />
          <span className="hidden sm:inline-block h-5 w-px bg-border" />
          <div className="flex items-center gap-2">
            <LifeBuoy className="size-4 text-primary" />
            <span className="font-display font-bold text-sm tracking-tight text-foreground">
              Support Console
            </span>
            <span
              className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded tracking-wider border ${
                isSuperAdmin
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                  : "bg-blue-500/10 text-blue-400 border-blue-500/30"
              }`}
            >
              {isSuperAdmin ? "Super Admin (Full Oversight)" : "Support Staff"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Super admin quick links */}
          {isSuperAdmin && (
            <>
              <div className="flex items-center bg-secondary rounded-lg p-0.5 text-xs font-medium">
                <button
                  onClick={() => {
                    setActiveTab("queue");
                    setSelectedTicketId(null);
                  }}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    activeTab === "queue"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Tickets Queue
                </button>
                <button
                  onClick={() => {
                    setActiveTab("staff");
                    setSelectedTicketId(null);
                  }}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    activeTab === "staff"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Manage Staff
                </button>
              </div>

              <Link
                to="/platform"
                className="hidden md:inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors border border-border/60 px-2.5 py-1.5 rounded-md"
              >
                <span>Super Admin Console</span>
                <ExternalLink className="size-3" />
              </Link>
            </>
          )}

          <div className="flex items-center gap-2 pl-2 border-l border-border/60">
            <span className="text-xs font-mono text-muted-foreground hidden lg:inline">
              @{operatorSession.username}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="text-xs text-muted-foreground hover:text-destructive gap-1 px-2.5 h-8"
            >
              <LogOut className="size-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Console Workspace */}
      <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto space-y-6">
        {/* Support Staff Scope Notice */}
        {!isSuperAdmin && (
          <div className="surface px-4 py-2.5 flex items-center justify-between text-xs text-muted-foreground border-l-4 border-blue-500">
            <div className="flex items-center gap-2">
              <Shield className="size-4 text-blue-400" />
              <span>
                Support Operator Mode: You have ticket triage and direct tenant communication
                privileges. Billing, tier adjustments, and tenant deletions require a Super Admin.
              </span>
            </div>
          </div>
        )}

        {/* Tab 2: Manage Support Staff (Super Admin Only) */}
        {activeTab === "staff" && isSuperAdmin ? (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-5">
              <div>
                <p className="text-eyebrow">Personnel & Access</p>
                <h2 className="text-display mt-1">Support Staff Accounts</h2>
                <p className="text-subtitle mt-1">
                  Provision dedicated support accounts that can triage tickets and reply to churches
                  without full platform admin privileges.
                </p>
              </div>
              <Button onClick={() => setIsAddStaffOpen(true)} className="gap-2">
                <UserPlus className="size-4" />
                <span>Add Support Operator</span>
              </Button>
            </div>

            {isLoadingStaff ? (
              <div className="surface p-12 text-center text-sm text-muted-foreground animate-pulse">
                Loading support staff accounts...
              </div>
            ) : staffList.length === 0 ? (
              <div className="surface p-12 text-center space-y-3">
                <UserCheck className="mx-auto size-10 text-muted-foreground/60" />
                <h3 className="font-semibold text-foreground">
                  No dedicated support staff accounts
                </h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Super Admins can directly handle tickets, or you can provision dedicated support
                  operator accounts for your team.
                </p>
                <Button onClick={() => setIsAddStaffOpen(true)} className="gap-2 mt-2">
                  <UserPlus className="size-4" />
                  <span>Provision First Support Operator</span>
                </Button>
              </div>
            ) : (
              <div className="surface overflow-hidden divide-y divide-border/60">
                {staffList.map((staff: SupportStaffItem) => (
                  <div
                    key={staff.id}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-secondary/30 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground text-sm">
                          {staff.display_name}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          @{staff.username}
                        </span>
                        <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          Support Specialist
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{staff.email}</p>
                      <p className="text-[11px] text-muted-foreground/80">
                        Created {formatDate(staff.created_at)}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          if (
                            confirm(
                              `Revoke support console access for ${staff.display_name} (@${staff.username})?`,
                            )
                          ) {
                            removeStaffMutation.mutate(staff.id);
                          }
                        }}
                        disabled={removeStaffMutation.isPending}
                        className="gap-1.5 h-8 text-xs"
                      >
                        <Trash2 className="size-3.5" />
                        <span>Revoke Access</span>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : selectedTicketId && activeTicket ? (
          /* Tab 1b: Single Ticket Detail & Thread Workspace */
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Ticket Header & Status Control Bar */}
            <div className="surface p-5 md:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedTicketId(null)}
                  className="gap-2 text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="size-4" />
                  <span>Back to Tickets Queue</span>
                </Button>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Status switcher */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Status:</span>
                    <select
                      value={activeTicket.status}
                      onChange={(e) =>
                        updateTicketMutation.mutate({ status: e.target.value as TicketStatus })
                      }
                      className="rounded border border-input bg-background px-2.5 py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>

                  {/* Priority switcher */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Priority:</span>
                    <select
                      value={activeTicket.priority}
                      onChange={(e) =>
                        updateTicketMutation.mutate({ priority: e.target.value as TicketPriority })
                      }
                      className="rounded border border-input bg-background px-2.5 py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>

                  {/* Quick Resolution Button */}
                  {activeTicket.status !== "resolved" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updateTicketMutation.mutate({ status: "resolved" })}
                      disabled={updateTicketMutation.isPending}
                      className="gap-1.5 h-8 text-xs border-violet-500/40 text-violet-400 hover:bg-violet-500/10"
                    >
                      <CheckCircle2 className="size-3.5" />
                      <span>Mark Resolved</span>
                    </Button>
                  )}
                </div>
              </div>

              <div>
                <h1 className="text-xl md:text-2xl font-bold font-display text-foreground">
                  {activeTicket.subject}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                  <span>
                    Ticket ID: <span className="font-mono text-foreground">{activeTicket.id}</span>
                  </span>
                  <span>•</span>
                  <span>Submitted: {formatDate(activeTicket.created_at)}</span>
                  <span>•</span>
                  <span>Updated: {formatDate(activeTicket.updated_at)}</span>
                  {activeTicket.resolved_at && (
                    <>
                      <span>•</span>
                      <span className="text-violet-400 font-semibold">
                        Resolved: {formatDate(activeTicket.resolved_at)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Split layout: Church Details Summary & Thread */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Church & Submitter Info */}
              <div className="space-y-4 lg:col-span-1">
                <div className="surface p-5 space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Building2 className="size-4" />
                    <span>Church Profile</span>
                  </h3>

                  <div className="space-y-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Church Name</p>
                      <p className="font-semibold text-foreground">
                        {activeTenant?.name || selectedQueueTicket?.tenant_name || "Church Partner"}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground">Mene:Log Subdomain</p>
                      <p className="font-mono text-xs text-primary">
                        {activeTenant?.subdomain || selectedQueueTicket?.tenant_subdomain || "—"}
                        .menelog.site
                      </p>
                    </div>

                    {activeTenant?.contact_email && (
                      <div>
                        <p className="text-xs text-muted-foreground">Contact Email</p>
                        <p className="text-foreground flex items-center gap-1.5 text-xs truncate">
                          <Mail className="size-3 text-muted-foreground shrink-0" />
                          <span>{activeTenant.contact_email}</span>
                        </p>
                      </div>
                    )}

                    {activeTenant?.contact_phone && (
                      <div>
                        <p className="text-xs text-muted-foreground">Phone</p>
                        <p className="text-foreground flex items-center gap-1.5 text-xs">
                          <Phone className="size-3 text-muted-foreground shrink-0" />
                          <span>{activeTenant.contact_phone}</span>
                        </p>
                      </div>
                    )}

                    <div>
                      <p className="text-xs text-muted-foreground">Subscription Tier</p>
                      <span className="inline-block mt-0.5 text-xs font-semibold px-2 py-0.5 rounded uppercase bg-secondary text-foreground">
                        {activeTenant?.tier || "Basic"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Scope enforcement reminder */}
                <div className="surface p-4 text-xs text-muted-foreground space-y-1.5 bg-background/50">
                  <p className="font-semibold text-foreground flex items-center gap-1.5">
                    <Shield className="size-3.5 text-blue-400" />
                    <span>Permissions Boundary</span>
                  </p>
                  <p className="leading-relaxed">
                    Support accounts cannot modify subscription plans, tier entitlements, or
                    initiate deletions. If the church requests plan upgrades or account changes,
                    escalate to Super Admin.
                  </p>
                </div>
              </div>

              {/* Right Column: Thread & Reply Composer */}
              <div className="lg:col-span-2 space-y-6">
                <div className="surface p-5 md:p-6 space-y-6">
                  <div className="flex items-center justify-between border-b border-border/40 pb-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <MessageSquare className="size-4" />
                      <span>Thread History</span>
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      {threadData?.replies?.length ?? 1} total message(s)
                    </span>
                  </div>

                  {isLoadingThread ? (
                    <div className="py-12 text-center text-sm text-muted-foreground animate-pulse">
                      Loading conversation thread...
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {threadData?.replies && threadData.replies.length > 0 ? (
                        threadData.replies.map((reply: ConsoleReplyItem, idx: number) => {
                          const isChurch = reply.author_type === "church";
                          const isInternal = reply.is_internal === true;
                          const isSuper = reply.author_type === "super_admin";

                          return (
                            <motion.div
                              key={reply.id || idx}
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              className={`p-4 md:p-5 rounded-lg border text-sm leading-relaxed ${
                                isInternal
                                  ? "bg-amber-950/20 border-amber-500/40 text-amber-200"
                                  : isChurch
                                    ? "bg-secondary/40 border-border/80 mr-0 md:mr-6"
                                    : "bg-primary/10 border-primary/20 ml-0 md:ml-6 text-foreground"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3 mb-2 border-b border-border/30 pb-2">
                                <div className="flex items-center gap-2">
                                  {isInternal ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                      <Lock className="size-3" />
                                      <span>Internal Staff Note (Hidden from Church)</span>
                                    </span>
                                  ) : isChurch ? (
                                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-secondary text-foreground">
                                      Church Submitter
                                    </span>
                                  ) : (
                                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-primary text-primary-foreground">
                                      {isSuper ? "Super Admin" : "Support Specialist"}
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {formatDate(reply.created_at)}
                                </span>
                              </div>

                              <p className="whitespace-pre-wrap">{reply.message}</p>
                            </motion.div>
                          );
                        })
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No replies recorded.</p>
                      )}
                    </div>
                  )}

                  {/* Reply Composer */}
                  <div className="pt-5 border-t border-border/60 space-y-3">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setIsInternalNote(false)}
                        className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                          !isInternalNote
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "bg-secondary text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <MessageSquare className="size-3.5" />
                        <span>Reply to Church</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsInternalNote(true)}
                        className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                          isInternalNote
                            ? "bg-amber-600 text-white shadow-sm"
                            : "bg-secondary text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Lock className="size-3.5" />
                        <span>Internal Staff Note</span>
                      </button>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {isInternalNote
                        ? "Visible exclusively to support operators and super admins in this console. Not shared with the church."
                        : "Visible to church administrators. The ticket status will update to In Progress."}
                    </p>

                    <Textarea
                      rows={4}
                      placeholder={
                        isInternalNote
                          ? "Record internal troubleshooting notes, verification steps, or escalation notes..."
                          : "Type your response to the church partner..."
                      }
                      value={replyMessage}
                      onChange={(e) => setReplyMessage(e.target.value)}
                      className="bg-background text-sm"
                    />

                    <div className="flex justify-end">
                      <Button
                        onClick={() => replyMutation.mutate()}
                        disabled={!replyMessage.trim() || replyMutation.isPending}
                        className={`gap-2 ${isInternalNote ? "bg-amber-600 hover:bg-amber-700 text-white" : ""}`}
                      >
                        <Send className="size-4" />
                        <span>
                          {replyMutation.isPending
                            ? "Posting..."
                            : isInternalNote
                              ? "Save Internal Note"
                              : "Send Reply to Church"}
                        </span>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          /* Tab 1a: Main Tickets Queue */
          <div className="space-y-6">
            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="surface p-4 rounded-lg space-y-1">
                <p className="text-xs text-muted-foreground font-semibold uppercase">Open Queue</p>
                <p className="text-2xl font-bold font-display text-emerald-400">{openCount}</p>
              </div>
              <div className="surface p-4 rounded-lg space-y-1">
                <p className="text-xs text-muted-foreground font-semibold uppercase">In Progress</p>
                <p className="text-2xl font-bold font-display text-blue-400">{inProgressCount}</p>
              </div>
              <div className="surface p-4 rounded-lg space-y-1">
                <p className="text-xs text-muted-foreground font-semibold uppercase">
                  Urgent / High
                </p>
                <p className="text-2xl font-bold font-display text-red-400">{urgentCount}</p>
              </div>
              <div className="surface p-4 rounded-lg space-y-1">
                <p className="text-xs text-muted-foreground font-semibold uppercase">Resolved</p>
                <p className="text-2xl font-bold font-display text-violet-400">{resolvedCount}</p>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
              {/* Status pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                {(["all", "open", "in_progress", "resolved", "closed"] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors capitalize shrink-0 ${
                      statusFilter === status
                        ? "bg-primary text-primary-foreground"
                        : "bg-surface text-muted-foreground hover:text-foreground hover:bg-secondary"
                    }`}
                  >
                    {status.replace("_", " ")}
                    {status === "all" && tickets.length > 0 && ` (${tickets.length})`}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                {/* Priority filter */}
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  className="rounded border border-input bg-surface px-2.5 py-1.5 text-xs text-foreground font-medium focus:outline-none"
                >
                  <option value="all">All Priorities</option>
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="normal">Normal</option>
                  <option value="low">Low</option>
                </select>

                {/* Search */}
                <div className="relative w-full sm:w-60">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    placeholder="Search church or subject..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 h-9 text-xs bg-surface"
                  />
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => refetchTickets()}
                  className="size-9 p-0"
                  title="Refresh tickets"
                >
                  <RefreshCw className="size-4 text-muted-foreground" />
                </Button>
              </div>
            </div>

            {/* Tickets Table */}
            {isLoadingTickets ? (
              <div className="surface p-12 text-center text-sm text-muted-foreground animate-pulse">
                Loading all church support tickets...
              </div>
            ) : tickets.length === 0 ? (
              <div className="surface p-12 text-center space-y-3">
                <CheckCircle2 className="mx-auto size-10 text-emerald-400/60" />
                <h3 className="font-semibold text-foreground">Support ticket queue is clear</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  {searchTerm || statusFilter !== "all" || priorityFilter !== "all"
                    ? "No tickets match your filter criteria."
                    : "No pending support tickets across any registered church tenants."}
                </p>
              </div>
            ) : (
              <div className="surface overflow-hidden divide-y divide-border/60">
                {tickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    onClick={() => setSelectedTicketId(ticket.id)}
                    className="p-4 sm:p-5 hover:bg-secondary/40 transition-colors cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider border ${priorityBadgeClass(
                            ticket.priority as TicketPriority,
                          )}`}
                        >
                          {ticket.priority}
                        </span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider border ${statusBadgeClass(
                            ticket.status as TicketStatus,
                          )}`}
                        >
                          {ticket.status.replace("_", " ")}
                        </span>
                        <span className="text-xs font-semibold text-foreground/90">
                          {ticket.tenant_name}
                        </span>
                        <span className="text-xs font-mono text-muted-foreground">
                          ({ticket.tenant_subdomain || "church"})
                        </span>
                      </div>

                      <h4 className="text-sm font-semibold text-foreground hover:text-primary transition-colors truncate">
                        {ticket.subject}
                      </h4>

                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {ticket.description}
                      </p>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-5 shrink-0 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <MessageSquare className="size-3.5" />
                        <span>{ticket.reply_count || 1} msg</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="size-3.5" />
                        <span>{formatDate(ticket.updated_at || ticket.created_at)}</span>
                      </div>
                      <Button variant="ghost" size="sm" className="hidden sm:inline-flex gap-1 h-8">
                        <span>Triage</span>
                        <span>&rarr;</span>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Super Admin Dialog: Add Support Staff */}
      {isSuperAdmin && (
        <Dialog open={isAddStaffOpen} onOpenChange={setIsAddStaffOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display text-xl">Add Support Staff Operator</DialogTitle>
              <DialogDescription>
                Create a dedicated support account with access restricted strictly to tickets and
                church communication.
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                addStaffMutation.mutate();
              }}
              className="space-y-4 pt-2"
            >
              <div className="space-y-1.5">
                <Label htmlFor="staff-user">Operator Username</Label>
                <Input
                  id="staff-user"
                  required
                  maxLength={40}
                  placeholder="e.g. sarah_support"
                  value={staffUsername}
                  onChange={(e) => setStaffUsername(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Will use internal address: {staffUsername || "username"}@ops.menelog.site
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="staff-name">Display Name</Label>
                <Input
                  id="staff-name"
                  required
                  maxLength={60}
                  placeholder="e.g. Sarah Jenkins"
                  value={staffDisplayName}
                  onChange={(e) => setStaffDisplayName(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="staff-pass">Temporary Password (8-72 characters)</Label>
                <Input
                  id="staff-pass"
                  type="password"
                  required
                  minLength={8}
                  maxLength={72}
                  value={staffPassword}
                  onChange={(e) => setStaffPassword(e.target.value)}
                />
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddStaffOpen(false)}
                  disabled={addStaffMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    !staffUsername.trim() ||
                    !staffDisplayName.trim() ||
                    staffPassword.length < 8 ||
                    addStaffMutation.isPending
                  }
                  className="gap-2"
                >
                  {addStaffMutation.isPending ? "Creating..." : "Create Support Account"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
