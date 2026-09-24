/**
 * The single place that decides what each package includes.
 * The database mirrors this exactly in public.tier_entitlements(), so the
 * browser and the server can never disagree. Change both together.
 */
export type Tier = "free" | "basic" | "standard" | "premium";

export type Feature =
  | "members"
  | "services"
  | "checkin"
  | "qr"
  | "branding"
  | "reports_basic"
  | "reports_advanced"
  | "ask_mene"
  | "structure"
  | "groups"
  | "branches"
  | "leaders"
  | "space_addon"
  | "followups"
  | "email"
  | "sms"
  | "broadcasts"
  | "automations"
  | "audit";

export type Limit = "staff_seats" | "member_limit" | "daily_messages";

type Entitlement = Record<Feature, boolean> & Record<Limit, number>;

export const ENTITLEMENTS: Record<Tier, Entitlement> = {
  free: {
    members: true,
    services: true,
    checkin: true,
    qr: true,
    branding: false,
    reports_basic: false,
    reports_advanced: false,
    ask_mene: false,
    structure: false,
    groups: false,
    branches: false,
    leaders: false,
    space_addon: false,
    followups: false,
    email: false,
    sms: false,
    broadcasts: false,
    automations: false,
    audit: false,
    staff_seats: 1,
    member_limit: 150,
    daily_messages: 0,
  },
  basic: {
    members: true,
    services: true,
    checkin: true,
    qr: true,
    branding: true,
    reports_basic: true,
    reports_advanced: false,
    ask_mene: true,
    structure: false,
    groups: false,
    branches: false,
    leaders: false,
    space_addon: false,
    followups: false,
    email: true,
    sms: false,
    broadcasts: false,
    automations: false,
    audit: true,
    staff_seats: 3,
    member_limit: 500,
    daily_messages: 200,
  },
  standard: {
    members: true,
    services: true,
    checkin: true,
    qr: true,
    branding: true,
    reports_basic: true,
    reports_advanced: true,
    ask_mene: true,
    structure: true,
    groups: true,
    branches: false,
    leaders: true,
    space_addon: true,
    followups: true,
    email: true,
    sms: false,
    broadcasts: true,
    automations: true,
    audit: true,
    staff_seats: 10,
    member_limit: 3000,
    daily_messages: 1000,
  },
  premium: {
    members: true,
    services: true,
    checkin: true,
    qr: true,
    branding: true,
    reports_basic: true,
    reports_advanced: true,
    ask_mene: true,
    structure: true,
    groups: true,
    branches: true,
    leaders: true,
    space_addon: true,
    followups: true,
    email: true,
    sms: true,
    broadcasts: true,
    automations: true,
    audit: true,
    staff_seats: 40,
    member_limit: 25000,
    daily_messages: 5000,
  },
};

export function hasFeature(tier: Tier | undefined, feature: Feature): boolean {
  if (!tier || !ENTITLEMENTS[tier]) return false;
  return ENTITLEMENTS[tier][feature] === true;
}

export function limitOf(tier: Tier | undefined, key: Limit): number {
  if (!tier || !ENTITLEMENTS[tier]) return 0;
  return ENTITLEMENTS[tier][key];
}

/** Plain-language label for each locked capability, used in upgrade panels. */
export const FEATURE_LABELS: Record<Feature, string> = {
  members: "Member registry",
  services: "Services",
  checkin: "Check-in",
  qr: "Member QR codes",
  branding: "Church branding",
  reports_basic: "Reports",
  reports_advanced: "Advanced reports",
  ask_mene: "Ask Mene:Log AI",
  structure: "Leadership structure",
  groups: "Groups",
  branches: "Multiple branches",
  leaders: "Leader accounts",
  space_addon: "Extra member space",
  followups: "First-timer follow-ups",
  email: "Email",
  sms: "Text messages",
  broadcasts: "Broadcasts",
  automations: "Automatic messages",
  audit: "Activity log",
};

/** The cheapest package that unlocks a capability. */
export function requiredTier(feature: Feature): Tier {
  if (ENTITLEMENTS.free[feature]) return "free";
  if (ENTITLEMENTS.basic[feature]) return "basic";
  if (ENTITLEMENTS.standard[feature]) return "standard";
  return "premium";
}
