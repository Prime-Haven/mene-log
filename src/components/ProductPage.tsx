import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, Lock, QrCode, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MeneLogLogo } from "@/components/MeneLogLogo";
import { SiteFooter } from "@/components/SiteFooter";

type ProductPageProps = {
  eyebrow: string;
  title: string;
  intro: string;
  highlights: Array<{ title: string; body: string }>;
  workflow: string[];
};

export function ProductPage({ eyebrow, title, intro, highlights, workflow }: ProductPageProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 px-5 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-5">
          <Link to="/" aria-label="Mene:Log home"><MeneLogLogo className="h-10 max-w-48" /></Link>
          <nav className="hidden items-center gap-6 text-sm font-semibold md:flex">
            <Link to="/church-membership-software" className="text-muted-foreground hover:text-foreground">Membership</Link>
            <Link to="/church-check-in-software" className="text-muted-foreground hover:text-foreground">Check-in</Link>
            <a href="/#pricing" className="text-muted-foreground hover:text-foreground">Plans</a>
          </nav>
          <Button asChild size="sm"><Link to="/onboarding">Start free <ArrowRight /></Link></Button>
        </div>
      </header>

      <main>
        <section className="bg-deep px-5 py-20 text-deep-foreground sm:py-28">
          <div className="mx-auto max-w-7xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
            <h1 className="mt-5 max-w-5xl font-display text-4xl font-bold leading-tight text-deep-foreground sm:text-6xl">{title}</h1>
            <p className="mt-6 max-w-3xl text-base leading-relaxed text-deep-foreground/70 sm:text-xl">{intro}</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-12"><Link to="/onboarding">Create your church <ArrowRight /></Link></Button>
              <Button asChild size="lg" variant="outline" className="h-12 border-deep-foreground/25 bg-deep-foreground/5 text-deep-foreground hover:bg-deep-foreground/10 hover:text-deep-foreground"><a href="/#pricing">Compare plans</a></Button>
            </div>
          </div>
        </section>

        <section className="px-5 py-20 sm:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-3">
              {highlights.map((item, index) => {
                const Icon = index === 0 ? Users : index === 1 ? QrCode : Lock;
                return <article key={item.title} className="bg-card p-7 sm:p-9"><Icon className="size-5 text-primary" /><h2 className="mt-12 font-display text-xl font-bold">{item.title}</h2><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.body}</p></article>;
              })}
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-muted/45 px-5 py-20 sm:py-24">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.8fr_1.2fr]">
            <div><p className="text-eyebrow">A connected workflow</p><h2 className="mt-4 font-display text-3xl font-bold sm:text-5xl">Useful on Sunday. Clear all week.</h2></div>
            <ol className="divide-y divide-border border-y border-border">
              {workflow.map((step, index) => <li key={step} className="flex gap-5 py-6"><span className="font-mono text-xs font-bold text-primary">0{index + 1}</span><span className="font-semibold leading-relaxed">{step}</span></li>)}
            </ol>
          </div>
        </section>

        <section className="px-5 py-20 text-center sm:py-24">
          <Check className="mx-auto size-6 text-success" />
          <h2 className="mx-auto mt-5 max-w-3xl font-display text-3xl font-bold sm:text-5xl">Start with the Free plan. Keep every person counted and cared for.</h2>
          <Button asChild size="lg" className="mt-8 h-12"><Link to="/onboarding">Start with Mene:Log <ArrowRight /></Link></Button>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}