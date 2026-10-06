import { createFileRoute, Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  FileSpreadsheet,
  Lock,
  Menu,
  Network,
  Play,
  QrCode,
  ShieldCheck,
  Smartphone,
  Users,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import { useCurrency } from "@/hooks/useCurrency";
import { formatUsd } from "@/lib/currency";
import { BillingToggle } from "@/components/BillingToggle";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { PRICING_TIERS } from "@/lib/pricing-plans";
import {
  MONTHLY_USD,
  yearlyUsd,
  yearlyPerMonthUsd,
  YEARLY_DISCOUNT,
  type BillingInterval,
  type AnyTier,
  type PlanTier,
} from "@/lib/pricing";

import { Button } from "@/components/ui/button";
import { ReviewCarousel } from "@/components/ReviewCarousel";
import { SiteFooter } from "@/components/SiteFooter";
import { PublicAskMene } from "@/components/PublicAskMene";
import { HeroNavbar } from "@/components/landing/HeroNavbar";
import { HeroSection } from "@/components/landing/HeroSection";
import { HeroShowreelModal } from "@/components/landing/HeroShowreelModal";
import { MobileAppTabBar } from "@/components/landing/MobileAppTabBar";
import { useActiveSection } from "@/hooks/useActiveSection";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mene:Log — Church Attendance and membership, made simple" },
      {
        name: "description",
        content:
          "Mene:Log is church management software for secure membership records, QR check-in, attendance tracking, member care, branches, leadership and reports.",
      },
      { property: "og:title", content: "Mene:Log — Church Attendance and membership, made simple" },
      {
        property: "og:description",
        content:
          "Secure church membership, QR check-in, attendance, member care, branch management, leadership and reporting in one platform.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://menelog.site/" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:image", content: "https://menelog.site/og-image.jpg" },
      { name: "twitter:image", content: "https://menelog.site/og-image.jpg" },
      { name: "robots", content: "index, follow" },
    ],
    links: [{ rel: "canonical", href: "https://menelog.site/" }],
  }),
  component: LandingPage,
});

const features = [
  {
    icon: QrCode,
    title: "Check in under four seconds",
    body: "One scan at the door. First-timers can check themselves in and leave with a secure member code.",
  },
  {
    icon: Users,
    title: "Know every person",
    body: "A complete, searchable registry for members, first-timers and the people entrusted to your care.",
  },
  {
    icon: BarChart3,
    title: "See the story in the numbers",
    body: "Attendance trends, absentees, demographics and group performance, ready when leadership meets.",
  },
  {
    icon: Network,
    title: "Reflect your real structure",
    body: "Model cells, ministries, units, zones and branches using the language your church already knows.",
  },
  {
    icon: FileSpreadsheet,
    title: "Bring your existing records",
    body: "Move your current membership list from Excel without losing the history you have already built.",
  },
  {
    icon: Smartphone,
    title: "Reach people thoughtfully",
    body: "Send branded email and text messages to the right congregation groups without exposing private details.",
  },
];

const tiers = PRICING_TIERS;

const faqs = [
  {
    q: "Do members need to install an app?",
    a: "No. Members can check in from any browser or present the QR code saved on their phone. Church teams can install Mene:Log to their home screen for app-like access.",
  },
  {
    q: "How are subscriptions billed?",
    a: "There is a Free plan forever. Paid plans are billed monthly, or yearly with up to 15% off. Ghana churches pay in cedis; everyone else pays in US dollars. Payments are secured through Paystack and you receive an invoice before renewal.",
  },
  {
    q: "What happens if we pause?",
    a: "Your records are not deleted. Check-in and editing pause, while your church keeps read and export access until renewal.",
  },
  {
    q: "Is our congregation's information protected?",
    a: "Yes. Every church is isolated at the data level, access follows staff responsibilities, and sensitive member details are protected by strict permissions.",
  },
];

function LandingPage() {
  const currency = useCurrency();
  const settings = usePlatformSettings();
  const [interval, setBillingInterval] = useState<BillingInterval>("monthly");
  const [showreelOpen, setShowreelOpen] = useState(false);
  const activeSection = useActiveSection(["hero", "features", "care", "pricing", "faq"], 320);

  return (
    <div className="min-h-screen bg-background text-foreground pb-20 lg:pb-0">
      {settings?.homepage?.banner && (
        <div className="fixed inset-x-0 bottom-0 z-40 bg-primary px-4 py-2 text-center text-xs font-semibold text-primary-foreground md:top-0 md:bottom-auto">
          {settings.homepage.banner}
        </div>
      )}

      {/* Top Floating Glassmorphism Navigation Bar */}
      <HeroNavbar activeSection={activeSection} />

      {/* Redesigned Architectural Hero Section with Expanded Growing Together Deck */}
      <HeroSection onWatchShowreel={() => setShowreelOpen(true)} />

      {/* Interactive Video Tour / Showreel Modal */}
      <HeroShowreelModal
        open={showreelOpen}
        onClose={() => setShowreelOpen(false)}
      />

      <main className="relative z-10">

        <section id="features" className="bg-background px-5 py-24 sm:py-28">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-6 lg:grid-cols-2 lg:items-end">
              <div>
                <p className="text-eyebrow">Built around real church work</p>
                <h2 className="mt-4 max-w-2xl font-display text-3xl font-bold leading-tight sm:text-5xl">
                  Less administration. More room for ministry.
                </h2>
              </div>
              <p className="max-w-lg text-muted-foreground lg:justify-self-end">
                Every part of Mene:Log connects, so teams spend less time reconciling lists and more
                time responding to people.
              </p>
            </div>
            <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
              {features.map(({ icon: Icon, title, body }, index) => (
                <motion.article
                  key={title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ delay: index * 0.05 }}
                  className="min-h-64 bg-card p-7 sm:p-8"
                >
                  <span className="grid size-10 place-items-center rounded-md bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-10 text-lg font-bold">{title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        <section id="care" className="bg-primary px-5 py-24 text-primary-foreground sm:py-28">
          <div className="mx-auto max-w-7xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-foreground/65">
              Churches thrive through people
            </p>
            <h2 className="mt-4 max-w-4xl font-display text-3xl font-bold leading-tight text-primary-foreground sm:text-5xl">
              A clearer picture of your congregation changes how you care.
            </h2>
            <ReviewCarousel />
          </div>
        </section>

        <section id="pricing" className="bg-background px-5 py-24 sm:py-28">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl">
              <p className="text-eyebrow">Simple monthly or yearly plans</p>
              <h2 className="mt-4 font-display text-3xl font-bold leading-tight sm:text-5xl">
                Choose the structure your church needs today.
              </h2>
              <p className="mt-5 text-muted-foreground">
                All plans include secure attendance, membership records and reporting. Prices are
                shown in your local currency, billed monthly or yearly.
              </p>
            </div>
            <div className="mt-10">
              <BillingToggle value={interval} onChange={setBillingInterval} />
            </div>
            <div className="mt-8 pt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-4 items-stretch">
              {tiers.map((tier) => (
                <article
                  key={tier.name}
                  className={`relative flex flex-col rounded-2xl border p-7 ${tier.featured ? "border-primary bg-primary text-primary-foreground shadow-2xl ring-2 ring-primary/30" : "border-border/70 bg-card/80 backdrop-blur-md shadow-sm"}`}
                >
                  {/* Centered Most Popular rounded rectangle above the top of the card */}
                  {tier.featured && (
                    <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary-foreground px-4 py-1 text-[10px] font-bold uppercase tracking-wider text-primary shadow-md z-10">
                      Most popular
                    </span>
                  )}
                  <h3
                    className={`text-sm font-bold uppercase tracking-[0.16em] ${tier.featured ? "text-primary-foreground/75" : "text-muted-foreground"}`}
                  >
                    {tier.name}
                  </h3>
                  <div className="mt-4 min-h-[4.5rem] flex flex-col justify-start">
                    {tier.id === "free" ? (
                      <div>
                        <span className="font-display text-4xl font-bold text-foreground">Free</span>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Free forever · no card needed
                        </p>
                      </div>
                    ) : (
                      <div>
                        <div className="flex flex-wrap items-end">
                          <span
                            className={`font-display text-4xl font-bold ${tier.featured ? "text-primary-foreground" : "text-foreground"}`}
                          >
                            {formatUsd(
                              interval === "yearly"
                                ? yearlyUsd(tier.id as PlanTier)
                                : MONTHLY_USD[tier.id as PlanTier],
                              currency,
                            )}
                          </span>
                          <span
                            className={`mb-1 ml-1 text-sm ${tier.featured ? "text-primary-foreground/65" : "text-muted-foreground"}`}
                          >
                            {interval === "yearly" ? "/year" : "/month"}
                          </span>
                        </div>
                        {interval === "yearly" ? (
                          <p
                            className={`mt-1 text-xs ${tier.featured ? "text-primary-foreground/70" : "text-muted-foreground"}`}
                          >
                            <b>Save {Math.round(YEARLY_DISCOUNT[tier.id as PlanTier] * 100)}%</b> ·{" "}
                            {formatUsd(yearlyPerMonthUsd(tier.id as PlanTier), currency)}/mo billed yearly
                          </p>
                        ) : (
                          <p
                            className={`mt-1 text-xs ${tier.featured ? "text-primary-foreground/70" : "text-muted-foreground"}`}
                          >
                            Billed monthly
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <p
                    className={`mt-4 min-h-12 text-sm ${tier.featured ? "text-primary-foreground/75" : "text-muted-foreground"}`}
                  >
                    {tier.blurb}
                  </p>
                  <div
                    className={`my-7 h-px ${tier.featured ? "bg-primary-foreground/20" : "bg-border"}`}
                  />
                  <ul className="flex-1 space-y-3 text-sm">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex gap-2.5">
                        <Check className="mt-0.5 size-4 shrink-0" />
                        {feature}
                      </li>
                    ))}
                    {tier.missing.map((feature) => (
                      <li
                        key={feature}
                        className={`flex gap-2.5 ${tier.featured ? "text-primary-foreground/45" : "text-muted-foreground"}`}
                      >
                        <X className="mt-0.5 size-4 shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Button
                    asChild
                    variant={tier.featured ? "secondary" : "outline"}
                    className="mt-8 h-11"
                  >
                    <Link to="/onboarding">
                      Choose {tier.name} <ArrowRight />
                    </Link>
                  </Button>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-deep px-5 py-24 text-deep-foreground">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-deep-foreground/50">
                Protection by design
              </p>
              <h2 className="mt-4 font-display text-3xl font-bold text-deep-foreground sm:text-5xl">
                Your congregation’s data belongs to your church.
              </h2>
              <p className="mt-5 max-w-xl leading-relaxed text-deep-foreground/65">
                Mene:Log isolates each church’s records and applies permissions to every request,
                not only what appears on screen.
              </p>
            </div>
            <div className="grid gap-px overflow-hidden rounded-lg border border-deep-foreground/15 bg-deep-foreground/15 sm:grid-cols-2">
              {[
                [Lock, "Church-level isolation"],
                [ShieldCheck, "Role-based access"],
                [Users, "Protected minors"],
                [Smartphone, "Secure check-in"],
              ].map(([Icon, label]) => {
                const SecurityIcon = Icon as typeof Lock;
                return (
                  <div key={label as string} className="bg-deep p-6">
                    <SecurityIcon className="size-5 text-primary" />
                    <h3 className="mt-7 text-sm font-bold text-deep-foreground">
                      {label as string}
                    </h3>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section id="faq" className="bg-background px-5 py-24">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.7fr_1.3fr]">
            <div>
              <p className="text-eyebrow">Good to know</p>
              <h2 className="mt-4 text-3xl font-bold sm:text-5xl">Questions before you begin.</h2>
            </div>
            <div className="border-t border-border">
              {faqs.map(({ q, a }) => (
                <details key={q} className="group border-b border-border py-6">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display font-bold">
                    <span>{q}</span>
                    <span className="text-xl font-normal text-primary group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    {a}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-primary px-5 py-20 text-center text-primary-foreground">
          <div className="mx-auto max-w-4xl">
            <h2 className="font-display text-4xl font-bold text-primary-foreground sm:text-6xl">
              Ready before next Sunday.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-primary-foreground/70">
              Create your church, add a service and welcome your first member in minutes.
            </p>
            <Button
              asChild
              size="lg"
              className="mt-8 h-12 bg-deep text-deep-foreground hover:bg-deep/90"
            >
              <Link to="/onboarding">
                Start with Mene:Log <ArrowRight />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <SiteFooter />
      <PublicAskMene />

      {/* Native App-Style Mobile Bottom Navigation Tab Bar */}
      <MobileAppTabBar activeSection={activeSection} />
    </div>
  );
}
