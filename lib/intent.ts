import "server-only";
import { z } from "zod";
import { callClaudeWithSchema } from "@/lib/anthropic";

/**
 * WhatsApp reply intent parser. One Claude Haiku call per inbound text body.
 *
 * Each reply targets ONE transaction (matching is upstream — see
 * `handlers/parse_wa_reply.ts`). The parser maps free-text English (plus
 * common shorthand: "1/3", "20%", "$8") to a typed Intent the worker can
 * apply directly to the DB.
 *
 * Constraints baked into the prompt:
 *   - new_category MUST come from the user's exact category list
 *     (we then validate again in code — Claude can drift on rare prompts).
 *   - One intent per reply. If user says "split 1/3 and add a note", the
 *     dominant action wins (split) and the rest goes in split_raw_input.
 */

// ---------------------------------------------------------------------------
// Schema — discriminated union of intents
// ---------------------------------------------------------------------------

const RecategorizeSchema = z.object({
  intent: z.literal("recategorize"),
  new_category: z
    .string()
    .describe("MUST be exactly one of the names in the provided category list"),
});

const SplitSchema = z.object({
  intent: z.literal("split"),
  split_type: z.enum(["percent", "fixed", "ratio"]),
  split_value: z
    .number()
    .describe(
      "For percent: 0-100 (so 20% = 20). For fixed: dollar amount. For ratio: fraction 0-1 (so 1/3 = 0.3333).",
    ),
  split_raw_input: z
    .string()
    .describe("The user's original phrasing, preserved for audit"),
});

const NoteSchema = z.object({
  intent: z.literal("note"),
  note: z.string().describe("Free-form note to attach to the transaction"),
});

const ExcludeSchema = z.object({
  intent: z.literal("exclude"),
});

const IncludeSchema = z.object({
  intent: z.literal("include"),
});

const UnknownSchema = z.object({
  intent: z.literal("unknown"),
  reason: z.string().describe("One short sentence explaining what was unclear"),
});

const IntentSchema = z.discriminatedUnion("intent", [
  RecategorizeSchema,
  SplitSchema,
  NoteSchema,
  ExcludeSchema,
  IncludeSchema,
  UnknownSchema,
]);

export type Intent = z.infer<typeof IntentSchema>;

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const INTENT_SYSTEM_PROMPT = `You parse personal-finance edit commands sent via WhatsApp.

The user is editing ONE specific transaction (provided in context).
Output VALID JSON only. No prose.

Recognize these intents:

- "recategorize" — user wants a different category.
  Output: { intent: "recategorize", new_category: "<exact name from list>" }
  Examples: "this is groceries", "actually transit", "coffee not eating out"

- "split" — user is paying only part of the bill.
  Output: { intent: "split", split_type: "percent" | "fixed" | "ratio", split_value: <number>, split_raw_input: "<original text>" }
  - "1/3" or "1 of 3" → ratio, 0.3333
  - "20%" or "20 percent" → percent, 20
  - "$8" or "8 dollars" → fixed, 8.00
  - "half" → ratio, 0.5
  - "split with 2 friends" (3 people total) → ratio, 0.3333

- "note" — user wants to add free-form context, no other change.
  Output: { intent: "note", note: "<the note text>" }
  Examples: "with sarah and mike", "birthday gift for mom"

- "exclude" — user wants the transaction excluded from stats.
  Output: { intent: "exclude" }
  Phrases: "ignore this", "not mine", "don't count this", "exclude", "skip"

- "include" — reverse of exclude.
  Output: { intent: "include" }
  Phrases: "include this", "count this again", "back in"

- "unknown" — cannot determine.
  Output: { intent: "unknown", reason: "<one sentence>" }

Rules:
- new_category MUST be EXACTLY one of the names in the provided list (case-sensitive). If the user names something not on the list, pick the closest fit; if nothing fits, use "Other".
- For split, prefer the user's exact phrasing in split_raw_input.
- Don't combine intents. If user says "split 1/3 and add a note", choose the dominant action (split). Put the rest of the text in split_raw_input.
- If reply is just "yes", "ok", "thanks", "lol", or otherwise affirms/dismisses — return "unknown" with reason "ack_only".`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type ParseIntentParams = {
  /** The text of the user's WhatsApp reply. */
  body: string;
  /** Context for the LLM: the transaction being edited. */
  transaction: {
    amount: number;
    merchant: string;
    current_category: string | null;
  };
  /** The exhaustive list of category names the user has. */
  userCategories: string[];
};

export type ParseIntentResult =
  | { ok: true; intent: Intent }
  | { ok: false; reason: "parse_failed" | "refusal" | "max_tokens" };

/**
 * Run the intent parser. Throws on transient API errors so the QStash
 * retry kicks in. Returns `{ ok: false }` only on logical failures
 * (Claude refused, malformed output, hit max_tokens).
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
    schema: IntentSchema,
    maxTokens: 256,
  });

  if (!response.ok) {
    return { ok: false, reason: response.reason };
  }

  // Defense in depth: validate that recategorize.new_category is on the list.
  // If Claude drifts (rare), coerce to "Other" rather than corrupting state.
  const intent = response.value;
  if (intent.intent === "recategorize") {
    if (!userCategories.includes(intent.new_category)) {
      return {
        ok: true,
        intent: {
          intent: "recategorize",
          new_category: userCategories.includes("Other")
            ? "Other"
            : userCategories[0],
        },
      };
    }
  }

  return { ok: true, intent };
}
