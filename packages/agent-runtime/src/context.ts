/**
 * v1 context helpers (framework-agnostic).
 */

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

export function buildVolatileContext(parts: Record<string, string | undefined>): string {
  return Object.entries(parts)
    .filter(([, v]) => v && v.trim())
    .map(([k, v]) => `## ${k}\n${v!.trim()}`)
    .join("\n\n");
}
