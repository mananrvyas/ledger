import "server-only";
import { z } from "zod";
import { callClaudeWithSchema } from "@/lib/anthropic";

/**
 * WhatsApp reply intent parser.
 *
 * One Claude Haiku call per inbound text body; the model returns a single
 * Action object with any combination of optional fields. A reply like
 * "categorize correctly and split half and half" can recategorize AND split
 * in one shot — we don't force the user to pick one operation.
 *
 * Each field maps directly to a column update the handler can apply
 * independently. `unclear` is set ONLY when nothing else was actionable.
 */

// ---------------------------------------------------------------------------
// Schema — single object with optional action fields
// ---------------------------------------------------------------------------

const RecategorizeAction = z.object({
  new_category: z
    .string()
    .describe("MUST be exactly one of the names in the provided category list"),
});

const SplitAction = z.object({
  split_type: z.enum(["percent", "fixed", "ratio"]),
  split_value: z
    .number()
    .describe(
      "percent: 0-100 (so 20% = 20). fixed: dollar amount. ratio: fraction 0-1 (so 1/3 = 0.3333).",
    ),
  split_raw_input: z
    .string()
    .describe("The user's original phrasing for this split, preserved for audit"),
});

/**
 * The single command object Claude returns. Any combination of fields is
 * legal. If NO actionable fields are present, `unclear` carries the reason.
 */
const ActionSchema = z.object({
  recategorize: RecategorizeAction.nullable(),
  split: SplitAction.nullable(),
  note: z.string().nullable().describe("Free-form note to attach, if any"),
  /**
   * Tri-state: true = exclude from stats, false = include back in stats,
   * null = no change to inclusion.
   */
  exclude_set: z.boolean().nullable(),
  unclear: z
    .string()
    .nullable()
    .describe(
      "Set ONLY when no other field is actionable. One short sentence on what was unclear.",
    ),
});

export type Action = z.infer<typeof ActionSchema>;

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const INTENT_SYSTEM_PROMPT = `You parse personal-finance edit commands sent via WhatsApp.

The user is editing ONE specific transaction (provided in context). They may ask for MULTIPLE changes in one message — do all of them.

Output VALID JSON matching the provided schema. No prose.

Set the fields that apply, leave the rest as null:

- recategorize: { new_category } — pick the EXACT category name from the provided list. Examples: "this is travel", "actually groceries", "no, coffee".

- split: { split_type, split_value, split_raw_input } — user is paying only part.
  - "1/3" or "1 of 3" → ratio, 0.3333
  - "20%" or "20 percent" → percent, 20
  - "$8" or "8 dollars" → fixed, 8.00
  - "half" or "half and half" or "50/50" → ratio, 0.5
  - "split with 2 friends" (3 people total) → ratio, 0.3333
  Always preserve the user's exact phrasing in split_raw_input.

- note: free-form context the user wants saved with the transaction.
  Examples: "with sarah and mike", "birthday gift for mom", "annual subscription".
  Do NOT auto-generate a note from a recategorize/split command — only set this when the user EXPLICITLY adds context that doesn't fit the other fields.

- exclude_set: true if user wants the tx excluded from stats ("ignore this", "not mine", "don't count this", "skip"). false if they want to include it back ("include this", "count this again"). null otherwise.

- unclear: set this string ONLY if NONE of the above apply. Examples: bare acks like "yes", "ok", "lol", or genuinely ambiguous text. If you set unclear, ALL other fields must be null.

Rules:
- Multiple actions in one reply are FINE. "categorize as travel and split half" → recategorize + split, both set.
- new_category MUST be EXACTLY one of the names in the provided list (case-sensitive). If user names something not on the list, pick the closest fit; if nothing fits, use "Other".
- If a single message contains a recategorize hint AND a split, do both — don't drop one.
- Never invent fields or values. Leave fields null when nothing in the user's text supports them.`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type ParseIntentParams = {
  body: string;
  transaction: {
    amount: number;
    merchant: string;
    current_category: string | null;
  };
  userCategories: string[];
};

export type ParseIntentResult =
  | { ok: true; action: Action }
  | { ok: false; reason: "parse_failed" | "refusal" | "max_tokens" };

/** True iff the action contains at least one applicable field. */
export function hasActionableField(a: Action): boolean {
  return (
    a.recategorize != null ||
    a.split != null ||
    (a.note != null && a.note.trim().length > 0) ||
    a.exclude_set != null
  );
}

/**
 * Run the intent parser. Throws on transient API errors (let QStash retry).
 * Returns `{ ok: false }` only on logical LLM failures.
 */
export async function parseWhatsAppIntent(
  params: ParseIntentParams,
): Promise<ParseIntentResult> {
  const { body, transaction, userCategories } = params;

  const userPrompt = [
    `Transaction: $${Math.abs(transaction.amount).toFixed(2)} at ${transaction.merchant} — current category: ${transaction.current_category ?? "(none)"}`,
    `Available categories: ${JSON.stringify(userCategories)}`,
    "",
    `User reply: ${JSON.stringify(body)}`,
  ].join("\n");

  const response = await callClaudeWithSchema({
    system: INTENT_SYSTEM_PROMPT,
    user: userPrompt,
    schema: ActionSchema,
    maxTokens: 384,
  });

  if (!response.ok) {
    return { ok: false, reason: response.reason };
  }

  // Defense in depth: validate that recategorize.new_category is on the list.
  // If Claude drifts (rare), coerce to "Other" rather than corrupting state.
  const action = response.value;
  if (action.recategorize) {
    if (!userCategories.includes(action.recategorize.new_category)) {
      action.recategorize = {
        new_category: userCategories.includes("Other")
          ? "Other"
          : userCategories[0],
      };
    }
  }

  return { ok: true, action };
}
