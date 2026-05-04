import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

/**
 * Anthropic client + structured-output helper.
 *
 * Use case: short, latency-sensitive structured calls — transaction
 * categorization (Phase 2) and WhatsApp reply intent parsing (Phase 4).
 *
 * Model is hardcoded to Haiku 4.5; both use cases need fast, cheap, high-volume
 * inference, not deep reasoning. Don't use this helper for anything that
 * benefits from extended thinking.
 */

let cached: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (cached) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  cached = new Anthropic({ apiKey });
  return cached;
}

/** Claude Haiku 4.5 — fast, cheap, supports structured outputs. */
export const HAIKU_MODEL = "claude-haiku-4-5" as const;

export type CallClaudeOptions<T> = {
  /** Stable across calls — eligible for prompt caching. */
  system: string;
  /** Per-call user content. Plain string or content blocks for image/etc. */
  user: string | Anthropic.ContentBlockParam[];
  /** Zod schema describing the expected output. */
  schema: z.ZodType<T>;
  /**
   * Cap on output tokens. Default 1024 — fine for both batch categorization
   * (~50 tokens × N transactions) and intent parsing (~100 tokens).
   */
  maxTokens?: number;
  /**
   * Mark the system prompt with `cache_control: ephemeral`. Defaults to true.
   *
   * Note: Haiku 4.5's minimum cacheable prefix is 4096 tokens. Our system
   * prompts are typically shorter, so this is a no-op until they grow — but
   * harmless to set.
   */
  cacheSystem?: boolean;
};

export type CallClaudeResult<T> =
  | { ok: true; value: T; stopReason: string | null }
  | { ok: false; reason: "parse_failed" | "refusal" | "max_tokens"; stopReason: string | null };

/**
 * Make a Claude Haiku call with a Zod-typed JSON output. Returns the parsed
 * value, or a structured failure reason.
 *
 * Throws on transient API errors (network, 5xx, rate-limit) — the caller
 * should let the QStash retry kick in. Logical failures (Claude returns
 * malformed JSON, refuses, or hits max_tokens) return `{ ok: false }` so the
 * caller can decide how to degrade.
 */
export async function callClaudeWithSchema<T>({
  system,
  user,
  schema,
  maxTokens = 1024,
  cacheSystem = true,
}: CallClaudeOptions<T>): Promise<CallClaudeResult<T>> {
  const client = getAnthropicClient();

  const systemBlocks: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: system,
      ...(cacheSystem ? { cache_control: { type: "ephemeral" } } : {}),
    },
  ];

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: typeof user === "string" ? user : user,
    },
  ];

  const response = await client.messages.parse({
    model: HAIKU_MODEL,
    max_tokens: maxTokens,
    system: systemBlocks,
    messages,
    output_config: {
      format: zodOutputFormat(schema),
    },
  });

  if (response.stop_reason === "refusal") {
    return { ok: false, reason: "refusal", stopReason: response.stop_reason };
  }
  if (response.stop_reason === "max_tokens") {
    return { ok: false, reason: "max_tokens", stopReason: response.stop_reason };
  }
  if (response.parsed_output == null) {
    return { ok: false, reason: "parse_failed", stopReason: response.stop_reason };
  }

  return { ok: true, value: response.parsed_output, stopReason: response.stop_reason };
}
