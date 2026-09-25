import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter } from "@/components/SiteFooter";
import { ShieldCheck, Lock, EyeOff, Server, Database, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Mene:Log" },
      {
        name: "description",
        content:
          "How Mene:Log protects church records: multi-tenant isolation, role-based visibility, Ghana Data Protection Act 2012 compliance, and our strict operator zero-access guarantee.",
      },
      { property: "og:title", content: "Privacy Policy — Mene:Log" },
      { property: "og:description", content: "Technical isolation, role-based access control and operator limits explained." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

const sections: Array<{ title: string; icon?: any; body: string[] }> = [
  {
    title: "1. Data Controller vs. Data Processor Principles",
    body: [
      "Every church using Mene:Log is the absolute Data Controller of its own congregation's information. You decide what information to collect, how long to retain it, and how to communicate with your members.",
      "Prime Haven IT Solutions & Consultancy ('Prime Haven') acts exclusively as a Data Processor. We store, calculate, and transmit data solely on your explicit instructions to deliver the attendance, membership, leadership, and communication features of the platform.",
      "We adhere to the provisions of the Data Protection Act 2012 (Act 843) of Ghana, as well as recognized global data protection and privacy standards.",
    ],
  },
  {
    title: "2. The Platform Operator Zero-Access Guarantee",
    body: [
      "Our system is architected with a strict technical zero-access boundary: the platform operator console (used by Prime Haven administrators) can only ever inspect institutional account metadata.",
      "This includes: registered church name, subdomain handle, package tier (Free, Standard, Pro, Premium), account status (active, grace, suspended, closed), primary administrator contact info, and aggregate counts (e.g. total attendance count over 30 days, billing health).",
      "The platform operator never sees and cannot access: individual member names, phone numbers, email addresses, dates of birth, marital status, residential areas, occupations, educational backgrounds, who invited them, individual attendance check-in timestamps, member codes, or church message contents.",
      "This separation is enforced at the database level via PostgreSQL Row Level Security (RLS) and cryptographic access functions, not merely client-side hiding.",
    ],
  },
  {
    title: "3. Categories of Information Collected",
    body: [
      "From Church Administrators & Staff: Name, email address, phone number, designated church role, and hashed login credentials.",
      "From Church Leaders: Full name, phone, email, date of birth, residential location, leader type/title, church access code, and optional profile photograph.",
      "From Members & Attendees at Check-in: Name, mobile number, optional email address, date of birth, gender, marital status, residential location, occupation, educational level, inviting leader, and attendance records.",
      "Technical & Safety Telemetry: Anonymized IP addresses, rate-limiting tokens, check-in timestamps, and browser user-agent tokens utilized strictly to prevent fraudulent check-ins and denial-of-service abuse.",
    ],
  },
  {
    title: "4. Multi-Tenant Architectural Isolation & Database Security",
    body: [
      "Every query executed on Mene:Log is strictly scoped to the authenticated user's church tenant identifier. Church A can never inspect, query, or infer records belonging to Church B.",
      "Database connections use Transport Layer Security (TLS 1.3) in transit. Static assets and databases are encrypted at rest with industry-standard AES-256 encryption.",
      "Member attendance codes are stored as cryptographically salted one-way hashes, preventing token enumeration or unauthorized code generation.",
    ],
  },
  {
    title: "5. Role-Based Data Visibility (Inside the Church)",
    body: [
      "Internal church access strictly follows administrative assignment:",
      "• Ushers can only scan member QR codes and view the attendee's name and check-in confirmation.",
      "• Leaders can only view attendees who specifically selected them as their leader or were assigned to their specific ministry unit or cell group. Leaders cannot view the global church directory.",
      "• Administrators and Owners retain full visibility over church-wide membership, pastoral follow-up logs, and reporting analytics.",
    ],
  },
  {
    title: "6. Authorized Sub-Processors & Service Providers",
    body: [
      "We partner with trusted enterprise service providers strictly to perform essential platform functions:",
      "• Payment Infrastructure: Paystack (PCI-DSS Level 1 certified) for processing card transactions and Mobile Money payments in Ghana and internationally.",
      "• Cloud Infrastructure & Hosting: Supabase and Cloudflare for managed database replication, serverless edge routing, and file asset storage.",
      "• Messaging Gateways: Telecommunications gateways for delivering one-way transactional SMS and email broadcasts initiated by your church.",
      "Our sub-processors are legally prohibited from utilizing church data for any secondary purpose, machine learning training, or independent commercialization.",
    ],
  },
  {
    title: "7. Congregation Members' Legal Rights",
    body: [
      "Attendees and members whose records are stored on Mene:Log retain full rights under applicable data protection law:",
      "• Right of Access: Members may request a complete copy of their personal attendance history directly from their church administration.",
      "• Right to Rectification: Members may update inaccurate contact details upon subsequent check-ins or by notifying church leadership.",
      "• Right to Erasure / Anonymization: Churches can delete or irreversibly anonymize any member record at any time, instantly wiping personal identifiers while preserving aggregate historical service tallies.",
      "• Right to Opt-Out: Members may unsubscribe from non-essential church messaging broadcasts at any time.",
    ],
  },
  {
    title: "8. Data Retention, Account Closure & Sanitization",
    body: [
      "Congregation data is retained throughout the active term of your church subscription.",
      "Upon account termination or cancellation, your database records enter a 90-day grace retention period to safeguard against accidental loss and permit complete data exports.",
      "Following the 90th day, all database records, member rows, attendance stamps, and uploaded media assets are irrevocably purged from active production databases in accordance with DoD 5220.22-M sanitization practices.",
    ],
  },
  {
    title: "9. Contact and Data Protection Inquiries",
    body: [
      "For questions regarding our privacy architecture, multi-tenant isolation, or data processor obligations, contact our Data Protection Team at Prime Haven IT Solutions & Consultancy via legal@menelog.site or through the support channels in your church console.",
    ],
  },
];

function PrivacyPage() {
  const settings = usePlatformSettings();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 px-5 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-display text-lg font-bold">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">M</span>
            Mene:Log
          </Link>
          <div className="flex items-center gap-4 text-xs font-semibold">
            <Link to="/terms" className="text-muted-foreground hover:text-foreground">Terms of Use</Link>
            <Link to="/auth" className="rounded-lg bg-primary px-3 py-1.5 text-primary-foreground">Sign in</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-16">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3.5 py-1 text-xs font-semibold text-primary">
          <ShieldCheck className="size-3.5" /> Technical Data Protection
        </div>
        <h1 className="mt-4 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
          Privacy Policy
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          Your congregation's records belong to your church. Here is our rigorous multi-tenant technical isolation and zero-access operator guarantee.
        </p>

        {/* Highlight Card: Zero Access */}
        <div className="mt-8 rounded-2xl border border-primary/30 bg-primary/5 p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
              <EyeOff className="size-6" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-foreground">Platform Operator Zero-Access Guarantee</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Prime Haven operators never have access to your church's member lists, attendance registers, phone numbers, or private communications. Our console enforces strict database isolation — we see only aggregate account health, never member details.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-12 space-y-10">
          {sections.map((section) => (
            <section key={section.title} className="surface rounded-2xl p-6 sm:p-8">
              <h2 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                {section.title}
              </h2>
              <div className="mt-4 space-y-3">
                {section.body.map((p, idx) => (
                  <p key={idx} className="text-sm leading-relaxed text-muted-foreground">
                    {p}
                  </p>
                ))}
              </div>
            </section>
          ))}
          {settings?.legal.privacy_extra && (
            <section className="mt-10 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{settings.legal.privacy_extra}</section>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
