/**
 * DeepSeek client for LemonWoo v1.
 *
 * Responsibilities:
 *   - Talk to `https://api.deepseek.com` via OpenAI Chat Completions.
 *   - Resolve V4 / legacy alias model ids dynamically against `/models`.
 *   - Provide chat (buffered) and chat-stream (incremental) primitives.
 *   - Enforce per-mode timeouts (Flash short, Pro long).
 *   - Retry only on retriable failures (429, 5xx, network), with backoff
 *     and `Retry-After` honoring. Auth, abort and timeout never retry.
 *   - Wire user-provided `AbortSignal` end-to-end so cancellation reaches
 *     the underlying fetch.
 *   - Redact the configured API key and well-known credential shapes in
 *     every surfaced error message.
 *
 * What this client is NOT:
 *   - No Anthropic endpoint compatibility (v1 excludes it).
 *   - No FIM beta. Tab is handled by the LemonWoo extension's native
 *     inline completion provider using Flash.
 *   - No tool calls / MCP plumbing in v1 — the harness owns that.
 *   - No persistent state. The only cache is an in-memory `/models` TTL.
 */

import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  InternalServerError,
  PermissionDeniedError,
  RateLimitError
} from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

import {
  DeepSeekAbortError,
  DeepSeekAuthError,
  DeepSeekError,
  DeepSeekModelsUnavailableError,
  DeepSeekNetworkError,
  DeepSeekRateLimitError,
  DeepSeekServerError,
  DeepSeekTimeoutError
} from "./errors.js";
import { buildMessages, type MessageBuildOptions } from "./messages.js";
import { redactSecrets } from "./redact.js";
import {
  MODEL_MAP,
  routeTask,
  type LemonWooTaskKind,
  type ResolvedModels,
  type RouteMode
} from "./router.js";

const DEFAULT_BASE_URL = "https://api.deepseek.com";

export interface DeepSeekClientOptions {
  apiKey: string;
  baseURL?: string;
  /** Override the global `fetch` (used in tests; never in production). */
  fetch?: typeof fetch;
  /** Pro request timeout in milliseconds. Default 120_000 (2 min). */
  proTimeoutMs?: number;
  /** Flash request timeout in milliseconds. Default 25_000. */
  flashTimeoutMs?: number;
  /** Maximum retry attempts (including the initial try). Default 3. */
  maxRetries?: number;
  /** Initial backoff before retry, in ms. Default 300. */
  retryBaseDelayMs?: number;
  /** Cap on backoff between retries, in ms. Default 5_000. */
  retryMaxDelayMs?: number;
  /** TTL of the in-memory `/models` cache, in ms. Default 5 minutes. */
  modelsCacheTtlMs?: number;
}

export interface ChatArgs {
  task: LemonWooTaskKind;
  /** Either pass full messages... */
  messages?: ChatCompletionMessageParam[];
  /** ...or use `buildMessages` options (preferred for cache friendliness). */
  build?: MessageBuildOptions;
  signal?: AbortSignal;
  /** Internal override: skip routing. UI must never expose this. */
  forceMode?: RouteMode;
  /** Override max output tokens for this request. */
  maxTokens?: number;
}

export interface ChatResult {
  text: string;
  mode: RouteMode;
  modelLabel: "pro" | "flash";
  modelId: string;
  usedAlias: boolean;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface ValidateKeyResult {
  status:
    | "valid"
    | "invalid"
    | "rate-limited"
    | "network"
    | "models-unavailable";
  models?: ResolvedModels;
  message?: string;
}

interface CachedModels {
  resolved: ResolvedModels;
  fetchedAt: number;
}

type AbortReason = "user" | "timeout";

export class DeepSeekClient {
  private readonly openai: OpenAI;
  private readonly apiKey: string;
  private readonly proTimeoutMs: number;
  private readonly flashTimeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly retryMaxDelayMs: number;
  private readonly modelsCacheTtlMs: number;
  private modelsCache: CachedModels | undefined;

  constructor(options: DeepSeekClientOptions) {
    if (!options || !options.apiKey) {
      throw new DeepSeekError("Missing DeepSeek API key");
    }
    this.apiKey = options.apiKey;
    this.openai = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL ?? DEFAULT_BASE_URL,
      maxRetries: 0,
      ...(options.fetch ? { fetch: options.fetch } : {})
    });
    this.proTimeoutMs = options.proTimeoutMs ?? 120_000;
    this.flashTimeoutMs = options.flashTimeoutMs ?? 25_000;
    this.maxRetries = Math.max(1, options.maxRetries ?? 3);
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 300;
    this.retryMaxDelayMs = options.retryMaxDelayMs ?? 5_000;
    this.modelsCacheTtlMs = options.modelsCacheTtlMs ?? 5 * 60_000;
  }

  /**
   * Returns a redacted view of the API key. Safe for logs.
   */
  getRedactedKey(): string {
    return redactSecrets(this.apiKey, [this.apiKey]);
  }

  /**
   * Lists models and returns the resolved Pro/Flash pair.
   * Cached for `modelsCacheTtlMs`. Throws typed errors on failure.
   */
  async getResolvedModels(
    signal?: AbortSignal,
    forceRefresh = false
  ): Promise<ResolvedModels> {
    const now = Date.now();
    if (
      !forceRefresh &&
      this.modelsCache &&
      now - this.modelsCache.fetchedAt < this.modelsCacheTtlMs
    ) {
      return this.modelsCache.resolved;
    }
    const list = await this.invokeOnce(
      (innerSignal) => this.openai.models.list({ signal: innerSignal }),
      this.flashTimeoutMs,
      signal
    );
    const ids = list.data.map((m) => m.id);
    const resolved = this.resolveOrThrow(ids);
    this.modelsCache = { resolved, fetchedAt: now };
    return resolved;
  }

  /**
   * Cheap pre-flight: list models, classify result. Never throws.
   */
  async validateKey(signal?: AbortSignal): Promise<ValidateKeyResult> {
    try {
      const models = await this.getResolvedModels(signal, true);
      return { status: "valid", models };
    } catch (err) {
      if (err instanceof DeepSeekAuthError) {
        return { status: "invalid", message: this.safeMessage(err) };
      }
      if (err instanceof DeepSeekRateLimitError) {
        return { status: "rate-limited", message: this.safeMessage(err) };
      }
      if (err instanceof DeepSeekModelsUnavailableError) {
        return {
          status: "models-unavailable",
          message: this.safeMessage(err)
        };
      }
      return { status: "network", message: this.safeMessage(err) };
    }
  }

  /**
   * Buffered chat completion. Retries on 429/5xx/network; not on auth/abort/timeout.
   */
  async chat(args: ChatArgs): Promise<ChatResult> {
    const mode = args.forceMode ?? routeTask(args.task);
    const resolved = await this.getResolvedModels(args.signal);
    const modelId = mode === "write" ? resolved.flash : resolved.pro;
    const timeoutMs =
      mode === "think" ? this.proTimeoutMs : this.flashTimeoutMs;
    const messages = this.resolveMessages(args);

    const completion = await this.invokeWithRetry(
      (innerSignal) =>
        this.openai.chat.completions.create(
          {
            model: modelId,
            messages,
            stream: false,
            ...(typeof args.maxTokens === "number"
              ? { max_tokens: args.maxTokens }
              : {})
          },
          { signal: innerSignal }
        ),
      timeoutMs,
      args.signal
    );

    const text = completion.choices[0]?.message?.content ?? "";
    return {
      text,
      mode,
      modelLabel: mode === "write" ? "flash" : "pro",
      modelId,
      usedAlias: resolved.usedAlias,
      usage: completion.usage
        ? {
            promptTokens: completion.usage.prompt_tokens,
            completionTokens: completion.usage.completion_tokens,
            totalTokens: completion.usage.total_tokens
          }
        : undefined
    };
  }

  /**
   * Streaming chat completion. Yields content deltas as they arrive.
   *
   * Streams are not retried mid-stream. If the connection drops after the
   * first chunk, the iterator throws and the caller must restart.
   */
  async *chatStream(args: ChatArgs): AsyncIterable<string> {
    const mode = args.forceMode ?? routeTask(args.task);
    const resolved = await this.getResolvedModels(args.signal);
    const modelId = mode === "write" ? resolved.flash : resolved.pro;
    const timeoutMs =
      mode === "think" ? this.proTimeoutMs : this.flashTimeoutMs;
    const messages = this.resolveMessages(args);

    const controller = new AbortController();
    let abortReason: AbortReason | undefined;
    const release = this.wireTimeoutAndSignal(
      controller,
      timeoutMs,
      args.signal,
      (reason) => {
        abortReason = reason;
      }
    );

    try {
      const stream = await this.openai.chat.completions.create(
        {
          model: modelId,
          messages,
          stream: true,
          ...(typeof args.maxTokens === "number"
            ? { max_tokens: args.maxTokens }
            : {})
        },
        { signal: controller.signal }
      );
      for await (const chunk of stream) {
        const piece = chunk.choices[0]?.delta?.content;
        if (piece) yield piece;
      }
    } catch (err) {
      throw this.classifyError(err, abortReason);
    } finally {
      release();
    }
  }

  /** Test-only: clears the cached `/models` result. */
  resetModelsCache(): void {
    this.modelsCache = undefined;
  }

  // ---------- internals ----------

  private resolveMessages(args: ChatArgs): ChatCompletionMessageParam[] {
    if (args.messages && args.messages.length > 0) return args.messages;
    if (args.build) return buildMessages(args.build);
    throw new DeepSeekError(
      "ChatArgs must include either `messages` or `build` options"
    );
  }

  private resolveOrThrow(availableIds: readonly string[]): ResolvedModels {
    const set = new Set(availableIds);
    if (set.has(MODEL_MAP.pro) && set.has(MODEL_MAP.flash)) {
      return { pro: MODEL_MAP.pro, flash: MODEL_MAP.flash, usedAlias: false };
    }
    if (set.has(MODEL_MAP.aliasPro) && set.has(MODEL_MAP.aliasFlash)) {
      return {
        pro: MODEL_MAP.aliasPro,
        flash: MODEL_MAP.aliasFlash,
        usedAlias: true
      };
    }
    throw new DeepSeekModelsUnavailableError(
      `Neither V4 (${MODEL_MAP.pro}/${MODEL_MAP.flash}) nor legacy aliases (${MODEL_MAP.aliasPro}/${MODEL_MAP.aliasFlash}) found in /models`,
      { available: [...availableIds] }
    );
  }

  private wireTimeoutAndSignal(
    controller: AbortController,
    timeoutMs: number,
    secondary: AbortSignal | undefined,
    onAbort: (reason: AbortReason) => void
  ): () => void {
    const timeoutId = setTimeout(() => {
      onAbort("timeout");
      controller.abort();
    }, timeoutMs);

    let secondaryHandler: (() => void) | undefined;
    if (secondary) {
      if (secondary.aborted) {
        onAbort("user");
        controller.abort();
      } else {
        secondaryHandler = () => {
          onAbort("user");
          controller.abort();
        };
        secondary.addEventListener("abort", secondaryHandler, { once: true });
      }
    }
    return () => {
      clearTimeout(timeoutId);
      if (secondary && secondaryHandler) {
        secondary.removeEventListener("abort", secondaryHandler);
      }
    };
  }

  private async invokeOnce<T>(
    fn: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
    secondary?: AbortSignal
  ): Promise<T> {
    const controller = new AbortController();
    let abortReason: AbortReason | undefined;
    const release = this.wireTimeoutAndSignal(
      controller,
      timeoutMs,
      secondary,
      (reason) => {
        abortReason = reason;
      }
    );
    try {
      return await fn(controller.signal);
    } catch (err) {
      throw this.classifyError(err, abortReason);
    } finally {
      release();
    }
  }

  private async invokeWithRetry<T>(
    fn: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
    secondary?: AbortSignal
  ): Promise<T> {
    let lastErr: DeepSeekError | undefined;
    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      let abortReason: AbortReason | undefined;
      const release = this.wireTimeoutAndSignal(
        controller,
        timeoutMs,
        secondary,
        (reason) => {
          abortReason = reason;
        }
      );
      try {
        return await fn(controller.signal);
      } catch (raw) {
        const err = this.classifyError(raw, abortReason);
        release();
        const retriable =
          err instanceof DeepSeekRateLimitError ||
          err instanceof DeepSeekServerError ||
          err instanceof DeepSeekNetworkError;
        if (!retriable || attempt === this.maxRetries - 1) {
          throw err;
        }
        const delayMs = this.computeBackoff(attempt, err);
        try {
          await this.sleep(delayMs, secondary);
        } catch (sleepErr) {
          throw sleepErr instanceof DeepSeekError
            ? sleepErr
            : this.classifyError(sleepErr, "user");
        }
        lastErr = err;
        continue;
      } finally {
        release();
      }
    }
    throw lastErr ?? new DeepSeekError("Request failed after retries");
  }

  private computeBackoff(attempt: number, err: DeepSeekError): number {
    if (
      err instanceof DeepSeekRateLimitError &&
      typeof err.retryAfterMs === "number" &&
      err.retryAfterMs > 0
    ) {
      return Math.min(err.retryAfterMs, this.retryMaxDelayMs);
    }
    const base = Math.min(
      this.retryBaseDelayMs * Math.pow(2, attempt),
      this.retryMaxDelayMs
    );
    const jitter = Math.floor(Math.random() * (base / 3));
    return base + jitter;
  }

  private async sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      throw new DeepSeekAbortError("Aborted during backoff");
    }
    return new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (signal && onAbort) {
          signal.removeEventListener("abort", onAbort);
        }
        resolve();
      }, ms);
      const onAbort = signal
        ? () => {
            clearTimeout(timeoutId);
            reject(new DeepSeekAbortError("Aborted during backoff"));
          }
        : undefined;
      if (signal && onAbort) {
        signal.addEventListener("abort", onAbort, { once: true });
      }
    });
  }

  private classifyError(
    err: unknown,
    abortReason?: AbortReason
  ): DeepSeekError {
    if (err instanceof DeepSeekError) return err;

    if (abortReason === "timeout") {
      return new DeepSeekTimeoutError(
        `Request timed out: ${this.safeMessage(err)}`,
        { cause: err }
      );
    }
    if (abortReason === "user") {
      return new DeepSeekAbortError(
        `Request aborted by caller: ${this.safeMessage(err)}`,
        { cause: err }
      );
    }

    if (
      err instanceof APIUserAbortError ||
      (err instanceof Error && err.name === "AbortError")
    ) {
      return new DeepSeekAbortError(`Request aborted: ${this.safeMessage(err)}`, {
        cause: err
      });
    }

    if (err instanceof APIConnectionTimeoutError) {
      return new DeepSeekTimeoutError(
        `Connection timed out: ${this.safeMessage(err)}`,
        { cause: err }
      );
    }

    if (err instanceof RateLimitError) {
      const retryAfter = extractRetryAfter(err);
      return new DeepSeekRateLimitError(
        `Rate limited (429): ${this.safeMessage(err)}`,
        { cause: err, retryAfterMs: retryAfter }
      );
    }

    if (
      err instanceof AuthenticationError ||
      err instanceof PermissionDeniedError
    ) {
      const status =
        err instanceof APIError && typeof err.status === "number"
          ? err.status
          : 401;
      return new DeepSeekAuthError(
        `Invalid or unauthorized API key (status ${status})`,
        { cause: err }
      );
    }

    if (err instanceof InternalServerError) {
      const status =
        typeof (err as APIError).status === "number"
          ? (err as APIError).status!
          : 500;
      return new DeepSeekServerError(
        `DeepSeek server error (status ${status}): ${this.safeMessage(err)}`,
        { cause: err, status }
      );
    }

    if (err instanceof APIError) {
      const status = typeof err.status === "number" ? err.status : undefined;
      if (status === 429) {
        return new DeepSeekRateLimitError(
          `Rate limited (429): ${this.safeMessage(err)}`,
          { cause: err, retryAfterMs: extractRetryAfter(err) }
        );
      }
      if (status === 401 || status === 403) {
        return new DeepSeekAuthError(
          `Invalid or unauthorized API key (status ${status})`,
          { cause: err }
        );
      }
      if (typeof status === "number" && status >= 500) {
        return new DeepSeekServerError(
          `DeepSeek server error (status ${status}): ${this.safeMessage(err)}`,
          { cause: err, status }
        );
      }
      return new DeepSeekError(
        `DeepSeek API error (status ${status ?? "unknown"}): ${this.safeMessage(err)}`,
        { cause: err }
      );
    }

    if (err instanceof APIConnectionError) {
      return new DeepSeekNetworkError(
        `Network error: ${this.safeMessage(err)}`,
        { cause: err }
      );
    }

    if (err instanceof Error) {
      return new DeepSeekNetworkError(
        `Network error: ${this.safeMessage(err)}`,
        { cause: err }
      );
    }

    return new DeepSeekError(`Unknown error: ${this.safeMessage(err)}`);
  }

  private safeMessage(err: unknown): string {
    const raw =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : (() => {
              try {
                return JSON.stringify(err);
              } catch {
                return String(err);
              }
            })();
    return redactSecrets(raw, [this.apiKey]);
  }
}

function extractRetryAfter(err: APIError): number | undefined {
  const headers = (err as { headers?: unknown }).headers;
  let raw: string | null | undefined;
  if (
    headers &&
    typeof (headers as { get?: unknown }).get === "function"
  ) {
    raw = (headers as Headers).get("retry-after");
  } else if (headers && typeof headers === "object") {
    const rec = headers as Record<string, string>;
    raw = rec["retry-after"] ?? rec["Retry-After"];
  }
  if (!raw) return undefined;
  const seconds = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return seconds * 1000;
}
