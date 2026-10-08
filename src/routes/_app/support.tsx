import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  LifeBuoy,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Send,
  ArrowLeft,
  Search,
  Filter,
  Shield,
  HelpCircle,
  Zap,
  Radio,
  Bell,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useTenant } from "@/hooks/useTenant";
import { UpgradePanel } from "@/components/FeatureGate";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SupportSmsConfigPanel } from "@/components/SupportSmsConfigPanel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listChurchTickets,
  getChurchTicketThread,
  submitChurchTicket,
  replyChurchTicket,
} from "@/lib/support.functions";

export const Route = createFileRoute("/_app/support")({
  head: () => ({
    meta: [
      { title: "Support & Helpdesk — Mene:Log" },
      {
        name: "description",
        content: "Submit and track support tickets directly with Mene:Log technical operations.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ChurchSupportPage,
});

type TicketPriority = "low" | "normal" | "high" | "urgent";
type TicketStatus = "open" | "in_progress" | "resolved" | "closed";

type ChurchReplyItem = {
  id: string;
  author_type: "church" | "support" | "super_admin";
  message: string;
  created_at: string;
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

export function ChurchSupportPage() {
  const { tenant, isAdmin, isOwner, can } = useTenant();
  const qc = useQueryClient();

  const fetchTicketsFn = useServerFn(listChurchTickets);
  const fetchThreadFn = useServerFn(getChurchTicketThread);
  const submitTicketFn = useServerFn(submitChurchTicket);
  const replyTicketFn = useServerFn(replyChurchTicket);

  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isSmsDialogOpen, setIsSmsDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Form states for new ticket
  const [newSubject, setNewSubject] = useState("");
  const [newPriority, setNewPriority] = useState<TicketPriority>("normal");
  const [newDescription, setNewDescription] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");

  // Query branches list for ticket routing
  const { data: branchList = [] } = useQuery({
    queryKey: ["church-branches-list", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data } = await supabase
        .from("branches")
        .select("id, name, city, is_default")
        .eq("tenant_id", tenant.id)
        .order("is_default", { ascending: false });
      return data ?? [];
    },
    enabled: !!tenant?.id,
  });

  // Reply state & optimistic state for instant message delivery
  const [replyMessage, setReplyMessage] = useState("");
  const [isSupportTyping, setIsSupportTyping] = useState(false);
  const [optimisticReplies, setOptimisticReplies] = useState<
    Array<{
      id: string;
      author_type: "church" | "support" | "super_admin";
      message: string;
      created_at: string;
      pending?: boolean;
    }>
  >([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Helper for auth headers
  async function getAuthHeader() {
    const { data } = await supabase.auth.getSession();
    return {
      Authorization: `Bearer ${data.session?.access_token ?? ""}`,
    };
  }

  // Query tickets with automatic 2s polling
  const { data: tickets = [], isLoading: isLoadingTickets } = useQuery({
    queryKey: ["church-support-tickets", tenant?.id],
    enabled: !!tenant?.id && isAdmin && can("support"),
    refetchInterval: 2000,
    queryFn: async () => {
      if (!tenant?.id) return [];
      const headers = await getAuthHeader();
      return fetchTicketsFn({
        data: { tenant_id: tenant.id },
        headers,
      });
    },
  });

  // Query active thread with instant 1s polling so responses arrive with 0 refresh required
  const { data: threadData, isLoading: isLoadingThread } = useQuery({
    queryKey: ["church-support-thread", tenant?.id, selectedTicketId],
    enabled: !!tenant?.id && !!selectedTicketId && isAdmin,
    refetchInterval: 1000,
    refetchIntervalInBackground: true,
    queryFn: async () => {
      if (!tenant?.id || !selectedTicketId) return null;
      const headers = await getAuthHeader();
      return fetchThreadFn({
        data: { tenant_id: tenant.id, ticket_id: selectedTicketId },
        headers,
      });
    },
  });

  // Realtime subscription: live updates directly on new replies
  useEffect(() => {
    if (!selectedTicketId) return;

    const channel = supabase
      .channel(`support-chat-live-${selectedTicketId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "support_ticket_replies",
          filter: `ticket_id=eq.${selectedTicketId}`,
        },
        () => {
          qc.invalidateQueries({
            queryKey: ["church-support-thread", tenant?.id, selectedTicketId],
          });
          qc.invalidateQueries({
            queryKey: ["church-support-tickets", tenant?.id],
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedTicketId, tenant?.id, qc]);

  // Combine server replies with any pending optimistic replies
  const allReplies = useMemo(() => {
    const serverList = (threadData?.replies ?? []) as ChurchReplyItem[];
    const serverTexts = new Set(serverList.map((r) => r.message.trim()));
    const unconfirmed = optimisticReplies.filter((opt) => !serverTexts.has(opt.message.trim()));
    return [...serverList, ...unconfirmed];
  }, [threadData?.replies, optimisticReplies]);

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    if (selectedTicketId && (allReplies.length > 0 || isSupportTyping)) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [allReplies.length, selectedTicketId, isSupportTyping]);

  // Submit ticket mutation
  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error("Church account unavailable");
      const headers = await getAuthHeader();
      return submitTicketFn({
        data: {
          tenant_id: tenant.id,
          branch_id: selectedBranchId || null,
          subject: newSubject.trim(),
          description: newDescription.trim(),
          priority: newPriority,
        },
        headers,
      });
    },
    onSuccess: (res) => {
      toast.success("Support ticket submitted! Instant response connected.");
      setIsNewDialogOpen(false);
      setNewSubject("");
      setNewDescription("");
      setNewPriority("normal");
      setSelectedBranchId("");
      qc.invalidateQueries({ queryKey: ["church-support-tickets"] });
      if (res?.ticketId) {
        setSelectedTicketId(res.ticketId);
      }
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Failed to submit support ticket");
    },
  });

  // Reply mutation with immediate optimistic update and 1-2s instant support response
  const replyMutation = useMutation({
    mutationFn: async (messageText: string) => {
      if (!tenant?.id || !selectedTicketId) throw new Error("Missing ticket details");
      const headers = await getAuthHeader();
      return replyTicketFn({
        data: {
          tenant_id: tenant.id,
          ticket_id: selectedTicketId,
          message: messageText,
        },
        headers,
      });
    },
    onSuccess: () => {
      setIsSupportTyping(false);
      qc.invalidateQueries({ queryKey: ["church-support-thread", tenant?.id, selectedTicketId] });
      qc.invalidateQueries({ queryKey: ["church-support-tickets", tenant?.id] });
    },
    onError: (err: unknown) => {
      setIsSupportTyping(false);
      toast.error(err instanceof Error ? err.message : "Failed to send reply");
      // Remove failed optimistic reply if error
      setOptimisticReplies((prev) => prev.slice(0, -1));
    },
  });

  function handleSendReply() {
    const text = replyMessage.trim();
    if (!text || !selectedTicketId || replyMutation.isPending) return;
    if (selectedTicket?.status === "resolved" || selectedTicket?.status === "closed") {
      toast.error("This ticket has been resolved and closed.");
      return;
    }

    // Immediately show user message with 0ms delay!
    const tempId = `temp-${Date.now()}`;
    setOptimisticReplies((prev) => [
      ...prev,
      {
        id: tempId,
        author_type: "church",
        message: text,
        created_at: new Date().toISOString(),
        pending: false,
      },
    ]);
    setReplyMessage("");

    replyMutation.mutate(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendReply();
    }
  }

  if (!can("support")) {
    return <UpgradePanel feature="support" canUpgrade={isOwner} />;
  }

  if (!isAdmin) {
    return (
      <main className="p-6 md:p-10">
        <div className="surface mx-auto max-w-lg p-8 text-center">
          <Shield className="mx-auto size-10 text-muted-foreground" />
          <h2 className="mt-4 font-display text-xl font-bold">Admin Access Required</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Only church owners and church administrators can manage support tickets.
          </p>
        </div>
      </main>
    );
  }

  // Filtered tickets
  const filteredTickets = tickets.filter((t) => {
    const matchesStatus = statusFilter === "all" || t.status === statusFilter;
    const matchesSearch =
      !searchTerm ||
      t.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.id.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const selectedTicket = selectedTicketId
    ? tickets.find((t) => t.id === selectedTicketId) || threadData?.ticket
    : null;

  return (
    <main className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-5">
        <div>
          <p className="text-eyebrow">Assistance & Operations</p>
          <h1 className="text-display mt-1">Support & Helpdesk</h1>
          <p className="text-subtitle mt-1">
            Open tickets, get operational guidance, and communicate directly with the Mene:Log team.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={() => setIsSmsDialogOpen(true)}
            className="flex items-center gap-2 rounded-xl border-dashed"
          >
            <Bell className="size-4 text-primary" />
            <span>SMS Notifications</span>
          </Button>
          <Button
            onClick={() => setIsNewDialogOpen(true)}
            className="flex items-center gap-2 shadow-sm rounded-xl"
          >
            <Plus className="size-4" />
            <span>New Support Ticket</span>
          </Button>
        </div>
      </div>

      {/* Main View: Split Master-Detail or Full-Width Thread */}
      {selectedTicketId && selectedTicket ? (
        /* Conversation Thread View */
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Thread Header Bar */}
          <div className="surface p-5 md:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedTicketId(null)}
                className="gap-2 text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-4" />
                <span>Back to All Tickets</span>
              </Button>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider border ${priorityBadgeClass(
                    selectedTicket.priority as TicketPriority,
                  )}`}
                >
                  {selectedTicket.priority} Priority
                </span>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider border ${statusBadgeClass(
                    selectedTicket.status as TicketStatus,
                  )}`}
                >
                  {selectedTicket.status.replace("_", " ")}
                </span>
              </div>
            </div>

            <div>
              <h2 className="text-xl md:text-2xl font-bold font-display text-foreground">
                {selectedTicket.subject}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <span>
                  Ticket ID:{" "}
                  <span className="font-mono text-foreground/80">{selectedTicket.id}</span>
                </span>
                <span>•</span>
                <span>Submitted: {formatDate(selectedTicket.created_at)}</span>
                {selectedTicket.resolved_at && (
                  <>
                    <span>•</span>
                    <span className="text-emerald-400 font-medium">
                      Resolved: {formatDate(selectedTicket.resolved_at)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Conversation History */}
          <div className="surface p-5 md:p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <MessageSquare className="size-4" />
                <span>Live Conversation</span>
              </h3>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-500">
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Instant Real-Time Sync</span>
              </span>
            </div>

            {isLoadingThread && allReplies.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground animate-pulse">
                Loading messages...
              </div>
            ) : (
              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                {allReplies.length > 0 ? (
                  allReplies.map((reply, idx) => {
                    const isChurch = reply.author_type === "church";
                    const isPending = (reply as { pending?: boolean }).pending;
                    return (
                      <motion.div
                        key={reply.id || idx}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`p-4 md:p-5 rounded-xl border text-sm leading-relaxed ${
                          isChurch
                            ? "bg-secondary/50 border-border/80 ml-0 md:mr-10"
                            : "bg-primary/10 border-primary/25 mr-0 md:ml-10 text-foreground"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3 mb-2 border-b border-border/40 pb-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-xs font-semibold px-2 py-0.5 rounded ${
                                isChurch
                                  ? "bg-secondary text-foreground"
                                  : "bg-primary text-primary-foreground font-bold"
                              }`}
                            >
                              {isChurch ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <span>
                                    {selectedTicket?.church_label ||
                                      (tenant?.name
                                        ? tenant.parent_tenant_id
                                          ? `${tenant.name} [BRE]`
                                          : `${tenant.name} [HQR]`
                                        : "Your Church")}
                                  </span>
                                </span>
                              ) : (
                                "Mene:Log Support Team"
                              )}
                            </span>
                            {isPending && (
                              <span className="text-[10px] text-amber-500 font-mono animate-pulse">
                                Sending…
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(reply.created_at)}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap text-foreground/90">{reply.message}</p>
                      </motion.div>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground italic py-4 text-center">
                    No replies yet. Send a message below to reach technical support.
                  </p>
                )}

                {/* Instant Typing Indicator */}
                {isSupportTyping && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mr-0 md:ml-10 p-4 rounded-xl border border-primary/25 bg-primary/10 flex items-center gap-3 text-xs text-primary"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
                      <span className="size-2 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
                      <span className="size-2 rounded-full bg-primary animate-bounce" />
                    </div>
                    <span className="font-semibold text-foreground">
                      Mene:Log Support Desk is typing reply…
                    </span>
                  </motion.div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}

            {/* Reply Composer or Resolved Lock Banner */}
            {selectedTicket.status === "resolved" || selectedTicket.status === "closed" ? (
              <div className="pt-4 border-t border-border/60">
                <div className="rounded-2xl border border-violet-500/30 bg-violet-500/10 p-5 text-center space-y-2.5">
                  <div className="flex items-center justify-center gap-2 text-violet-400 font-bold text-sm">
                    <CheckCircle2 className="size-5" />
                    <span>This Support Ticket has been Resolved</span>
                  </div>
                  <p className="text-xs text-muted-foreground max-w-lg mx-auto leading-relaxed">
                    This ticket has been marked as resolved. The discussion is closed for new replies.
                    You can review the full conversation history above at any time. If you need assistance with a new matter, please create a new support ticket.
                  </p>
                  <div className="pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedTicketId(null);
                        setIsNewDialogOpen(true);
                      }}
                      className="text-xs gap-1.5 h-8 border-violet-500/40 text-violet-300 hover:bg-violet-500/20"
                    >
                      <Plus className="size-3.5" />
                      <span>Open New Support Ticket</span>
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="pt-4 border-t border-border/60">
                <div className="flex items-center justify-between mb-2">
                  <Label htmlFor="reply-box" className="text-sm font-semibold">
                    Send Instant Reply
                  </Label>
                  <span className="text-[11px] text-muted-foreground">
                    Press{" "}
                    <kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">Enter</kbd> to
                    send,{" "}
                    <kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">
                      Shift+Enter
                    </kbd>{" "}
                    for new line
                  </span>
                </div>
                <Textarea
                  id="reply-box"
                  rows={3}
                  placeholder="Type your message here..."
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full bg-background"
                />
                <div className="mt-3 flex justify-end items-center">
                  <Button
                    onClick={handleSendReply}
                    disabled={!replyMessage.trim()}
                    className="gap-2"
                  >
                    <Send className="size-4" />
                    <span>Send Message</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      ) : (
        /* Ticket Queue / Master List */
        <div className="space-y-4">
          {/* Controls: Filter and Search */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
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

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search tickets..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
          </div>

          {/* Tickets Table / Cards */}
          {isLoadingTickets ? (
            <div className="surface p-12 text-center text-sm text-muted-foreground animate-pulse">
              Loading support tickets...
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="surface p-12 text-center space-y-3">
              <HelpCircle className="mx-auto size-10 text-muted-foreground/60" />
              <h3 className="font-semibold text-foreground">No support tickets found</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                {searchTerm || statusFilter !== "all"
                  ? "No tickets match your filter criteria. Try clearing search filters."
                  : "Need assistance with Mene:Log features, attendee check-ins, or custom church setup? Submit your first ticket."}
              </p>
              {!searchTerm && statusFilter === "all" && (
                <Button onClick={() => setIsNewDialogOpen(true)} className="gap-2 mt-2">
                  <Plus className="size-4" />
                  <span>Create Ticket</span>
                </Button>
              )}
            </div>
          ) : (
            <div className="surface overflow-hidden divide-y divide-border/50">
              {filteredTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  onClick={() => setSelectedTicketId(ticket.id)}
                  className="p-4 sm:p-5 hover:bg-secondary/40 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4"
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
                      <span className="text-xs font-mono text-muted-foreground">
                        #{ticket.id.slice(0, 8)}
                      </span>
                    </div>

                    <h4 className="text-base font-semibold text-foreground truncate hover:text-primary transition-colors">
                      {ticket.subject}
                    </h4>

                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {ticket.description}
                    </p>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-5 shrink-0 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <MessageSquare className="size-3.5" />
                      <span>{ticket.reply_count || 1} msg</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="size-3.5" />
                      <span>{formatDate(ticket.updated_at || ticket.created_at)}</span>
                    </div>
                    <Button variant="ghost" size="sm" className="hidden sm:inline-flex">
                      Open &rarr;
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* New Ticket Modal Dialog */}
      <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Submit New Support Ticket</DialogTitle>
            <DialogDescription>
              Describe your issue or inquiry. Our support team will receive an email alert and reply
              promptly.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitMutation.mutate();
            }}
            className="space-y-4 pt-2"
          >
            <div className="space-y-2">
              <Label htmlFor="ticket-subject">Subject</Label>
              <Input
                id="ticket-subject"
                required
                maxLength={200}
                placeholder="e.g. Issue scanning QR check-ins during Sunday service"
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ticket-priority">Priority Level</Label>
              <select
                id="ticket-priority"
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as TicketPriority)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="low">Low — General questions, feedback</option>
                <option value="normal">Normal — Routine request, standard inquiry</option>
                <option value="high">High — Key church feature impeded</option>
                <option value="urgent">
                  Urgent — Live service disruption or critical blockage
                </option>
              </select>
            </div>

            {branchList.length > 1 && (
              <div className="space-y-2">
                <Label htmlFor="ticket-branch">Originating Branch (Optional)</Label>
                <select
                  id="ticket-branch"
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">Main Church (All Branches)</option>
                  {branchList.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} {b.city ? `(${b.city})` : ""} {b.is_default ? "— Default" : ""}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground">
                  If selected, SMS notifications route directly to this branch's customized
                  recipient numbers.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="ticket-desc">Detailed Description</Label>
              <Textarea
                id="ticket-desc"
                required
                rows={5}
                placeholder="Provide details, steps taken, dates, or error messages encountered..."
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsNewDialogOpen(false)}
                disabled={submitMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!newSubject.trim() || !newDescription.trim() || submitMutation.isPending}
                className="gap-2"
              >
                {submitMutation.isPending ? "Submitting..." : "Submit Ticket"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* SMS Configuration Modal Dialog */}
      <Dialog open={isSmsDialogOpen} onOpenChange={setIsSmsDialogOpen}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden border bg-background/95 backdrop-blur-xl">
          {tenant?.id && (
            <SupportSmsConfigPanel
              tenantId={tenant.id}
              className="border-none shadow-none"
              onSaved={() => setIsSmsDialogOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
