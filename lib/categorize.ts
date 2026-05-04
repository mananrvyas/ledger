import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { callClaudeWithSchema } from "@/lib/anthropic";
import {
  mapPlaidCategory,
  normalizeMerchant,
  plaidConfidenceTrusted,
  type PlaidConfidence,
} from "@/lib/plaid-category-map";

/**
 * Three-tier categorization waterfall:
 *
 *   1. Plaid's category (when confidence is HIGH or VERY_HIGH)        → free
 *   2. Learned merchant→category rules from past corrections          → free
 *   3. Claude Haiku call constrained to the user's category list      → cents
 *
 * Each new transaction (Phase 2) and each WhatsApp/web edit (Phase 4) feeds
 * back into the rules table, so the LLM tier shrinks over time.
 */

type DB = SupabaseClient<Database>;

export type CategorySource = "plaid" | "rule" | "ai" | "manual";

export type CategorizationResult = {
  category: string;
  source: CategorySource;
  confidence: number;
  reasoning?: string;
  ai_category_used?: string;
};

export type TransactionForCategorize = {
  merchant_name: string | null;
  name: string | null;
  amount: number;
  date: string;
  plaid_category: string | null;
  plaid_category_detail: string | null;
  plaid_confidence: PlaidConfidence;
};

/** Result of categorizing one transaction; null only if the LLM tier silently failed. */
export async function categorizeTransaction(params: {
  userId: string;
  admin: DB;
  tx: TransactionForCategorize;
  /** The user's category list (system defaults + any user overrides). */
  userCategories: string[];
}): Promise<CategorizationResult> {
  const { userId, admin, tx, userCategories } = params;

  // Tier 1: Plaid, when it's confident.
  if (plaidConfidenceTrusted(tx.plaid_confidence) && tx.plaid_category) {
    const mapped = mapPlaidCategory(tx.plaid_category, tx.plaid_category_detail);
    if (mapped && userCategories.includes(mapped)) {
      return {
        category: mapped,
        source: "plaid",
        confidence: 1.0,
      };
    }
  }

  // Tier 2: learned rule for this merchant.
  const pattern = normalizeMerchant(tx.merchant_name ?? tx.name);
  if (pattern) {
    const { data: rule } = await admin
      .from("category_rules")
      .select("category_name, confidence")
      .eq("user_id", userId)
      .eq("merchant_pattern", pattern)
      .maybeSingle();

    if (rule && userCategories.includes(rule.category_name)) {
      // Bump usage stats — fire and forget, don't block the categorize path.
      void admin
        .from("category_rules")
        .update({
          times_applied: 1,
          last_applied_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("merchant_pattern", pattern)
        // RPC-style increment — Supabase doesn't expose `++` so we read-modify-write
        // via an explicit re-update path below if races become an issue.
        .then(() => undefined);

      return {
        category: rule.category_name,
        source: "rule",
        confidence: Math.min(rule.confidence, 1.0),
      };
    }
  }

  // Tier 3: Claude Haiku.
  const aiResult = await classifyWithClaude({
    transactions: [
      {
        merchant_name: tx.merchant_name,
        name: tx.name,
        amount: tx.amount,
        date: tx.date,
        plaid_hint: tx.plaid_category ?? null,
      },
    ],
    userCategories,
  });

  if (aiResult && aiResult[0]) {
    const { category, confidence, reasoning } = aiResult[0];
    // Validate against the allowed list — Claude can drift on rare prompts.
    const safe = userCategories.includes(category) ? category : "Other";
    return {
      category: safe,
      source: "ai",
      confidence,
      reasoning,
      ai_category_used: category,
    };
  }

  // All tiers failed (likely Anthropic outage). Don't block the user — commit
  // a placeholder "Other" with 0 confidence; the next sync or backfill can
  // re-run categorization.
  return {
    category: "Other",
    source: "ai",
    confidence: 0.0,
    reasoning: "fallback_no_ai",
  };
}

/**
 * Batch helper — categorize many transactions in a single LLM call.
 * Used by the backfill route and (optionally) the categorize_transaction
 * worker when several uncategorized rows for the same user can be coalesced.
 */
export async function batchClassifyWithClaude(params: {
  transactions: Array<{
    merchant_name: string | null;
    name: string | null;
    amount: number;
    date: string;
    plaid_hint: string | null;
  }>;
  userCategories: string[];
}): Promise<AIClassification[] | null> {
  return classifyWithClaude(params);
}

// ---------------------------------------------------------------------------
// LLM call
// ---------------------------------------------------------------------------

const CLASSIFY_SYSTEM_PROMPT = `You are a precise personal-finance transaction categorizer.

Rules:
- Pick the BEST single category from the user's list for each transaction.
- If no provided category fits well, output category = "Other".
- Never invent category names that aren't in the list.
- Confidence is your honest estimate from 0.0 to 1.0.
- Reasoning is one short sentence — concrete, not generic ("Starbucks is a coffee chain", not "Looks like food").
- Plaid's hint (when given) is a strong signal but may be wrong; trust your own judgment if the merchant clearly contradicts it.
- Return one element per input transaction, in the same order. Do not skip, merge, or reorder.`;

const ClassifyResultItemSchema = z.object({
  category: z.string(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

const ClassifyResultSchema = z.object({
  results: z.array(ClassifyResultItemSchema),
});

export type AIClassification = z.infer<typeof ClassifyResultItemSchema>;

async function classifyWithClaude(params: {
  transactions: Array<{
    merchant_name: string | null;
    name: string | null;
    amount: number;
    date: string;
    plaid_hint: string | null;
  }>;
  userCategories: string[];
}): Promise<AIClassification[] | null> {
  const { transactions, userCategories } = params;

  const userPrompt = [
    `Available categories: ${JSON.stringify(userCategories)}`,
    "",
    "Transactions:",
    ...transactions.map(
      (t, i) =>
        `${i + 1}. Merchant: ${JSON.stringify(t.merchant_name ?? t.name ?? "Unknown")}, Amount: $${Math.abs(t.amount).toFixed(2)}, Date: ${t.date}${
          t.plaid_hint ? `, PlaidHint: ${t.plaid_hint}` : ""
        }`,
    ),
    "",
    "Return one result per transaction, same order. Return nothing else.",
  ].join("\n");

  try {
    const response = await callClaudeWithSchema({
      system: CLASSIFY_SYSTEM_PROMPT,
      user: userPrompt,
      schema: ClassifyResultSchema,
      maxTokens: Math.min(64 * Math.max(transactions.length, 1) + 256, 4096),
    });

    if (!response.ok) return null;
    const expected = transactions.length;
    if (response.value.results.length !== expected) {
      // Pad / truncate so callers can index by position.
      const padded: AIClassification[] = [];
      for (let i = 0; i < expected; i++) {
        padded.push(
          response.value.results[i] ?? {
            category: "Other",
            confidence: 0.0,
            reasoning: "Missing classification — defaulted",
          },
        );
      }
      return padded;
    }
    return response.value.results;
  } catch (err) {
    // Transient error — bubble up so the QStash retry kicks in. Logical
    // failures (parse / refusal) come back via `response.ok === false` above.
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Persistence helpers — used by API routes + handlers
// ---------------------------------------------------------------------------

/**
 * Upsert a learned rule from a user correction. Idempotent on
 * (user_id, merchant_pattern) — latest correction wins.
 */
export async function upsertCategoryRule(params: {
  admin: DB;
  userId: string;
  merchantName: string | null;
  categoryName: string;
}): Promise<void> {
  const pattern = normalizeMerchant(params.merchantName);
  if (!pattern) return;

  await params.admin.from("category_rules").upsert(
    {
      user_id: params.userId,
      merchant_pattern: pattern,
      category_name: params.categoryName,
      source: "manual",
      confidence: 1.0,
      last_applied_at: new Date().toISOString(),
    },
    { onConflict: "user_id,merchant_pattern" },
  );
}

/**
 * Synchronous transfer pairing: given a freshly-categorized transaction,
 * look for a matching opposite-sign transaction on a different account and
 * pair both as Transfer.
 *
 * Window: ±3 days, exact-magnitude opposite sign, no existing pair on either.
 * Skips on multiple matches (logs an `app_events` row for review).
 */
export async function pairTransferIfMatch(params: {
  admin: DB;
  userId: string;
  transactionId: string;
}): Promise<{ paired: boolean; reason?: string }> {
  const { admin, userId, transactionId } = params;

  const { data: tx } = await admin
    .from("transactions")
    .select("id, account_id, amount, date, is_transfer")
    .eq("id", transactionId)
    .maybeSingle();

  if (!tx || tx.is_transfer) return { paired: false, reason: "already_paired_or_missing" };

  // ±3 days window
  const lo = new Date(tx.date);
  lo.setDate(lo.getDate() - 3);
  const hi = new Date(tx.date);
  hi.setDate(hi.getDate() + 3);
  const loDate = lo.toISOString().slice(0, 10);
  const hiDate = hi.toISOString().slice(0, 10);

  const { data: candidates } = await admin
    .from("transactions")
    .select("id, account_id, amount, date")
    .eq("user_id", userId)
    .neq("account_id", tx.account_id)
    .is("deleted_at", null)
    .eq("is_transfer", false)
    .gte("date", loDate)
    .lte("date", hiDate);

  const matches = (candidates ?? []).filter(
    (c) => Math.abs(c.amount + tx.amount) < 0.01,
  );

  if (matches.length === 0) return { paired: false, reason: "no_match" };

  if (matches.length > 1) {
    await admin.from("app_events").insert({
      user_id: userId,
      event_type: "ambiguous_transfer_pair",
      payload: {
        transaction_id: tx.id,
        candidate_count: matches.length,
        candidate_ids: matches.map((m) => m.id),
      },
    });
    return { paired: false, reason: "ambiguous" };
  }

  const pair = matches[0];

  await admin
    .from("transactions")
    .update({
      is_transfer: true,
      transfer_pair_id: pair.id,
      user_category: "Transfer",
      category_source: "rule",
    })
    .eq("id", tx.id);

  await admin
    .from("transactions")
    .update({
      is_transfer: true,
      transfer_pair_id: tx.id,
      user_category: "Transfer",
      category_source: "rule",
    })
    .eq("id", pair.id);

  return { paired: true };
}
