import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ChevronRight,
  ChevronLeft,
  X,
  Compass,
  Sparkles,
  CheckCircle2,
  Play,
  ArrowRight,
  MousePointerClick,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTenant } from "@/hooks/useTenant";
import type { TourStep } from "./types";

export function WalkthroughTour() {
  const navigate = useNavigate();
  const ctx = useTenant();
  const { tenant } = ctx;
  const currentPath = useRouterState({ select: (s) => s.location.pathname });

  // 1. Build the active steps strictly based on current tier entitlements
  const steps: TourStep[] = useMemo(() => {
    const list: TourStep[] = [
      // 1. Dashboard Overview
      {
        id: "nav-dashboard",
        route: "/dashboard",
        targetSelector: '[data-tour="nav-dashboard"]',
        title: "Executive Operations Hub",
        description:
          "Your central command. Track Sunday attendance totals, demographic ratios, and real-time ministry KPIs in one place.",
        badge: "Core Operations",
        actionText: "Explore Operations Hub",
      },
      {
        id: "page-kpi-cards",
        route: "/dashboard",
        targetSelector: '[data-tour="page-kpi-cards"]',
        title: "Live Attendance & Member KPIs",
        description:
          "Monitor Sunday attendees, 30-day first-time visitors, active member capacity, and celebrated birthdays in real-time.",
        badge: "Sub-Page Action",
        isSubPage: true,
      },
      {
        id: "page-attendance-trend",
        route: "/dashboard",
        targetSelector: '[data-tour="page-attendance-trend"]',
        title: "Sunday Attendance Growth Curve",
        description:
          "A visual retention trend illustrating congregation attendance across all recorded Sunday and midweek gatherings.",
        badge: "Sub-Page Action",
        isSubPage: true,
      },

      // 2. Door Check-in & Scanner
      {
        id: "nav-scan",
        route: "/scan",
        targetSelector: '[data-tour="nav-scan"]',
        title: "Sub-4s QR Door Check-In",
        description:
          "Check in members in under four seconds. Click here to launch the high-speed check-in scanner.",
        badge: "Door Check-in",
        actionText: "Open Scanner Page",
      },
      {
        id: "page-camera-scanner",
        route: "/scan",
        targetSelector: '[data-tour="page-camera-scanner"]',
        title: "Live Camera Scanner & Passcodes",
        description:
          "Use any laptop webcam, tablet, or mobile phone camera to scan physical QR passes with instant audio confirmation.",
        badge: "Sub-Page Action",
        isSubPage: true,
      },

      // 3. Live Attendance Register
      {
        id: "nav-attendance",
        route: "/attendance",
        targetSelector: '[data-tour="nav-attendance"]',
        title: "Live Attendance Register",
        description:
          "A live roster of attendees. Mark present with one click, search members, and export timestamped registers to CSV.",
        badge: "Records & Registers",
        actionText: "View Register Page",
      },
      {
        id: "page-attendance-actions",
        route: "/attendance",
        targetSelector: '[data-tour="page-attendance-actions"]',
        title: "Register Actions & CSV Export",
        description:
          "Export finalized service rosters directly to CSV, or register quick walk-in guests at the door on Sunday morning.",
        badge: "Sub-Page Action",
        isSubPage: true,
      },

      // 4. Church Services
      {
        id: "nav-services",
        route: "/services",
        targetSelector: '[data-tour="nav-services"]',
        title: "Church Services & Programs",
        description:
          "Configure Sunday celebrations, midweek prayer gatherings, and set up live stream virtual attendance links.",
        badge: "Service Times",
        actionText: "Manage Services",
      },
      {
        id: "page-create-service",
        route: "/services",
        targetSelector: '[data-tour="page-create-service"]',
        title: "Schedule New Service",
        description:
          "Click here to create a new Sunday service, revival program, or special conference with attendance targets.",
        badge: "Sub-Page Action",
        isSubPage: true,
      },

      // 5. Congregation Directory
      {
        id: "nav-members",
        route: "/members",
        targetSelector: '[data-tour="nav-members"]',
        title: "Congregation Directory",
        description:
          "Your comprehensive flock directory. Upload member portraits, log residential areas, and generate printable digital QR passcards.",
        badge: "People & Directory",
        actionText: "Open Member Directory",
      },
      {
        id: "page-add-member",
        route: "/members",
        targetSelector: '[data-tour="page-add-member"]',
        title: "Register New Member Profile",
        description:
          "Enroll new members with full personal records, family details, departments, and automatically generated QR cards.",
        badge: "Sub-Page Action",
        isSubPage: true,
      },
      {
        id: "page-member-search",
        route: "/members",
        targetSelector: '[data-tour="page-member-search"]',
        title: "Instant Search & Filtering",
        description:
          "Search congregation members by full name, phone number, residential area, or occupation in real time.",
        badge: "Sub-Page Action",
        isSubPage: true,
      },
    ];

    // Conditionally append features ONLY if unlocked for this church's tier
    if (ctx.can("followups")) {
      list.push(
        {
          id: "nav-followups",
          route: "/followups",
          targetSelector: '[data-tour="nav-followups"]',
          title: "Pastoral Care & Follow-ups",
          description:
            "Empower your welfare team. Log calls, track first-timer visits, and receive automated absence alerts when regulars miss services.",
          badge: "Pastoral Welfare",
          feature: "followups",
          actionText: "View Follow-up Board",
        },
        {
          id: "page-followups-cards",
          route: "/followups",
          targetSelector: '[data-tour="page-followups-cards"]',
          title: "Visitor & Absence Pipeline",
          description:
            "Assign pastoral calls to department leaders, update visit status, and ensure no soul slips through the cracks.",
          badge: "Sub-Page Action",
          isSubPage: true,
        }
      );
    }

    if (ctx.can("leaders")) {
      list.push(
        {
          id: "nav-leaders",
          route: "/leaders",
          targetSelector: '[data-tour="nav-leaders"]',
          title: "Pastoral Leadership Oversight",
          description:
            "Delegate ministry care. Assign elders and cell leaders to oversee specific member groups with structured accountability.",
          badge: "Leadership Tier",
          feature: "leaders",
          actionText: "Manage Leaders",
        },
        {
          id: "page-leaders-access",
          route: "/leaders",
          targetSelector: '[data-tour="page-leaders-access"]',
          title: "Leader Passcode & Registration",
          description:
            "Share this single secure church passcode with your ministry heads so they can register and manage their flocks.",
          badge: "Sub-Page Action",
          isSubPage: true,
        }
      );
    }

    if (ctx.can("reports_basic")) {
      list.push(
        {
          id: "nav-reports",
          route: "/reports",
          targetSelector: '[data-tour="nav-reports"]',
          title: "Growth Reports & Analytics",
          description:
            "In-depth attendance summaries, demographic breakdowns, and executive reporting ready for church board meetings.",
          badge: "Analytics",
          feature: "reports_basic",
          actionText: "View Reports",
        },
        {
          id: "page-reports-tabs",
          route: "/reports",
          targetSelector: '[data-tour="page-reports-tabs"]',
          title: "Multi-Service Report Breakdown",
          description:
            "Switch between service attendance totals, first-timer conversion rates, birthdays, and deep demographic insights.",
          badge: "Sub-Page Action",
          isSubPage: true,
        }
      );
    }

    if (ctx.can("broadcasts")) {
      list.push(
        {
          id: "nav-messaging",
          route: "/messaging",
          targetSelector: '[data-tour="nav-messaging"]',
          title: "SMS & Email Broadcasts",
          description:
            "Send instant text messages and branded email announcements to departments or the entire congregation in seconds.",
          badge: "Communications",
          feature: "broadcasts",
          actionText: "Open Messaging",
        },
        {
          id: "page-messaging-form",
          route: "/messaging",
          targetSelector: '[data-tour="page-messaging-form"]',
          title: "Compose Broadcast Announcements",
          description:
            "Compose text messages or emails targeted to specific ministries, absent members, or all congregation families.",
          badge: "Sub-Page Action",
          isSubPage: true,
        }
      );
    }

    if (ctx.can("structure")) {
      list.push(
        {
          id: "nav-structure",
          route: "/structure",
          targetSelector: '[data-tour="nav-structure"]',
          title: "Ministries & Hierarchy Structure",
          description:
            "Organize your church hierarchy: choir, ushering, youth fellowship, cell groups, and custom rank reporting chains.",
          badge: "Church Structure",
          feature: "structure",
          actionText: "Configure Hierarchy",
        },
        {
          id: "page-structure-roles",
          route: "/structure",
          targetSelector: '[data-tour="page-structure-roles"]',
          title: "Leadership Reporting Rules",
          description:
            "Define how leaders report upward (e.g., Cell Leader reports to PCF Leader) to automatically structure attendance.",
          badge: "Sub-Page Action",
          isSubPage: true,
        }
      );
    }

    if (ctx.can("branches")) {
      list.push(
        {
          id: "nav-branches",
          route: "/branches",
          targetSelector: '[data-tour="nav-branches"]',
          title: "Multi-Branch Governance",
          description:
            "Manage multiple campuses, satellite assemblies, and daughter parishes under one central head-office administration.",
          badge: "Multi-Campus",
          feature: "branches",
          actionText: "Manage Branches",
        },
        {
          id: "page-branches-add",
          route: "/branches",
          targetSelector: '[data-tour="page-branches-add"]',
          title: "Register New Branch Campus",
          description:
            "Provision a daughter assembly with its own localized check-in URL, leadership team, and attendance quotas.",
          badge: "Sub-Page Action",
          isSubPage: true,
        }
      );
    }

    // Billing & Plans
    list.push(
      {
        id: "nav-billing",
        route: "/billing",
        targetSelector: '[data-tour="nav-billing"]',
        title: "Subscription & Church Plans",
        description:
          "Manage your 30-day trial status, upgrade or downgrade packages, and acquire extra member capacity add-ons.",
        badge: "Account & Plans",
        actionText: "View Church Plans",
      },
      {
        id: "page-billing-cards",
        route: "/billing",
        targetSelector: '[data-tour="page-billing-cards"]',
        title: "Active Package & 30-Day Trial Status",
        description:
          "Review trial days remaining, renewal schedules, and add extra member space as your congregation expands.",
        badge: "Sub-Page Action",
        isSubPage: true,
      }
    );

    // Final Step: Orientation Tutorial Video on Dashboard
    list.push({
      id: "tutorial_video",
      route: "/dashboard",
      targetSelector: '[data-tour="dashboard-tutorial-banner"]',
      title: "Final Step: Watch System Tutorial Video",
      description:
        "You've completed the feature tour! Watch this short tutorial right here on your dashboard to master everyday Sunday check-in and digital church management.",
      badge: "Quick Orientation",
      actionText: "Watch Tutorial Video",
    });

    return list;
  }, [ctx]);

  // 2. State management
  const storageKey = tenant?.id ? `menelog_walkthrough_state_${tenant.id}` : null;
  const [active, setActive] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const targetElementRef = useRef<Element | null>(null);

  // Initialize from localStorage or auto-start for new onboarding
  useEffect(() => {
    if (!storageKey) return;
    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) {
        // First-time visit: auto-start walkthrough
        setActive(true);
        setCurrentStepIndex(0);
      }
    } catch {
      // ignore
    }
  }, [storageKey]);

  // Listen for manual restart event
  useEffect(() => {
    const handleRestart = () => {
      setActive(true);
      setCurrentStepIndex(0);
      void navigate({ to: "/dashboard" });
    };
    window.addEventListener("menelog:start-walkthrough", handleRestart);
    return () => window.removeEventListener("menelog:start-walkthrough", handleRestart);
  }, [navigate]);

  const currentStep = steps[currentStepIndex] ?? steps[0]!;

  // 3. Highlight positioning & auto-scroll
  const updateTargetPosition = useCallback(() => {
    if (!active || !currentStep) return;
    const el = document.querySelector(currentStep.targetSelector);
    targetElementRef.current = el;
    if (el) {
      const rect = el.getBoundingClientRect();
      setTargetRect(rect);
    } else {
      setTargetRect(null);
    }
  }, [active, currentStep]);

  useEffect(() => {
    updateTargetPosition();
    // Scroll element smoothly into view if offscreen
    if (active && targetElementRef.current) {
      targetElementRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }

    const handleResize = () => updateTargetPosition();
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleResize, { passive: true });
    const timer = setInterval(updateTargetPosition, 300);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize);
      clearInterval(timer);
    };
  }, [updateTargetPosition, active, currentStepIndex]);

  // 4. Navigation & Step Transitions
  const goToStep = (index: number) => {
    if (index < 0 || index >= steps.length) return;
    const targetStep = steps[index]!;
    setCurrentStepIndex(index);

    // If step requires a different route, navigate there
    if (targetStep.route && currentPath !== targetStep.route) {
      void navigate({ to: targetStep.route });
    }
  };

  const handleNext = () => {
    if (currentStepIndex < steps.length - 1) {
      goToStep(currentStepIndex + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      goToStep(currentStepIndex - 1);
    }
  };

  const handleComplete = () => {
    setActive(false);
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ completed: true, timestamp: Date.now() }));
      } catch {
        // ignore
      }
    }
  };

  // Clicking on the spotlighted frame itself triggers navigation or next step
  const handleSpotlightClick = () => {
    if (targetElementRef.current instanceof HTMLElement) {
      targetElementRef.current.click();
    }
    handleNext();
  };

  if (!active || !currentStep) return null;

  const isLast = currentStepIndex === steps.length - 1;
  const isFirst = currentStepIndex === 0;

  // Calculate tooltip placement relative to target element
  const cardTop = targetRect
    ? Math.min(Math.max(targetRect.top - 10, 80), window.innerHeight - 360)
    : 120;
  const cardLeft = targetRect
    ? targetRect.right + 24 < window.innerWidth - 390
      ? targetRect.right + 24
      : Math.max(targetRect.left - 400, 20)
    : 80;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none select-none">
      {/* Dimmed background backdrop */}
      <div
        onClick={handleComplete}
        className="pointer-events-auto absolute inset-0 bg-slate-950/60 backdrop-blur-[2px] transition-opacity duration-300"
      />

      {/* Target element spotlight frame & pulsing beacon */}
      {targetRect && (
        <div
          onClick={handleSpotlightClick}
          style={{
            top: `${Math.max(0, targetRect.top - 6)}px`,
            left: `${Math.max(0, targetRect.left - 6)}px`,
            width: `${targetRect.width + 12}px`,
            height: `${targetRect.height + 12}px`,
          }}
          className="pointer-events-auto cursor-pointer absolute rounded-xl ring-4 ring-primary shadow-[0_0_35px_rgba(59,130,246,0.7)] transition-all duration-300 z-50 bg-primary/10 hover:bg-primary/20 hover:ring-sky-400 group"
          title="Click to interact with this feature"
        >
          {/* Pulsing beacon radar dot */}
          <span className="absolute -top-2 -right-2 flex size-5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex size-5 rounded-full bg-primary border-2 border-white shadow-md" />
          </span>

          {/* Interactive hint badge */}
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 hidden group-hover:flex items-center gap-1 rounded-md bg-black/90 px-2 py-0.5 text-[10px] font-semibold text-white whitespace-nowrap shadow-lg">
            <MousePointerClick className="size-3 text-sky-400" />
            <span>Click to enter</span>
          </div>
        </div>
      )}

      {/* Floating Guided Tour Card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep.id}
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ duration: 0.2 }}
          style={{
            top: `${cardTop}px`,
            left: `${cardLeft}px`,
          }}
          className="pointer-events-auto fixed z-50 w-[92vw] sm:w-[380px] rounded-2xl border border-white/20 bg-slate-900/95 p-5 text-white shadow-2xl backdrop-blur-2xl ring-1 ring-black/50"
        >
          {/* Card Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-lg bg-primary/20 text-primary">
                <Compass className="size-4" />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                {currentStep.badge}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-zinc-400">
                {currentStepIndex + 1} of {steps.length}
              </span>
              <button
                type="button"
                onClick={handleComplete}
                aria-label="Skip Tour"
                className="grid size-6 place-items-center rounded-md text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{
                width: `${((currentStepIndex + 1) / steps.length) * 100}%`,
              }}
            />
          </div>

          {/* Card Body */}
          <div className="mt-4">
            <h3 className="font-display text-lg font-bold text-white tracking-tight flex items-center gap-2">
              {currentStep.title}
              {currentStep.isSubPage && (
                <span className="text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300">
                  Page Control
                </span>
              )}
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-zinc-300">
              {currentStep.description}
            </p>

            {/* Interactive feature prompt */}
            <div className="mt-3.5 flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 text-[11px] text-zinc-200">
              <Sparkles className="size-3.5 text-primary shrink-0" />
              <span>
                {currentStep.isSubPage
                  ? "Interact with the highlighted control or proceed to the next step."
                  : "Click the highlighted menu beacon or click Next to explore this page."}
              </span>
            </div>
          </div>

          {/* Card Footer Actions */}
          <div className="mt-5 flex items-center justify-between pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={handleComplete}
              className="text-xs font-medium text-zinc-400 hover:text-white transition-colors"
            >
              Skip Tour
            </button>

            <div className="flex items-center gap-2">
              {!isFirst && (
                <button
                  type="button"
                  onClick={handlePrev}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <ChevronLeft className="size-3.5" />
                  Prev
                </button>
              )}

              <button
                type="button"
                onClick={handleNext}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground shadow-md transition-all hover:bg-primary/90 active:scale-95"
              >
                {isLast ? (
                  <>
                    <span>Finish</span>
                    <CheckCircle2 className="size-3.5" />
                  </>
                ) : (
                  <>
                    <span>{currentStep.actionText || "Next"}</span>
                    <ChevronRight className="size-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
