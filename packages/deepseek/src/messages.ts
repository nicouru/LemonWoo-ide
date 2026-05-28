/**
 * Cache-friendly message ordering for DeepSeek chat completions.
 *
 * DeepSeek context caching is enabled by default and rewards stable prefixes.
 * `buildMessages` concatenates the stable parts (system prompt, repo rules,
 * stable context) into a single leading system message so the tokenizer sees
 * an identical byte prefix across turns, then appends volatile context and
 * the user input.
 *
 * Rule: stable bytes first, volatile bytes last. Do not interleave.
 */

import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export interface MessageBuildOptions {
  /** Stable across turns. Keep byte-identical for cache hits. */
  systemPrompt: string;
  /** Stable per repo. Reads of `AGENTS.md`, `.lemonwoo/rules/*`. */
  repoRules?: string;
  /** Stable summaries / project facts. Updated rarely. */
  stableContext?: string;
  /** Volatile per turn: git diff, open file, selection, diagnostics. */
  volatileContext?: string;
  /** The user-provided message for this turn. */
  userInput: string;
}

const HEADER_REPO_RULES = "# Repo rules";
const HEADER_STABLE = "# Stable context";
const HEADER_VOLATILE = "# Volatile context";

/**
 * Produces a chat-completion message array with stable bytes leading.
 *
 * Guarantees:
 *   - The leading system message bytes are a deterministic function of
 *     `systemPrompt + repoRules + stableContext` and do not depend on
 *     `volatileContext` or `userInput`.
 *   - Volatile context, if present, lives in its own trailing system message
 *     so the cacheable prefix does not include it.
 */
export function buildMessages(
  opts: MessageBuildOptions
): ChatCompletionMessageParam[] {
  const stableParts: string[] = [opts.systemPrompt];
  if (opts.repoRules && opts.repoRules.trim()) {
    stableParts.push(`${HEADER_REPO_RULES}\n\n${opts.repoRules}`);
  }
  if (opts.stableContext && opts.stableContext.trim()) {
    stableParts.push(`${HEADER_STABLE}\n\n${opts.stableContext}`);
  }
  const stable = stableParts.join("\n\n");

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: stable }
  ];

  if (opts.volatileContext && opts.volatileContext.trim()) {
    messages.push({
      role: "system",
      content: `${HEADER_VOLATILE}\n\n${opts.volatileContext}`
    });
  }

  messages.push({ role: "user", content: opts.userInput });
  return messages;
}
