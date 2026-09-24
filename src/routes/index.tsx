import { createFileRoute, Link } from "@tanstack/react-router";
import { AnimatePresence, motion, useScroll, useTransform } from "framer-motion";
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
import { currencySymbol, USD_TO_GHS } from "@/lib/currency";

import heroVideo from "@/assets/mene-worship-hero.webm";
import heroPoster from "@/assets/mene-worship-poster.jpg";
import { Button } from "@/components/ui/button";
import { VerseTyper } from "@/components/VerseTyper";
import { ReviewCarousel } from "@/components/ReviewCarousel";
import { SiteFooter } from "@/components/SiteFooter";
import { HomepageStats } from "@/components/HomepageStats";
import { PublicAskMene } from "@/components/PublicAskMene";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mene:Log — church attendance and membership, made simple" },
      {
        name: "description",
        content:
          "Mene:Log gives churches QR check-in, a complete membership registry, leadership structure and clear attendance reports.",
      },
      { property: "og:title", content: "Mene:Log — church attendance and membership, made simple" },
      {
        property: "og:description",
        content: "QR check-in, membership, communication and reporting for churches in Ghana.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "index, follow" },
    ],
  }),
  component: LandingPage,
});

const features = [
  { icon: QrCode, title: "Check in under four seconds", body: "One scan at the door. First-timers can check themselves in and leave with a secure member code." },
  { icon: Users, title: "Know every person", body: "A complete, searchable registry for members, first-timers and the people entrusted to your care." },
  { icon: BarChart3, title: "See the story in the numbers", body: "Attendance trends, absentees, demographics and group performance, ready when leadership meets." },
  { icon: Network, title: "Reflect your real structure", body: "Model cells, ministries, units, zones and branches using the language your church already knows." },
  { icon: FileSpreadsheet, title: "Bring your existing records", body: "Move your current membership list from Excel without losing the history you have already built." },
  { icon: Smartphone, title: "Reach people thoughtfully", body: "Send branded email and text messages to the right congregation groups without exposing private details." },
];

const tiers = [
  { name: "Basic", price: "15", blurb: "For a single-site church ready to move beyond paper.", features: ["Branded church check-in", "QR attendance", "Membership registry", "Excel import and export", "Core reports and email"], missing: ["Leadership structure", "Multiple branches"] },
  { name: "Standard", price: "30", blurb: "For churches led through ministries, units or departments.", features: ["Everything in Basic", "Leadership and groups", "Leader access", "Email broadcasts", "Deeper insights"], missing: ["Multiple branches", "Text messaging"] , featured: true},
  { name: "Premium", price: "55", blurb: "For multi-branch and cell-structured ministries.", features: ["Everything in Standard", "Multiple branches", "Text messaging", "Automated follow-up", "Advanced reports and audit"], missing: [] },
];

const faqs = [
  { q: "Do members need to install an app?", a: "No. Members can check in from any browser or present the QR code saved on their phone. Church teams can install Mene:Log to their home screen for app-like access." },
  { q: "How are subscriptions billed?", a: "Plans are billed monthly in US dollars. Payments are secured through Paystack and you receive an invoice before renewal." },
  { q: "What happens if we pause?", a: "Your records are not deleted. Check-in and editing pause, while your church keeps read and export access until renewal." },
  { q: "Is our congregation's information protected?", a: "Yes. Every church is isolated at the data level, access follows staff responsibilities, and sensitive member details are protected by strict permissions." },
];

function LandingPage() {
  const heroRef = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const videoScale = useTransform(scrollYProgress, [0, 1], [1, 1.12]);
  const videoOpacity = useTransform(scrollYProgress, [0, 0.72, 1], [1, 0.52, 0]);
  const contentY = useTransform(scrollYProgress, [0, 1], [0, -80]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.68], [1, 0]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-5">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between rounded-2xl border border-white/20 bg-deep/80 px-4 text-deep-foreground shadow-2xl backdrop-blur-2xl sm:px-6">
          <Link to="/" aria-label="Mene:Log home" className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/30">
              <span className="size-3.5 rounded-sm bg-primary-foreground" />
            </span>
            <span className="font-display text-lg font-bold tracking-tight text-deep-foreground">Mene:Log</span>
          </Link>
          <nav className="hidden items-center gap-8 text-xs font-semibold text-white/80 md:flex">
            <a href="#why" className="transition-colors hover:text-white">Why Mene:Log</a>
            <a href="#features" className="transition-colors hover:text-white">Features</a>
            <a href="#pricing" className="transition-colors hover:text-white">Plans</a>
            <a href="#faq" className="transition-colors hover:text-white">FAQ</a>
            <Link to="/terms" className="transition-colors hover:text-white">Terms</Link>
            <Link to="/privacy" className="transition-colors hover:text-white">Privacy</Link>
          </nav>
          <div className="flex items-center gap-2.5">
            <Button asChild variant="ghost" size="sm" className="hidden text-white/90 hover:bg-white/10 hover:text-white sm:inline-flex">
              <Link to="/auth" search={{ mode: "signin" }}>Sign in</Link>
            </Button>
            <Button asChild size="sm" className="rounded-xl bg-primary text-primary-foreground shadow-md hover:bg-primary/90">
              <Link to="/onboarding">Get Started <ArrowRight className="ml-1 size-3.5" /></Link>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/10 md:hidden"
              aria-label="Open navigation"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </Button>
          </div>
        </div>

        <AnimatePresence>
          {menuOpen && (
            <motion.nav
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.98 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="mx-auto mt-2 grid max-w-7xl overflow-hidden rounded-2xl border border-white/20 bg-deep/95 p-3 text-sm font-semibold text-white shadow-2xl backdrop-blur-2xl md:hidden"
            >
              {[
                ["#why", "Why Mene:Log"],
                ["#features", "Features"],
                ["#pricing", "Plans"],
                ["#faq", "Questions & Answers"],
              ].map(([href, label]) => (
                <a
                  key={href}
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-xl px-4 py-3 transition-colors hover:bg-white/10"
                >
                  {label}
                </a>
              ))}
              <div className="my-1 border-t border-white/10" />
              <Link to="/terms" onClick={() => setMenuOpen(false)} className="rounded-xl px-4 py-3 transition-colors hover:bg-white/10">Terms of Use</Link>
              <Link to="/privacy" onClick={() => setMenuOpen(false)} className="rounded-xl px-4 py-3 transition-colors hover:bg-white/10">Privacy Policy</Link>
              <Link to="/auth" search={{ mode: "signin" }} onClick={() => setMenuOpen(false)} className="rounded-xl px-4 py-3 transition-colors hover:bg-white/10">Sign in to your church</Link>
            </motion.nav>
          )}
        </AnimatePresence>
      </header>

      <section ref={heroRef} className="relative h-[145svh] bg-deep">
        <div className="sticky top-0 h-svh overflow-hidden">
          <motion.video
            style={{ scale: videoScale, opacity: videoOpacity }}
            className="absolute inset-0 size-full object-cover grayscale"
            src={heroVideo}
            poster={heroPoster}
            autoPlay
            muted
            loop
            playsInline
            aria-hidden="true"
          />
           <div className="absolute inset-0 bg-deep/65" />
           <div aria-hidden className="motion-blur motion-blur-large" />
          <div className="absolute inset-0 bg-[linear-gradient(to_top,var(--deep)_0%,transparent_55%)] opacity-70" />
           <motion.div style={{ y: contentY, opacity: contentOpacity }} className="relative mx-auto flex h-full max-w-7xl items-end justify-center px-5 pb-24 text-center sm:pb-20">
             <div className="max-w-3xl text-deep-foreground">
              <p className="mb-5 text-xs font-bold uppercase tracking-[0.18em] text-deep-foreground/70">Made for churches. Built for people.</p>
              <VerseTyper />
               <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-deep-foreground/80 sm:text-lg">
                 Mene:Log brings attendance, membership, leadership and communication together so your church can care with clarity.
              </p>
               <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Button asChild size="lg" className="h-12 bg-primary px-6 text-primary-foreground hover:bg-primary/90">
                  <Link to="/onboarding">Create your church <ArrowRight /></Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="h-12 border-deep-foreground/40 bg-deep-foreground/10 px-6 text-deep-foreground backdrop-blur hover:bg-deep-foreground/20 hover:text-deep-foreground">
                  <a href="#why"><Play className="fill-current" /> See how it works</a>
                </Button>
              </div>
            </div>
          </motion.div>
          <div className="absolute bottom-7 right-5 hidden items-center gap-3 text-xs font-semibold text-deep-foreground/70 sm:flex">
            <span className="h-px w-14 bg-deep-foreground/40" /> Scroll to explore
          </div>
        </div>
      </section>

       <main className="relative z-10 -mt-[28svh]">
        <section id="why" className="px-3 sm:px-5">
          <div className="mx-auto max-w-7xl rounded-t-lg border-x border-t border-deep-foreground/20 bg-deep/80 px-5 py-14 text-deep-foreground shadow-2xl backdrop-blur-2xl sm:px-10 lg:px-14">
            <div className="grid gap-10 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-deep-foreground/60">One connected church record</p>
                <h2 className="mt-4 max-w-4xl font-display text-3xl font-bold leading-tight text-deep-foreground sm:text-5xl">From a welcome at the door to meaningful care during the week.</h2>
              </div>
              <p className="max-w-xl leading-relaxed text-deep-foreground/70">Check people in quickly, understand who is present or absent, and give leaders the information they need without exposing what they do not.</p>
            </div>
            <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-deep-foreground/15 bg-deep-foreground/15 sm:grid-cols-3">
              {[["< 4 sec", "average check-in"], ["One record", "from arrival to follow-up"], ["Every plan", "protected by church-level access"]].map(([value, label]) => (
                <div key={label} className="bg-deep/35 p-6 backdrop-blur-xl">
                  <p className="font-display text-3xl font-bold text-deep-foreground">{value}</p>
                  <p className="mt-1 text-sm text-deep-foreground/60">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <HomepageStats />

        <section id="features" className="bg-background px-5 py-24 sm:py-28">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-6 lg:grid-cols-2 lg:items-end">
              <div>
                <p className="text-eyebrow">Built around real church work</p>
                <h2 className="mt-4 max-w-2xl font-display text-3xl font-bold leading-tight sm:text-5xl">Less administration. More room for ministry.</h2>
              </div>
              <p className="max-w-lg text-muted-foreground lg:justify-self-end">Every part of Mene:Log connects, so teams spend less time reconciling lists and more time responding to people.</p>
            </div>
            <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
              {features.map(({ icon: Icon, title, body }, index) => (
                <motion.article key={title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ delay: index * 0.05 }} className="min-h-64 bg-card p-7 sm:p-8">
                  <span className="grid size-10 place-items-center rounded-md bg-primary/10 text-primary"><Icon className="size-5" /></span>
                  <h3 className="mt-10 text-lg font-bold">{title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-primary px-5 py-24 text-primary-foreground sm:py-28">
          <div className="mx-auto max-w-7xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-foreground/65">Churches thrive through people</p>
            <h2 className="mt-4 max-w-4xl font-display text-3xl font-bold leading-tight text-primary-foreground sm:text-5xl">A clearer picture of your congregation changes how you care.</h2>
            <ReviewCarousel />
          </div>
        </section>

        <section id="pricing" className="bg-background px-5 py-24 sm:py-28">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl">
              <p className="text-eyebrow">Simple monthly plans</p>
              <h2 className="mt-4 font-display text-3xl font-bold leading-tight sm:text-5xl">Choose the structure your church needs today.</h2>
              <p className="mt-5 text-muted-foreground">All plans include secure attendance, membership records and reporting. Prices are shown in your local currency and billed monthly.</p>
            </div>
            <div className="mt-12 grid gap-5 lg:grid-cols-3">
              {tiers.map((tier) => (
                <article key={tier.name} className={`relative flex flex-col rounded-lg border p-7 ${tier.featured ? "border-primary bg-primary text-primary-foreground shadow-xl" : "border-border bg-card"}`}>
                  {tier.featured && <span className="mb-5 self-start rounded-md bg-primary-foreground px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">Most popular</span>}
                  <h3 className={`text-sm font-bold uppercase tracking-[0.16em] ${tier.featured ? "text-primary-foreground/65" : "text-muted-foreground"}`}>{tier.name}</h3>
                  <div className="mt-4 flex items-end"><span className="mb-2 text-lg">{currencySymbol(currency)}</span><span className={`font-display text-6xl font-bold ${tier.featured ? "text-primary-foreground" : "text-foreground"}`}>{currency === "GHS" ? Number(tier.price) * USD_TO_GHS : tier.price}</span><span className={`mb-2 ml-1 text-sm ${tier.featured ? "text-primary-foreground/65" : "text-muted-foreground"}`}>/month</span></div>
                  <p className={`mt-4 min-h-12 text-sm ${tier.featured ? "text-primary-foreground/75" : "text-muted-foreground"}`}>{tier.blurb}</p>
                  <div className={`my-7 h-px ${tier.featured ? "bg-primary-foreground/20" : "bg-border"}`} />
                  <ul className="flex-1 space-y-3 text-sm">
                    {tier.features.map((feature) => <li key={feature} className="flex gap-2.5"><Check className="mt-0.5 size-4 shrink-0" />{feature}</li>)}
                    {tier.missing.map((feature) => <li key={feature} className={`flex gap-2.5 ${tier.featured ? "text-primary-foreground/45" : "text-muted-foreground"}`}><X className="mt-0.5 size-4 shrink-0" />{feature}</li>)}
                  </ul>
                  <Button asChild variant={tier.featured ? "secondary" : "outline"} className="mt-8 h-11">
                     <Link to="/onboarding">Choose {tier.name} <ArrowRight /></Link>
                  </Button>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-deep px-5 py-24 text-deep-foreground">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-deep-foreground/50">Protection by design</p>
              <h2 className="mt-4 font-display text-3xl font-bold text-deep-foreground sm:text-5xl">Your congregation’s data belongs to your church.</h2>
              <p className="mt-5 max-w-xl leading-relaxed text-deep-foreground/65">Mene:Log isolates each church’s records and applies permissions to every request, not only what appears on screen.</p>
            </div>
            <div className="grid gap-px overflow-hidden rounded-lg border border-deep-foreground/15 bg-deep-foreground/15 sm:grid-cols-2">
              {[[Lock, "Church-level isolation"], [ShieldCheck, "Role-based access"], [Users, "Protected minors"], [Smartphone, "Secure check-in"]].map(([Icon, label]) => {
                const SecurityIcon = Icon as typeof Lock;
                return <div key={label as string} className="bg-deep p-6"><SecurityIcon className="size-5 text-primary" /><h3 className="mt-7 text-sm font-bold text-deep-foreground">{label as string}</h3></div>;
              })}
            </div>
          </div>
        </section>

        <section id="faq" className="bg-background px-5 py-24">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.7fr_1.3fr]">
            <div><p className="text-eyebrow">Good to know</p><h2 className="mt-4 text-3xl font-bold sm:text-5xl">Questions before you begin.</h2></div>
            <div className="border-t border-border">
              {faqs.map(({ q, a }) => <details key={q} className="group border-b border-border py-6"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display font-bold"><span>{q}</span><span className="text-xl font-normal text-primary group-open:rotate-45">+</span></summary><p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">{a}</p></details>)}
            </div>
          </div>
        </section>

        <section className="bg-primary px-5 py-20 text-center text-primary-foreground">
          <div className="mx-auto max-w-4xl">
            <h2 className="font-display text-4xl font-bold text-primary-foreground sm:text-6xl">Ready before next Sunday.</h2>
            <p className="mx-auto mt-5 max-w-xl text-primary-foreground/70">Create your church, add a service and welcome your first member in minutes.</p>
             <Button asChild size="lg" className="mt-8 h-12 bg-deep text-deep-foreground hover:bg-deep/90"><Link to="/onboarding">Start with Mene:Log <ArrowRight /></Link></Button>
          </div>
        </section>
      </main>

      <SiteFooter />
      <PublicAskMene />
    </div>
  );
}