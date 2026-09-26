import { Link } from "@tanstack/react-router";
import { MeneLogLogo } from "@/components/MeneLogLogo";

/** Shared public footer for the homepage, Terms and Privacy pages. */
export function SiteFooter() {
  return (
    <footer className="bg-deep px-5 py-12 text-deep-foreground">
      <div className="mx-auto max-w-7xl border-t border-deep-foreground/15 pt-9">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-sm">
            <MeneLogLogo variant="light" className="h-10 max-w-48" />
            <p className="mt-3 text-sm leading-relaxed text-deep-foreground/55">
              Attendance, membership and care records for churches — one clear record from the door to
              the week ahead.
            </p>
          </div>
          <nav className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm text-deep-foreground/70 sm:grid-cols-3">
            <a href="/#features" className="hover:text-deep-foreground">Features</a>
            <a href="/#pricing" className="hover:text-deep-foreground">Plans</a>
            <a href="/#faq" className="hover:text-deep-foreground">Questions</a>
            <Link to="/church-membership-software" className="hover:text-deep-foreground">Membership software</Link>
            <Link to="/church-check-in-software" className="hover:text-deep-foreground">Check-in software</Link>
            <Link to="/terms" className="hover:text-deep-foreground">Terms of Use</Link>
            <Link to="/privacy" className="hover:text-deep-foreground">Privacy Policy</Link>
            <Link to="/auth" search={{ mode: "signin" }} className="hover:text-deep-foreground">Sign in</Link>
          </nav>
        </div>
        <div className="mt-9 flex flex-col gap-2 border-t border-deep-foreground/10 pt-6 text-xs text-deep-foreground/45 sm:flex-row sm:items-center sm:justify-between">
          <span>A product of Prime Haven IT Solutions &amp; Consultancy</span>
          <span>© {new Date().getFullYear()} Mene:Log. All rights reserved.</span>
        </div>
      </div>
    </footer>
  );
}
