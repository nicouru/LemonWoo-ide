import OpenAI from "openai";

export type LemonWooTaskKind =
  | "tab"
  | "inline-edit"
  | "small-write"
  | "chat"
  | "agent"
  | "verify"
  | "refactor"
  | "debug";

export type RouteMode = "write" | "think";

export const MODEL_MAP = {
  pro: "deepseek-v4-pro",
  flash: "deepseek-v4-flash",
  aliasPro: "deepseek-reasoner",
  aliasFlash: "deepseek-chat"
} as const;

export function resolveModelIds(ids: string[]): { pro: string; flash: string; usedAlias: boolean } {
  const set = new Set(ids);
  const hasV4 = set.has(MODEL_MAP.pro) && set.has(MODEL_MAP.flash);
  if (hasV4) {
    return { pro: MODEL_MAP.pro, flash: MODEL_MAP.flash, usedAlias: false };
  }
  const hasAliases = set.has(MODEL_MAP.aliasPro) && set.has(MODEL_MAP.aliasFlash);
  if (hasAliases) {
    return { pro: MODEL_MAP.aliasPro, flash: MODEL_MAP.aliasFlash, usedAlias: true };
  }
  return { pro: MODEL_MAP.pro, flash: MODEL_MAP.flash, usedAlias: false };
}

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const PRO_TIMEOUT_MS = 120_000;
const FLASH_TIMEOUT_MS = 25_000;

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{6,}/g,
  /ghp_[A-Za-z0-9]{16,}/g,
  /github_pat_[A-Za-z0-9_]{16,}/g
];

export function redactSecrets(input: string): string {
  return SECRET_PATTERNS.reduce((acc, pattern) => acc.replace(pattern, "[REDACTED]"), input);
}

export function routeTask(task: LemonWooTaskKind): RouteMode {
  if (task === "tab" || task === "inline-edit" || task === "small-write") {
    return "write";
  }
  return "think";
}

export function shouldEscalateToPro(args: {
  testsFailed?: boolean;
  touchedFiles: number;
  userRejectedDiff?: boolean;
  hasNonTrivialError?: boolean;
  task: LemonWooTaskKind;
}): boolean {
  if (args.task === "refactor" || args.task === "debug" || args.task === "verify" || args.task === "agent") {
    return true;
  }
  return Boolean(
    args.testsFailed || args.touchedFiles > 1 || args.userRejectedDiff || args.hasNonTrivialError
  );
}

function wireAbortSignal(controller: AbortController, secondary?: AbortSignal): AbortSignal {
  if (!secondary) return controller.signal;
  if (secondary.aborted) {
    controller.abort("aborted");
    return controller.signal;
  }
  secondary.addEventListener("abort", () => controller.abort("aborted"), { once: true });
  return controller.signal;
}

export class DeepSeekClient {
  private readonly client: OpenAI;
  private readonly apiKey: string;

  constructor(apiKey: string, baseURL = DEFAULT_BASE_URL) {
    if (!apiKey) {
      throw new Error("Missing DeepSeek API key");
    }
    this.apiKey = apiKey;
    this.client = new OpenAI({
      apiKey,
      baseURL
    });
  }

  async listModels(): Promise<{ pro: string; flash: string; usedAlias: boolean }> {
    const models = await this.client.models.list();
    const ids = models.data.map((m) => m.id);
    return resolveModelIds(ids);
  }

  async chat(args: {
    task: LemonWooTaskKind;
    prompt: string;
    system?: string;
    signal?: AbortSignal;
  }): Promise<string> {
    const route = routeTask(args.task);
    const resolvedModels = await this.listModels();
    const model = route === "write" ? resolvedModels.flash : resolvedModels.pro;
    const timeoutMs = route === "think" ? PRO_TIMEOUT_MS : FLASH_TIMEOUT_MS;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("timeout"), timeoutMs);
    const mergedSignal = wireAbortSignal(controller, args.signal);
    try {
      return await this.withRetry(async () => {
        const completion = await this.client.chat.completions.create(
          {
            model,
            messages: [
              ...(args.system ? [{ role: "system" as const, content: args.system }] : []),
              { role: "user" as const, content: args.prompt }
            ],
            stream: false
          },
          { signal: mergedSignal }
        );
        return completion.choices[0]?.message?.content ?? "";
      });
    } catch (error) {
      throw new Error(redactSecrets(String(error)));
    } finally {
      clearTimeout(timeout);
    }
  }

  private async withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i < retries; i += 1) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        const text = String(err);
        const retriable = text.includes("429") || text.includes("5");
        if (!retriable || i === retries - 1) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 300 * (i + 1)));
      }
    }
    throw lastErr;
  }

  getRedactedKey(): string {
    return redactSecrets(this.apiKey);
  }
}
