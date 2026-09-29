import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Input = z.object({ question: z.string().trim().min(2).max(500) });

const PRODUCT_ANSWERS = [
  {
    terms: ["price", "pricing", "plan", "package", "cost", "much", "pay", "subscription"],
    answer:
      "Mene:Log has Free, Standard, Pro and Premium plans. Paid plans include a 30-day trial, and yearly billing saves 8% on Standard, 10% on Pro and 15% on Premium. You can see the full breakdown on the pricing section of the homepage.",
  },
  {
    terms: ["free", "trial"],
    answer:
      "The Free plan is free forever — no card needed. Paid plans start with a 30-day trial; if a trial ends without payment the church simply returns to the Free plan and keeps its records.",
  },
  {
    terms: ["qr", "check-in", "check in", "checkin", "attendance"],
    answer:
      "Members check in by scanning a QR code or through the church's permanent check-in link at menelog.site/c/your-church-name. Authorized staff can also record attendance manually, and everything appears in the attendance reports.",
  },
  {
    terms: ["member", "membership", "record", "register", "directory"],
    answer:
      "The member registry keeps membership records, attendance history and follow-up notes together. Access is limited by each staff member's church role, so people only see what their role allows.",
  },
  {
    terms: ["branch", "branches", "campus", "location"],
    answer:
      "Premium adds branch management: a head office can create and oversee linked branches, each with its own check-in address, administrators and dashboard, while the head office sees the combined picture.",
  },
  {
    terms: ["leader", "leadership", "pastor", "admin", "role", "staff"],
    answer:
      "Churches can invite leaders and assign roles such as owner, church admin or leader. Each role sees only the tools and records it needs, and leaders get their own access to the areas they oversee.",
  },
  {
    terms: ["security", "privacy", "private", "data", "safe", "protect"],
    answer:
      "Every church's records are kept separate and access is limited by role, with optional two-step sign-in. Prime Haven platform oversight uses only aggregate numbers — never individual church-member records.",
  },
  {
    terms: ["email", "message", "broadcast", "communication", "announce"],
    answer:
      "Authorized church staff can send branded email communication and broadcasts to their members when their plan includes those features.",
  },
  {
    terms: ["report", "export", "analytics", "insight", "trend"],
    answer:
      "Mene:Log turns attendance and membership into reports: service-by-service attendance, week-on-week trends, follow-up lists and missing-Sunday alerts, with exports for church records.",
  },
  {
    terms: ["follow", "care", "absent", "missing", "visitor", "first-time"],
    answer:
      "Member care tools flag people who have missed Sundays, track follow-ups and help leaders look after first-time visitors so nobody slips through the cracks.",
  },
  {
    terms: ["watch", "live", "stream", "online service"],
    answer:
      "Churches can share a Watch Live link so members join the service online with their member code. Watching counts toward attendance once the member has watched for the required time.",
  },
  {
    terms: ["sign up", "signup", "register", "start", "onboard", "create", "join", "get started"],
    answer:
      "Getting started takes a few minutes: create your church account from the sign-up page, name your church, and your check-in link and dashboard are ready. The Free plan needs no card.",
  },
  {
    terms: [
      "country",
      "currency",
      "ghana",
      "cedi",
      "ghs",
      "payment",
      "paystack",
      "mobile money",
      "momo",
      "card",
    ],
    answer:
      "Payments are handled securely by Paystack. Churches in Ghana pay in cedis by card or mobile money; churches elsewhere pay by card.",
  },
  {
    terms: ["cancel", "refund", "downgrade", "upgrade", "change plan"],
    answer:
      "You can upgrade, downgrade or cancel from the Billing page in your church dashboard. Changes apply to the next billing period and your records are never deleted when a plan changes.",
  },
  {
    terms: ["phone", "app", "install", "device", "mobile"],
    answer:
      "Mene:Log works in any modern browser, and you can install it on your phone or computer straight from the site — it then appears in your device's app menu like a regular app.",
  },
  {
    terms: ["support", "help", "contact", "problem", "issue"],
    answer:
      "For account-specific help, sign in and use Ask Mene:Log from your church dashboard. You can also reach the team at support@menelog.site.",
  },
  {
    terms: ["what is", "what does", "about", "who", "why"],
    answer:
      "Mene:Log is Prime Haven's church management platform: membership records, QR check-in, attendance reports, member care, leaders and branches — built so churches of any size can know and grow their people.",
  },
];

function productAnswer(question: string) {
  const normalized = question.toLowerCase();
  const matches = PRODUCT_ANSWERS.filter(({ terms }) =>
    terms.some((term) => normalized.includes(term)),
  );
  if (matches.length === 0) {
    return "Mene:Log helps churches manage membership, QR attendance, services, reports, follow-up, leaders and branches. Try asking about pricing, check-in, branches, security or getting started — or sign in and use Ask Mene:Log from your church dashboard for account-specific help.";
  }
  // Combine the distinct topics the question touched so multi-part
  // questions get a complete answer instead of only the first match.
  const seen = new Set<string>();
  const parts = matches
    .map(({ answer }) => answer)
    .filter((answer) => {
      if (seen.has(answer)) return false;
      seen.add(answer);
      return true;
    });
  return parts.slice(0, 2).join("\n\n");
}

export const Route = createFileRoute("/api/public/product-help")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const input = Input.safeParse(await request.json());
          if (!input.success)
            return Response.json(
              { error: "Ask one question of up to 500 characters." },
              { status: 400 },
            );

          // Public help is intentionally answered from a fixed, server-owned
          // product guide. Anonymous visitors cannot trigger metered AI usage.
          return Response.json({ answer: productAnswer(input.data.question) });
        } catch (error) {
          console.error(
            "[product-help] request failed",
            error instanceof Error ? error.message : error,
          );
          return Response.json(
            { error: "Mene:Log help is temporarily unavailable." },
            { status: 500 },
          );
        }
      },
    },
  },
});
