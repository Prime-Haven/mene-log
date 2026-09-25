import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Input = z.object({ question: z.string().trim().min(2).max(500) });

const PRODUCT_ANSWERS = [
  {
    terms: ["price", "pricing", "plan", "package", "cost", "trial"],
    answer: "Mene:Log has Free, Standard, Pro and Premium plans. Paid plans include a 14-day trial, and yearly billing saves 8% on Standard, 10% on Pro and 15% on Premium.",
  },
  {
    terms: ["qr", "check-in", "check in", "attendance"],
    answer: "Mene:Log supports QR attendance and permanent church check-in links at menelog.site/c/your-church-name. Attendance can be reviewed in reports by authorized church staff.",
  },
  {
    terms: ["member", "membership", "record", "register"],
    answer: "The member registry keeps church membership records, attendance and follow-up information together. Access is limited by each staff member’s church role.",
  },
  {
    terms: ["branch", "leader", "leadership"],
    answer: "Pro includes leader access and church structure tools. Premium adds branch management so a head office can oversee linked branches while each branch operates separately.",
  },
  {
    terms: ["security", "privacy", "private", "data"],
    answer: "Mene:Log separates each church’s records and limits access by role. Prime Haven oversight uses platform and aggregate information rather than individual church-member records.",
  },
  {
    terms: ["email", "message", "broadcast", "communication"],
    answer: "Authorized church staff can use Mene:Log for email communication and broadcasts when their plan includes those features.",
  },
];

function productAnswer(question: string) {
  const normalized = question.toLowerCase();
  return PRODUCT_ANSWERS.find(({ terms }) => terms.some((term) => normalized.includes(term)))?.answer
    ?? "Mene:Log helps churches manage membership, QR attendance, services, reports, follow-up, leaders and branches. For account-specific help, sign in and use Ask Mene:Log from your church dashboard.";
}

export const Route = createFileRoute("/api/public/product-help")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const input = Input.safeParse(await request.json());
          if (!input.success) return Response.json({ error: "Ask one question of up to 500 characters." }, { status: 400 });

          // Public help is intentionally answered from a fixed, server-owned
          // product guide. Anonymous visitors cannot trigger metered AI usage.
          return Response.json({ answer: productAnswer(input.data.question) });
        } catch (error) {
          console.error("[product-help] request failed", error instanceof Error ? error.message : error);
          return Response.json({ error: "Mene:Log help is temporarily unavailable." }, { status: 500 });
        }
      },
    },
  },
});