import { createFileRoute } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BrainCircuit, LockKeyhole, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Reasoning, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { PageTransition, StaggerItem, StaggerList } from "@/components/Animated";
import { SafeRender } from "@/components/SafeRender";

export const Route = createFileRoute("/_app/ask-mene")({
  head: () => ({
    meta: [{ title: "Ask Mene:Log — Mene:Log" }, { name: "robots", content: "noindex" }],
  }),
  component: AskMene,
  errorComponent: ({ reset }) => (
    <div className="surface p-8 text-center">
      <h1 className="font-display text-xl font-bold">Ask Mene:Log hit a snag</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Your conversation is saved. Reload to continue.
      </p>
      <Button
        className="mt-4"
        onClick={() => {
          reset();
          window.location.reload();
        }}
      >
        Reload Ask Mene:Log
      </Button>
    </div>
  ),
});

const starters = [
  "Who came to our most recent church service?",
  "How do I set up QR check-in and scan passes?",
  "How do I register a new member and generate their passcard?",
  "Summarize our attendance and first-timer growth this month",
];

const textOf = (message: UIMessage) =>
  message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");

function AskMene() {
  const { tenant, isAdmin } = useTenant();
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");

  const history = useQuery({
    queryKey: ["ask-mene-history", tenant?.id],
    enabled: !!tenant && isAdmin,
    queryFn: async () => {
      const { data: conversation, error } = await supabase
        .from("ask_mene_conversations")
        .select("id")
        .eq("tenant_id", tenant!.id)
        .maybeSingle();
      if (error) throw error;
      if (!conversation) return [] as UIMessage[];
      const { data, error: messageError } = await supabase
        .from("ask_mene_messages")
        .select("id,role,content")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: true })
        .limit(100);
      if (messageError) throw messageError;
      return (data ?? []).map((row) => ({
        id: row.id,
        role: row.role as "user" | "assistant",
        parts: [{ type: "text" as const, text: row.content }],
      }));
    },
  });

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/public/ask-mene",
        headers: async () => {
          const { data } = await supabase.auth.getSession();
          return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
        },
        body: { tenantId: tenant?.id },
      }),
    [tenant?.id],
  );

  const chat = useChat({
    id: tenant?.id ? `ask-mene-${tenant.id}` : "ask-mene",
    messages: history.data ?? [],
    transport,
    onError: (error) => toast.error(error.message || "Ask Mene is unavailable."),
    onFinish: () => queryClient.invalidateQueries({ queryKey: ["ask-mene-history", tenant?.id] }),
  });

  async function ask(text: string) {
    const question = text.trim();
    if (
      !question ||
      question.length > 800 ||
      chat.status === "streaming" ||
      chat.status === "submitted"
    )
      return;
    setInput("");
    await chat.sendMessage({ text: question });
  }

  async function clearHistory() {
    if (!tenant || !window.confirm("Clear this church's shared Ask Mene conversation?")) return;
    const { data: conversation } = await supabase
      .from("ask_mene_conversations")
      .select("id")
      .eq("tenant_id", tenant.id)
      .maybeSingle();
    if (conversation) {
      const { error } = await supabase
        .from("ask_mene_messages")
        .delete()
        .eq("conversation_id", conversation.id);
      if (error) {
        toast.error("Could not clear the conversation.");
        return;
      }
    }
    chat.setMessages([]);
    toast.success("Conversation cleared");
    return;
  }

  if (!isAdmin)
    return (
      <div className="surface p-8 text-center">
        <LockKeyhole className="mx-auto size-7 text-muted-foreground" />
        <h1 className="mt-3 font-display text-xl font-bold">Administrator access required</h1>
      </div>
    );

  const busy = chat.status === "streaming" || chat.status === "submitted";
  return (
    <PageTransition className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-eyebrow">Interactive Ministry Assistant</p>
          <h1 className="mt-2 font-display text-2xl font-bold">Ask Mene AI (ManyChat)</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Ask about your church attendance, attendees who came, member records, or get step-by-step guidance on your account.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={clearHistory}
          disabled={!chat.messages.length || busy}
        >
          <Trash2 className="size-4" /> Clear history
        </Button>
      </div>
      <div className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
        <p>
          Ask Mene helps you with your church services, attendees, congregation directory, and step-by-step account settings in real time.
        </p>
      </div>
      <div className="surface flex h-[min(680px,calc(100svh-250px))] min-h-[520px] flex-col overflow-hidden">
        <Conversation>
          <ConversationContent className="mx-auto w-full max-w-3xl px-4 py-7 sm:px-7">
            {history.isLoading ? (
              <div className="grid h-64 place-items-center">
                <Shimmer>Loading your conversation…</Shimmer>
              </div>
            ) : chat.messages.length === 0 ? (
              <ConversationEmptyState
                icon={<BrainCircuit className="size-8" />}
                title="How can I assist your church today?"
                description="Ask about who came to services, attendance statistics, or ask how to manage your Mene:Log account."
              >
                <div className="space-y-5">
                  <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <Sparkles className="size-5" />
                  </span>
                  <StaggerList className="grid gap-2 sm:grid-cols-2">
                    {starters.map((starter) => (
                      <StaggerItem key={starter}>
                        <Button
                          variant="outline"
                          className="h-full w-full justify-start whitespace-normal p-3 text-left text-xs"
                          onClick={() => ask(starter)}
                        >
                          {starter}
                        </Button>
                      </StaggerItem>
                    ))}
                  </StaggerList>
                </div>
              </ConversationEmptyState>
            ) : (
              chat.messages.map((message) => (
                <Message key={message.id} from={message.role}>
                  <MessageContent>
                    {message.role === "assistant" ? (
                      <SafeRender
                        resetKey={busy ? "live" : textOf(message).length}
                        fallback={<p className="whitespace-pre-wrap text-sm">{textOf(message)}</p>}
                      >
                        <MessageResponse
                          isAnimating={busy && message.id === chat.messages.at(-1)?.id}
                        >
                          {textOf(message)}
                        </MessageResponse>
                      </SafeRender>
                    ) : (
                      textOf(message)
                    )}
                  </MessageContent>
                </Message>
              ))
            )}
            {chat.status === "submitted" && (
              <Reasoning isStreaming>
                <ReasoningTrigger
                  getThinkingMessage={() => <Shimmer>Consulting your church assistant…</Shimmer>}
                />
              </Reasoning>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
        {chat.error && (
          <div className="border-t border-destructive/20 bg-destructive/5 px-5 py-2 text-xs text-destructive">
            {chat.error.message}
          </div>
        )}
        <div className="border-t bg-background/95 p-3 backdrop-blur sm:p-4">
          <PromptInput className="mx-auto max-w-3xl" onSubmit={({ text }) => ask(text)}>
            <PromptInputBody>
              <PromptInputTextarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                maxLength={800}
                placeholder="Ask about attendance, first-timers, demographics or package usage…"
              />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                <span className="px-2 text-[11px] text-muted-foreground">
                  {input.length}/800 · 20 questions/hour
                </span>
              </PromptInputTools>
              <PromptInputSubmit
                status={chat.status}
                onStop={chat.stop}
                disabled={!input.trim() && !busy}
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </PageTransition>
  );
}
