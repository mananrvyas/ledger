/**
 * Plaid Personal Finance Category (PFC) → our 19-category taxonomy.
 *
 * Plaid emits a `primary` (e.g. FOOD_AND_DRINK) and an optional `detailed`
 * (e.g. FOOD_AND_DRINK_COFFEE). When the detailed code refines the primary
 * (e.g. coffee vs eating out), we use it to disambiguate.
 *
 * Plaid also returns a `confidence_level` ∈ {VERY_HIGH, HIGH, MEDIUM, LOW,
 * UNKNOWN}. The waterfall (lib/categorize.ts) only trusts VERY_HIGH and HIGH —
 * the rest fall through to learned rules and the LLM.
 *
 * Reference: https://plaid.com/docs/api/products/transactions/#categoriesget
 */

const PRIMARY_MAP: Record<string, string> = {
  INCOME: "Income",
  TRANSFER_IN: "Transfer",
  TRANSFER_OUT: "Transfer",
  LOAN_PAYMENTS: "Fees",
  BANK_FEES: "Fees",
  ENTERTAINMENT: "Entertainment",
  FOOD_AND_DRINK: "Eating Out",
  GENERAL_MERCHANDISE: "Shopping",
  HOME_IMPROVEMENT: "Shopping",
  MEDICAL: "Health",
  PERSONAL_CARE: "Personal Care",
  GENERAL_SERVICES: "Other",
  GOVERNMENT_AND_NON_PROFIT: "Other",
  TRANSPORTATION: "Transit",
  TRAVEL: "Travel",
  RENT_AND_UTILITIES: "Rent",
  RECREATION: "Entertainment",
  EDUCATION: "Other",
};

/**
 * Detail-level overrides. When Plaid's detailed code refines our primary
 * mapping, we use the detail. Otherwise we fall back to PRIMARY_MAP.
 */
const DETAIL_OVERRIDE: Record<string, string> = {
  // Food: refine to Coffee or Groceries
  FOOD_AND_DRINK_COFFEE: "Coffee",
  FOOD_AND_DRINK_GROCERIES: "Groceries",

  // Rent vs Utilities
  RENT_AND_UTILITIES_RENT: "Rent",
  RENT_AND_UTILITIES_TELEPHONE: "Utilities",
  RENT_AND_UTILITIES_INTERNET: "Utilities",
  RENT_AND_UTILITIES_GAS_AND_ELECTRICITY: "Utilities",
  RENT_AND_UTILITIES_WATER: "Utilities",
  RENT_AND_UTILITIES_SEWAGE_AND_WASTE_MANAGEMENT: "Utilities",
  RENT_AND_UTILITIES_OTHER_UTILITIES: "Utilities",

  // Recreation: refine to Fitness when relevant
  RECREATION_GYMS_AND_FITNESS_CENTERS: "Fitness",
  RECREATION_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS: "Entertainment",

  // Personal care: pharmacy → Health
  PERSONAL_CARE_PHARMACIES_AND_SUPPLEMENTS: "Health",

  // General merchandise refinements
  GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES: "Gifts",
  GENERAL_MERCHANDISE_BOOKSTORES: "Shopping",
  GENERAL_MERCHANDISE_SUPERSTORES: "Shopping",

  // Subscription-y services
  GENERAL_SERVICES_SUBSCRIPTION_SERVICES: "Subscriptions",
  ENTERTAINMENT_TV_AND_MOVIES: "Subscriptions",
  ENTERTAINMENT_MUSIC_AND_AUDIO: "Subscriptions",
  ENTERTAINMENT_VIDEO_GAMES: "Entertainment",
};

export type PlaidConfidence =
  | "VERY_HIGH"
  | "HIGH"
  | "MEDIUM"
  | "LOW"
  | "UNKNOWN"
  | null;

/**
 * Map a Plaid primary + detailed code to our taxonomy. Returns null if Plaid
 * provided no usable code (very rare — usually pending pre-categorization txns).
 */
export function mapPlaidCategory(
  primary: string | null | undefined,
  detailed: string | null | undefined,
): string | null {
  if (detailed && DETAIL_OVERRIDE[detailed]) {
    return DETAIL_OVERRIDE[detailed];
  }
  if (primary && PRIMARY_MAP[primary]) {
    return PRIMARY_MAP[primary];
  }
  return null;
}

/** Whether we trust Plaid's category for this transaction without further review. */
export function plaidConfidenceTrusted(
  confidence: PlaidConfidence,
): boolean {
  return confidence === "VERY_HIGH" || confidence === "HIGH";
}

/**
 * Normalize a merchant string for use as a `category_rules.merchant_pattern`.
 * Strips trailing store numbers (Starbucks #4521) and other digit suffixes,
 * lowercases, collapses whitespace, removes most punctuation. Lossy by design —
 * the goal is "different formattings of the same merchant collide on the same
 * key."
 */
export function normalizeMerchant(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 &\-']/g, "")
    .replace(/\s+#\d+\s*$/, "")
    .replace(/\s+\d{3,}\s*$/, "")
    .trim();
  return trimmed.length > 0 ? trimmed : null;
}
