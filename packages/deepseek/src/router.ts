/**
 * Two-rule router and escalation policy for LemonWoo v1.
 *
 * v1 rules (per spec):
 *   - Tab / inline-edit / small write     -> Flash non-thinking ("write")
 *   - Anything else (agent/refactor/debug/verify/chat) -> Pro thinking ("think")
 *
 * No tree of flags. No clasificador. Escalation is decided at higher layers
 * (agent runtime) based on test outcomes and patch scope.
 */

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

/**
 * Mappable model identifiers. The runtime resolves which pair to use against
 * the live `/models` response (V4 preferred, legacy aliases as fallback).
 *
 * Treat these as constants only. The UI never displays them.
 */
export const MODEL_MAP = {
  pro: "deepseek-v4-pro",
  flash: "deepseek-v4-flash",
  /** Legacy alias for the reasoning model (V3 era). Used only as fallback. */
  aliasPro: "deepseek-reasoner",
  /** Legacy alias for the chat model (V3 era). Used only as fallback. */
  aliasFlash: "deepseek-chat"
} as const;

export interface ResolvedModels {
  pro: string;
  flash: string;
  /** True iff the resolution used legacy aliases instead of V4 ids. */
  usedAlias: boolean;
}

/**
 * Pure resolver: given the list of model ids the upstream `/models` endpoint
 * reports, decide which pair to use.
 *
 * Prefers V4 ids; falls back to legacy aliases if both V4 ids are missing;
 * if neither set is fully available, falls back to V4 ids anyway so callers
 * can surface a meaningful error at request time. For a throwing version use
 * `client.getResolvedModels()`.
 */
export function resolveModelIds(availableIds: readonly string[]): ResolvedModels {
  const set = new Set(availableIds);
  if (set.has(MODEL_MAP.pro) && set.has(MODEL_MAP.flash)) {
    return { pro: MODEL_MAP.pro, flash: MODEL_MAP.flash, usedAlias: false };
  }
  if (set.has(MODEL_MAP.aliasPro) && set.has(MODEL_MAP.aliasFlash)) {
    return { pro: MODEL_MAP.aliasPro, flash: MODEL_MAP.aliasFlash, usedAlias: true };
  }
  return { pro: MODEL_MAP.pro, flash: MODEL_MAP.flash, usedAlias: false };
}

export function routeTask(task: LemonWooTaskKind): RouteMode {
  if (task === "tab" || task === "inline-edit" || task === "small-write") {
    return "write";
  }
  return "think";
}

export interface EscalationContext {
  task: LemonWooTaskKind;
  touchedFiles: number;
  testsFailed?: boolean;
  userRejectedDiff?: boolean;
  hasNonTrivialError?: boolean;
}

/**
 * Reports whether a follow-up to a `write`-routed task should escalate to Pro.
 *
 * Returns `true` if:
 *   - the task is intrinsically Pro (agent/refactor/debug/verify), or
 *   - tests failed, or
 *   - the patch touched more than one file, or
 *   - the user rejected the diff for quality, or
 *   - a non-trivial typecheck/lint/test error was surfaced.
 */
export function shouldEscalateToPro(ctx: EscalationContext): boolean {
  if (
    ctx.task === "refactor" ||
    ctx.task === "debug" ||
    ctx.task === "verify" ||
    ctx.task === "agent"
  ) {
    return true;
  }
  return Boolean(
    ctx.testsFailed ||
      ctx.touchedFiles > 1 ||
      ctx.userRejectedDiff ||
      ctx.hasNonTrivialError
  );
}
