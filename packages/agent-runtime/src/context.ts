/**
 * v1/v2.1 context helpers (framework-agnostic).
 */

import { redactToolOutput } from "./redactTool.js";

export const DEFAULT_EXCLUDE_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  "out",
  "coverage",
  ".turbo",
  ".serena"
]);

export const MAX_TREE_FILES = 80;
export const MAX_FILE_BYTES = 200_000;

export const TRUNCATION_MARKER = "[truncated]";

export const CONTEXT_BUDGETS = {
  agentsMd: 8_000,
  repoRules: 8_000,
  stableContext: 6_000,
  volatileContext: 12_000,
  activePath: 500,
  selection: 2_000,
  activeFile: 4_000,
  diagnostics: 2_000,
  gitDiff: 4_000,
  rgOutput: 4_000
} as const;

export function isExcludedPath(relPath: string): boolean {
  const parts = relPath.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.some((p) => DEFAULT_EXCLUDE_DIRS.has(p));
}

export function shouldInvokeRg(prompt: string): boolean {
  return /(busc[aá]|search|encontr[aá]|dónde está|where is|\brg\b|grep|referencias|usos de|find all|symbol|símbolo)/i.test(
    prompt
  );
}

export function compactRepoTree(files: string[], max = MAX_TREE_FILES): string {
  const filtered = files
    .map((f) => f.replace(/\\/g, "/"))
    .filter((f) => f && !isExcludedPath(f))
    .sort();
  const slice = filtered.slice(0, max);
  const suffix = filtered.length > max ? `\n... (+${filtered.length - max} más)` : "";
  return slice.join("\n") + suffix;
}

export function truncateWithMarker(text: string, maxChars: number): string {
  if (maxChars <= 0) return "";
  if (text.length <= maxChars) return text;
  const marker = `\n${TRUNCATION_MARKER}`;
  if (maxChars <= marker.length) return TRUNCATION_MARKER.slice(0, maxChars);
  return `${text.slice(0, maxChars - marker.length)}${marker}`;
}

export function redactContextText(text: string, extraSecrets: string[] = []): string {
  return redactToolOutput(text, extraSecrets);
}

export function sliceActiveFileAroundSelection(
  content: string,
  selection: string,
  maxChars: number
): string {
  if (content.length <= maxChars) return content;
  const trimmedSelection = selection.trim();
  if (!trimmedSelection) return truncateWithMarker(content, maxChars);

  const idx = content.indexOf(trimmedSelection);
  if (idx < 0) return truncateWithMarker(content, maxChars);

  const marker = `\n${TRUNCATION_MARKER}`;
  const budget = Math.max(marker.length + 1, maxChars);
  const headBudget = Math.floor((budget - trimmedSelection.length) / 2);
  const start = Math.max(0, idx - headBudget);
  const end = Math.min(content.length, idx + trimmedSelection.length + headBudget);
  let slice = content.slice(start, end);
  const prefix = start > 0 ? `...${marker}...\n` : "";
  const suffix = end < content.length ? `\n...${marker}...` : "";
  const combined = `${prefix}${slice}${suffix}`;
  if (combined.length <= maxChars) return combined;
  return truncateWithMarker(combined, maxChars);
}

export interface VolatileContextInput {
  activePath?: string;
  selection?: string;
  activeFile?: string;
  diagnostics?: string;
  gitDiff?: string;
  rgOutput?: string;
}

export interface PackAgentContextInput {
  agentsMd: string;
  repoRules: string;
  stableContext: string;
  volatileParts: VolatileContextInput;
  extraSecrets?: string[];
}

export interface PackedAgentContext {
  agentsMd: string;
  repoRules: string;
  stableContext: string;
  volatileContext: string;
}

const VOLATILE_SECTIONS: Array<{
  key: keyof VolatileContextInput;
  label: string;
  budgetKey: keyof typeof CONTEXT_BUDGETS;
  priority: number;
}> = [
  { key: "activePath", label: "Archivo activo", budgetKey: "activePath", priority: 1 },
  { key: "selection", label: "Selección", budgetKey: "selection", priority: 2 },
  { key: "activeFile", label: "Archivo (truncado)", budgetKey: "activeFile", priority: 3 },
  { key: "diagnostics", label: "Diagnostics", budgetKey: "diagnostics", priority: 4 },
  { key: "gitDiff", label: "Git diff", budgetKey: "gitDiff", priority: 5 },
  { key: "rgOutput", label: "Búsqueda rg", budgetKey: "rgOutput", priority: 6 }
];

function prepareVolatileSection(
  label: string,
  raw: string | undefined,
  maxChars: number,
  extraSecrets: string[]
): string {
  const cleaned = redactContextText(raw ?? "", extraSecrets).trim();
  if (!cleaned) return "";
  return `## ${label}\n${truncateWithMarker(cleaned, maxChars)}`;
}

export function buildVolatileContext(parts: Record<string, string | undefined>): string {
  return Object.entries(parts)
    .filter(([, v]) => v && v.trim())
    .map(([k, v]) => `## ${k}\n${v!.trim()}`)
    .join("\n\n");
}

export function packVolatileContext(
  parts: VolatileContextInput,
  totalBudget = CONTEXT_BUDGETS.volatileContext,
  extraSecrets: string[] = []
): string {
  const redactedParts: VolatileContextInput = {
    activePath: redactContextText(parts.activePath ?? "", extraSecrets),
    selection: redactContextText(parts.selection ?? "", extraSecrets),
    activeFile: redactContextText(parts.activeFile ?? "", extraSecrets),
    diagnostics: redactContextText(parts.diagnostics ?? "", extraSecrets),
    gitDiff: redactContextText(parts.gitDiff ?? "", extraSecrets),
    rgOutput: redactContextText(parts.rgOutput ?? "", extraSecrets)
  };

  if (redactedParts.activeFile) {
    redactedParts.activeFile = sliceActiveFileAroundSelection(
      redactedParts.activeFile,
      redactedParts.selection ?? "",
      CONTEXT_BUDGETS.activeFile
    );
  }

  const sections = VOLATILE_SECTIONS.map(({ key, label, budgetKey, priority }) => {
    const raw = redactedParts[key]?.trim() ?? "";
    const maxChars = CONTEXT_BUDGETS[budgetKey];
    const body = raw ? truncateWithMarker(raw, maxChars) : "";
    return {
      priority,
      text: body ? `## ${label}\n${body}` : ""
    };
  }).filter((section) => section.text);

  let packed = sections.map((section) => section.text).join("\n\n");
  if (packed.length <= totalBudget) return packed;

  const byPriority = [...sections].sort((a, b) => b.priority - a.priority);
  const kept = new Set<number>();
  let used = 0;
  for (const section of byPriority) {
    const nextLen = used + (used ? 2 : 0) + section.text.length;
    if (nextLen <= totalBudget) {
      kept.add(section.priority);
      used = nextLen;
    }
  }

  if (kept.size === 0 && byPriority.length > 0) {
    const highest = byPriority[byPriority.length - 1]!;
    return truncateWithMarker(highest.text, totalBudget);
  }

  packed = sections
    .filter((section) => kept.has(section.priority))
    .map((section) => section.text)
    .join("\n\n");

  if (packed.length <= totalBudget) return packed;
  return truncateWithMarker(packed, totalBudget);
}

export function packAgentContext(input: PackAgentContextInput): PackedAgentContext {
  const extraSecrets = input.extraSecrets ?? [];
  const agentsMd = truncateWithMarker(
    redactContextText(input.agentsMd, extraSecrets).trim(),
    CONTEXT_BUDGETS.agentsMd
  );
  const repoRules = truncateWithMarker(
    redactContextText(input.repoRules, extraSecrets).trim(),
    CONTEXT_BUDGETS.repoRules
  );
  const stableContext = truncateWithMarker(
    redactContextText(input.stableContext, extraSecrets).trim(),
    CONTEXT_BUDGETS.stableContext
  );
  const volatileContext = packVolatileContext(input.volatileParts, CONTEXT_BUDGETS.volatileContext, extraSecrets);

  return { agentsMd, repoRules, stableContext, volatileContext };
}
