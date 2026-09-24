import { FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { MessageCircle, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Msg = { role: "user" | "assistant"; text: string };

export function PublicAskMene() {
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    const onScroll = () => setVisible(window.scrollY > window.innerHeight * 1.1);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [messages, busy]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = question.trim();
    if (!value || value.length > 500 || busy) return;
    setBusy(true);
    setError("");
    setQuestion("");
    setMessages((m) => [...m, { role: "user", text: value }]);
    try {
      const response = await fetch("/api/public/product-help", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: value }),
      });
      const body = (await response.json()) as { answer?: string; error?: string };
      if (!response.ok || !body.answer) throw new Error(body.error ?? "Mene:Log help is unavailable right now.");
      setMessages((m) => [...m, { role: "assistant", text: body.answer! }]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Mene:Log help is unavailable right now.");
    } finally {
      setBusy(false);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <>
      <AnimatePresence>
        {visible && !open && (
          <motion.div
            key="ask-btn"
            initial={reduceMotion ? false : { opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            className="fixed bottom-5 right-5 z-40 sm:bottom-7 sm:right-7"
          >
            <Button onClick={() => setOpen(true)} className="h-12 gap-2 rounded-full px-5 shadow-xl" aria-label="Ask Mene:Log">
              <Sparkles className="size-4" /> Ask Mene:Log
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {open && (
          <motion.aside
            key="ask-panel"
            role="dialog"
            aria-label="Ask Mene:Log"
            initial={reduceMotion ? false : { opacity: 0, x: 40, y: 30, scale: 0.92 }}
            animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, y: 30, scale: 0.92 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            style={{ transformOrigin: "bottom right" }}
            className="fixed bottom-4 right-4 top-20 z-50 flex w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-3xl border bg-background shadow-2xl sm:bottom-7 sm:right-7"
          >
            <div className="relative flex items-start justify-between gap-3 bg-deep px-5 py-5 text-deep-foreground">
              <div>
                <p className="flex items-center gap-2 font-semibold"><MessageCircle className="size-5 text-primary" /> Ask Mene:Log</p>
                <p className="mt-1 text-xs text-deep-foreground/65">Packages, check-in, security, onboarding and more.</p>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-full p-1.5 text-deep-foreground/70 transition hover:bg-deep-foreground/10 hover:text-deep-foreground"><X className="size-4" /></button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.length === 0 && <p className="rounded-2xl bg-muted/50 p-3 text-sm text-muted-foreground">Hi! Ask me anything about Mene:Log — for example, "How does QR check-in work?"</p>}
              {messages.map((m, i) => (
                <motion.div key={i} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${m.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-muted/60"}`}>
                  {m.text}
                </motion.div>
              ))}
              {busy && <p className="text-xs text-muted-foreground animate-pulse">Thinking…</p>}
              {error && <p className="rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
              <div ref={endRef} />
            </div>
            <form onSubmit={submit} className="flex items-end gap-2 border-t p-3">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(e); } }}
                maxLength={500}
                rows={2}
                aria-label="Your question"
                placeholder="Type your question…"
                className="flex-1 resize-none rounded-2xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/30"
              />
              <Button type="submit" size="icon" className="rounded-full" disabled={busy || !question.trim()} aria-label="Send"><Send className="size-4" /></Button>
            </form>
          </motion.aside>
        )}
      </AnimatePresence>
    </>,
    document.body,
  );
}
