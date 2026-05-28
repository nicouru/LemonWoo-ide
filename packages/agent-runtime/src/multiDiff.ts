/**
 * Multi-file unified diff parsing and application (pure, testable).
 */

export interface FilePatch {
  /** Workspace-relative path using forward slashes. */
  relPath: string;
  isNewFile: boolean;
  hunks: string[];
}

export interface ApplyPatchResult {
  ok: boolean;
  relPath: string;
  content?: string;
  error?: string;
}

export interface MultiApplyResult {
  ok: boolean;
  patches: ApplyPatchResult[];
  error?: string;
}

export interface DiffProposal {
  rawDiff: string | null;
  hasDiff: boolean;
  touchedFiles: string[];
  warning?: string;
}

const DIFF_FENCE_RE = /```diff\s*([\s\S]*?)```/g;

export function countDiffBlocks(raw: string): number {
  return [...raw.matchAll(DIFF_FENCE_RE)].filter((m) => Boolean(m[1]?.trim())).length;
}

export function extractDiffText(raw: string): string {
  const blocks = countDiffBlocks(raw);
  if (blocks > 1) return "";
  const fences: string[] = [];
  for (const match of raw.matchAll(DIFF_FENCE_RE)) {
    if (match[1]?.trim()) fences.push(match[1].trim());
  }
  if (fences.length) return fences.join("\n");
  return raw.trim();
}

export function evaluateDiffProposal(text: string): DiffProposal {
  const blocks = countDiffBlocks(text);
  if (blocks === 0) {
    return { rawDiff: null, hasDiff: false, touchedFiles: [] };
  }
  if (blocks > 1) {
    return {
      rawDiff: null,
      hasDiff: false,
      touchedFiles: [],
      warning: "Se detectaron múltiples bloques diff; LemonWoo requiere una única propuesta diff para aplicar con seguridad."
    };
  }

  const rawDiff = extractDiffText(text);
  const patches = parseMultiFileDiff(rawDiff);
  if (!patches.length) {
    return {
      rawDiff: null,
      hasDiff: false,
      touchedFiles: [],
      warning: "El bloque diff no es válido para aplicar."
    };
  }
  const touchedFiles = [...new Set(patches.map((p) => p.relPath))];
  return {
    rawDiff,
    hasDiff: true,
    touchedFiles
  };
}

export function normalizeRelPath(rawPath: string): string {
  let p = rawPath.trim().replace(/\\/g, "/");
  if (p.startsWith("a/") || p.startsWith("b/")) p = p.slice(2);
  return p;
}

export function isSafeRelPath(relPath: string): boolean {
  if (!relPath || relPath.startsWith("/") || relPath.includes("..")) return false;
  const parts = relPath.split("/");
  if (parts.includes(".git")) return false;
  if (parts.includes("node_modules")) return false;
  return true;
}

export function parseMultiFileDiff(raw: string): FilePatch[] {
  const text = extractDiffText(raw);
  if (!text) return [];

  const patches: FilePatch[] = [];
  const lines = text.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    if (!lines[i].startsWith("--- ")) {
      i += 1;
      continue;
    }
    const oldLine = lines[i];
    const newLine = lines[i + 1]?.startsWith("+++ ") ? lines[i + 1] : "";
    if (!newLine) {
      i += 1;
      continue;
    }

    const oldPath = oldLine.slice(4).trim().split(/\s+/)[0] ?? "";
    const newPath = newLine.slice(4).trim().split(/\s+/)[0] ?? "";
    const relPath = normalizeRelPath(newPath || oldPath);
    const isNewFile =
      oldPath === "/dev/null" ||
      oldPath.endsWith("/dev/null") ||
      /@@ -0,0 /.test(lines.slice(i, i + 6).join("\n"));

    i += 2;
    const hunks: string[] = [];
    let current: string[] = [];

    while (i < lines.length) {
      if (lines[i].startsWith("--- ") && current.length) break;
      if (lines[i].startsWith("@@")) {
        if (current.length) hunks.push(current.join("\n"));
        current = [lines[i]];
      } else if (current.length) {
        current.push(lines[i]);
      }
      i += 1;
    }
    if (current.length) hunks.push(current.join("\n"));

    if (relPath && hunks.length) {
      patches.push({ relPath, isNewFile, hunks });
    }
  }

  return patches;
}

export function touchedFilesFromDiff(raw: string): string[] {
  return [...new Set(parseMultiFileDiff(raw).map((p) => p.relPath))];
}

function applyHunksToText(original: string, hunks: string[]): string | null {
  const newline = original.includes("\r\n") ? "\r\n" : "\n";
  const hadTrailingNewline = original.endsWith("\n");
  const originalLines = original.length ? original.split(/\r?\n/) : [];
  if (hadTrailingNewline) originalLines.pop();

  const output: string[] = [];
  let cursor = 0;

  for (const hunkText of hunks) {
    const diffLines = hunkText.split(/\r?\n/);
    const header = diffLines[0]?.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (!header) return null;
    const hunkStart = Number(header[1]) - 1;
    if (hunkStart < cursor) return null;
    while (cursor < hunkStart) output.push(originalLines[cursor++]);

    for (let i = 1; i < diffLines.length; i += 1) {
      const line = diffLines[i];
      if (!line || line.startsWith("\\ No newline")) continue;
      if (line.startsWith(" ")) {
        const expected = line.slice(1);
        if (originalLines[cursor] !== expected) return null;
        output.push(originalLines[cursor++]);
        continue;
      }
      if (line.startsWith("-")) {
        const expected = line.slice(1);
        if (originalLines[cursor] !== expected) return null;
        cursor += 1;
        continue;
      }
      if (line.startsWith("+")) {
        output.push(line.slice(1));
      }
    }
  }

  while (cursor < originalLines.length) output.push(originalLines[cursor++]);
  return output.join(newline) + (hadTrailingNewline ? newline : "");
}

export function applyPatchToFile(
  original: string | null,
  patch: FilePatch
): ApplyPatchResult {
  if (!isSafeRelPath(patch.relPath)) {
    return { ok: false, relPath: patch.relPath, error: "Ruta bloqueada por seguridad." };
  }

  if (patch.isNewFile) {
    const added: string[] = [];
    for (const hunk of patch.hunks) {
      for (const line of hunk.split(/\r?\n/)) {
        if (line.startsWith("+") && !line.startsWith("+++")) added.push(line.slice(1));
      }
    }
    return { ok: true, relPath: patch.relPath, content: added.join("\n") + (added.length ? "\n" : "") };
  }

  if (original === null) {
    return { ok: false, relPath: patch.relPath, error: "Archivo no existe en el workspace." };
  }

  const next = applyHunksToText(original, patch.hunks);
  if (next === null) {
    return {
      ok: false,
      relPath: patch.relPath,
      error: "Contexto del hunk no coincide con el archivo actual."
    };
  }
  return { ok: true, relPath: patch.relPath, content: next };
}

export function planMultiFileApply(
  rawDiff: string,
  readFile: (relPath: string) => string | null
): MultiApplyResult {
  const patches = parseMultiFileDiff(rawDiff);
  if (!patches.length) {
    return { ok: false, patches: [], error: "No se encontró un diff multi-archivo válido." };
  }

  const results: ApplyPatchResult[] = [];
  for (const patch of patches) {
    if (!isSafeRelPath(patch.relPath)) {
      return {
        ok: false,
        patches: [],
        error: `Ruta bloqueada: ${patch.relPath}`
      };
    }
    const original = patch.isNewFile ? null : readFile(patch.relPath);
    const applied = applyPatchToFile(original, patch);
    if (!applied.ok) {
      return {
        ok: false,
        patches: [],
        error: `${applied.relPath}: ${applied.error}`
      };
    }
    results.push(applied);
  }

  return { ok: true, patches: results };
}
