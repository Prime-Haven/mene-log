import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useTenant } from "@/hooks/useTenant";
import { supabase } from "@/integrations/supabase/client";
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
  const { tenant, isAdmin } = useTenant();
  const qc = useQueryClient();

  const fetchTicketsFn = useServerFn(listChurchTickets);
  const fetchThreadFn = useServerFn(getChurchTicketThread);
  const submitTicketFn = useServerFn(submitChurchTicket);
  const replyTicketFn = useServerFn(replyChurchTicket);

  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Form states for new ticket
  const [newSubject, setNewSubject] = useState("");
  const [newPriority, setNewPriority] = useState<TicketPriority>("normal");
  const [newDescription, setNewDescription] = useState("");

  // Reply state
  const [replyMessage, setReplyMessage] = useState("");

  // Helper for auth headers
  async function getAuthHeader() {
    const { data } = await supabase.auth.getSession();
    return {
      Authorization: `Bearer ${data.session?.access_token ?? ""}`,
    };
  }

  // Query tickets
  const { data: tickets = [], isLoading: isLoadingTickets } = useQuery({
    queryKey: ["church-support-tickets", tenant?.id],
    enabled: !!tenant?.id && isAdmin,
    queryFn: async () => {
      if (!tenant?.id) return [];
      const headers = await getAuthHeader();
      return fetchTicketsFn({
        data: { tenant_id: tenant.id },
        headers,
      });
    },
  });

  // Query active thread
  const { data: threadData, isLoading: isLoadingThread } = useQuery({
    queryKey: ["church-support-thread", tenant?.id, selectedTicketId],
    enabled: !!tenant?.id && !!selectedTicketId && isAdmin,
    queryFn: async () => {
      if (!tenant?.id || !selectedTicketId) return null;
      const headers = await getAuthHeader();
      return fetchThreadFn({
        data: { tenant_id: tenant.id, ticket_id: selectedTicketId },
        headers,
      });
    },
  });

  // Submit ticket mutation
  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error("Church account unavailable");
      const headers = await getAuthHeader();
      return submitTicketFn({
        data: {
          tenant_id: tenant.id,
          subject: newSubject.trim(),
          description: newDescription.trim(),
          priority: newPriority,
        },
        headers,
      });
    },
    onSuccess: (res) => {
      toast.success("Support ticket submitted. Our operations team has been notified.");
      setIsNewDialogOpen(false);
      setNewSubject("");
      setNewDescription("");
      setNewPriority("normal");
      qc.invalidateQueries({ queryKey: ["church-support-tickets"] });
      if (res?.ticketId) {
        setSelectedTicketId(res.ticketId);
      }
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Failed to submit support ticket");
    },
  });

  // Reply mutation
  const replyMutation = useMutation({
    mutationFn: async () => {
      if (!tenant?.id || !selectedTicketId) throw new Error("Missing ticket details");
      const headers = await getAuthHeader();
      return replyTicketFn({
        data: {
          tenant_id: tenant.id,
          ticket_id: selectedTicketId,
          message: replyMessage.trim(),
        },
        headers,
      });
    },
    onSuccess: () => {
      toast.success("Reply sent to Mene:Log support");
      setReplyMessage("");
      qc.invalidateQueries({ queryKey: ["church-support-thread", tenant?.id, selectedTicketId] });
      qc.invalidateQueries({ queryKey: ["church-support-tickets", tenant?.id] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Failed to send reply");
    },
  });

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
        <div className="flex items-center gap-3">
          <Button
            onClick={() => setIsNewDialogOpen(true)}
            className="flex items-center gap-2 shadow-sm"
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
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <MessageSquare className="size-4" />
              <span>Conversation Thread</span>
            </h3>

            {isLoadingThread ? (
              <div className="py-12 text-center text-sm text-muted-foreground animate-pulse">
                Loading messages...
              </div>
            ) : (
              <div className="space-y-4">
                {threadData?.replies && threadData.replies.length > 0 ? (
                  threadData.replies.map((reply: ChurchReplyItem, idx: number) => {
                    const isChurch = reply.author_type === "church";
                    return (
                      <motion.div
                        key={reply.id || idx}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`p-4 md:p-5 rounded-lg border text-sm leading-relaxed ${
                          isChurch
                            ? "bg-secondary/40 border-border/80 ml-0 md:mr-10"
                            : "bg-primary/10 border-primary/20 mr-0 md:ml-10 text-foreground"
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
                              {isChurch ? "Your Church" : "Mene:Log Support Team"}
                            </span>
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
                  <p className="text-sm text-muted-foreground italic">No replies yet.</p>
                )}
              </div>
            )}

            {/* Reply Composer */}
            <div className="pt-4 border-t border-border/60">
              <Label htmlFor="reply-box" className="text-sm font-semibold">
                Send Reply to Support Team
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                Our support staff will be alerted immediately via email and will review your update.
              </p>
              <Textarea
                id="reply-box"
                rows={4}
                placeholder="Type your reply or additional details..."
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
                className="w-full bg-background"
              />
              <div className="mt-3 flex justify-between items-center">
                {selectedTicket.status === "resolved" && (
                  <p className="text-xs text-amber-400">
                    * Sending a reply will re-open this resolved ticket.
                  </p>
                )}
                <div className="ml-auto">
                  <Button
                    onClick={() => replyMutation.mutate()}
                    disabled={!replyMessage.trim() || replyMutation.isPending}
                    className="gap-2"
                  >
                    <Send className="size-4" />
                    <span>{replyMutation.isPending ? "Sending..." : "Send Reply"}</span>
                  </Button>
                </div>
              </div>
            </div>
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
    </main>
  );
}
