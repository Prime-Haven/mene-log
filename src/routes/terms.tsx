import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter } from "@/components/SiteFooter";
import { ShieldCheck, FileText, CheckCircle2 } from "lucide-react";
import { MeneLogLogo } from "@/components/MeneLogLogo";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Use — Mene:Log" },
      {
        name: "description",
        content:
          "Comprehensive terms governing church accounts, subscriptions, onboarding, member check-in records, leadership permissions, and data protection on Mene:Log.",
      },
      { property: "og:title", content: "Terms of Use — Mene:Log" },
      { property: "og:description", content: "Comprehensive accounts, subscriptions, acceptable use and data protection terms for Mene:Log." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TermsPage,
});

const sections: Array<{ title: string; body: string[] }> = [
  {
    title: "1. Parties and Agreement Scope",
    body: [
      "These Terms of Use ('Terms') constitute a legally binding agreement between Prime Haven IT Solutions & Consultancy ('Prime Haven', 'we', 'our', or 'us') and the religious institution, ministry, parish, or church organization ('Church', 'Subscriber', or 'you') registering for or utilizing the Mene:Log Church Attendance and Membership Platform ('Mene:Log').",
      "By creating a church account, completing the onboarding workflow, or continuing to access any aspect of the service, you represent and warrant that you are legally authorized by your governing council, board, or lead pastor to bind the Church to these Terms.",
      "These Terms also govern the use of Mene:Log by invited church staff, ushers, group leaders, and attendees accessing public self-check-in portals under your church's designated address.",
    ],
  },
  {
    title: "2. Church Onboarding, Account Creation & Operator Verification",
    body: [
      "Church registration on Mene:Log proceeds through a guided four-step onboarding process requiring accurate administrator credentials, church location, package selection, and a secure account password.",
      "To prevent unauthorized claiming of church identities, spam, or illicit tenant creation, all new registrations are submitted for platform operator review with an initial status of pending approval.",
      "The platform operator verifies application details within 24 business hours. Upon approval, full administrative privileges are unlocked, and church check-in portals become live.",
      "The registered account creator serves as the primary Account Owner, holding exclusive authority to manage billing, invite additional administrators, and assign staff permissions.",
    ],
  },
  {
    title: "3. Church Subdomains & Permanent Check-in Handles",
    body: [
      "During onboarding, each Church claims a unique check-in handle (e.g., menelog.site/c/yourchurch). Once claimed, approved, and activated, this web address serves as your permanent attendance portal.",
      "Churches may freely update their displayed name, visual branding, logos, welcome messages, and service schedules at any time without altering their permanent check-in handle.",
      "Subdomain handles must not infringe on registered trademarks, impersonate third-party ministries, or contain misleading terminology. Prime Haven reserves the right to reclaim or modify handles that violate trademark or acceptable usage standards.",
    ],
  },
  {
    title: "4. Subscription Packages, 30-Day Cycles & Billing",
    body: [
      "Mene:Log offers tiered monthly packages billed in United States Dollars (USD) or local currency equivalents: a Free plan (free forever), Standard ($10/month), Pro ($25/month), and Premium ($50/month). Yearly billing saves 8%, 10% and 15% respectively.",
      "New churches receive a 14-day trial. Paid subscriptions renew monthly from the day payment is confirmed through our authorized payment processor, including card and Mobile Money payments through Paystack.",
      "Because mobile money transactions cannot be charged automatically without active user authorization, account owners receive electronic renewal prompts and invoices before the expiration of each 30-day period.",
      "If a renewal payment is not completed before cycle expiry, the account enters a 7-day grace period, followed by subscription suspension. During suspension, check-in and data modification are paused, but existing records, attendances, and complete exports remain permanently accessible.",
      "Churches on Standard or Premium tiers may purchase additional member capacity slots as add-ons, which remain valid for the duration of the active subscription.",
    ],
  },
  {
    title: "5. Congregation Records & Absolute Church Ownership",
    body: [
      "All membership records, attendance logs, demographics, contact details, notes, and messages entered into Mene:Log are the sole and exclusive intellectual property of the respective Church.",
      "Prime Haven acts strictly as a data processor. We do not sell, rent, commercialize, or share your congregation records with any advertiser, third-party vendor, or denomination.",
      "Your Church is responsible for acquiring necessary member consent before collecting personal details during check-in, consistent with applicable regional data protection legislations including the Ghana Data Protection Act 2012 (Act 843).",
    ],
  },
  {
    title: "6. Role-Based Permissions & Leadership Structure",
    body: [
      "Mene:Log enforces strict role-based access control (RBAC): Administrators retain full configuration and reporting access; Ushers are restricted to scanning QR codes and taking door attendance; Leaders are granted access strictly to their assigned group members.",
      "Leader accounts require a unique Leader Access Code established and managed by church administrators, blocking unauthorized leader registrations.",
      "Leaders can only ever inspect members who have explicitly selected them or been assigned to their cell, unit, or department. Full church registry access remains exclusively with authorized administrators.",
    ],
  },
  {
    title: "7. Acceptable Use and Platform Protection",
    body: [
      "You agree not to probe, scan, or test the vulnerability of the system, bypass rate limiters, upload malicious software, or attempt to cross-pollinate or access data belonging to other church tenants.",
      "Mene:Log's automated messaging engine (SMS and email broadcasts) must only be used to communicate authentic ministry announcements, devotional content, service reminders, and pastoral follow-ups. Sending spam, deceptive communications, or unconsented solicitations is strictly prohibited.",
      "Prime Haven reserves the right to immediately suspend or terminate access for any account engaging in abusive behavior, malicious scanning, or fraudulent payment activity.",
    ],
  },
  {
    title: "8. Cancellation, 90-Day Retention & Sanitization",
    body: [
      "You may cancel your church subscription at any time via the Billing console without penalty. Cancellation takes effect at the end of the current paid billing cycle.",
      "Following account closure, Prime Haven retains encrypted database records for 90 calendar days to enable seamless account restoration or administrative record extraction.",
      "Upon the conclusion of the 90-day retention window, all tenant records, attendance rows, and uploaded media are permanently purged or irreversibly anonymized in accordance with secure data sanitization standards.",
    ],
  },
  {
    title: "9. Service Availability and Maintenance",
    body: [
      "We strive for 99.9% uptime, with targeted architectural resilience prioritized around peak Sunday service hours across West African Time (WAT) and Greenwich Mean Time (GMT).",
      "Scheduled platform maintenance, infrastructure upgrades, and database optimizations are performed during non-peak weekday hours with prior notice posted to administrative consoles.",
    ],
  },
  {
    title: "10. Governing Law and Dispute Resolution",
    body: [
      "These Terms are governed by and construed in accordance with the laws of the Republic of Ghana.",
      "Any dispute, controversy, or claim arising out of or relating to these Terms shall first be resolved through good-faith mutual negotiations. If unresolved within 30 days, matters shall be submitted to the competent courts of Ghana.",
    ],
  },
];

function TermsPage() {
  const settings = usePlatformSettings();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 px-5 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link to="/" aria-label="Mene:Log home"><MeneLogLogo className="h-10 max-w-48" /></Link>
          <div className="flex items-center gap-4 text-xs font-semibold">
            <Link to="/privacy" className="text-muted-foreground hover:text-foreground">Privacy Policy</Link>
            <Link to="/auth" className="rounded-lg bg-primary px-3 py-1.5 text-primary-foreground">Sign in</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-16">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3.5 py-1 text-xs font-semibold text-primary">
          <FileText className="size-3.5" /> Institutional Agreement
        </div>
        <h1 className="mt-4 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
          Terms of Use
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
           Comprehensive operational, subscription, data stewardship, and acceptable use terms governing churches and leadership accounts on Mene:Log.
        </p>

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
          {settings?.legal.terms_extra && (
            <section className="mt-10 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{settings.legal.terms_extra}</section>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
