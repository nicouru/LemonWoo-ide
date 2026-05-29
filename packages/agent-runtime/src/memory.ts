/**
 * v2.2 minimal repo-local memory — approved facts only in `.lemonwoo/memory.jsonl`.
 * No embeddings, SQLite, cloud sync, or automatic capture from chat.
 */

import { mkdirSync, readFileSync, writeFileSync, unlinkSync, existsSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { isSafeRelPath } from "./multiDiff.js";
import { redactToolOutput } from "./redactTool.js";
import { truncateWithMarker } from "./context.js";

export const MEMORY_REL_PATH = ".lemonwoo/memory.jsonl";
export const MAX_MEMORY_FACT_CHARS = 800;
export const MAX_MEMORY_LINES = 200;
export const MAX_MEMORY_FILE_BYTES = 64_000;
export const MAX_MEMORY_CONTEXT_CHARS = 2_000;

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{8,}/,
  /ghp_[A-Za-z0-9]{16,}/,
  /github_pat_[A-Za-z0-9_]{16,}/,
  /\bBearer\s+[A-Za-z0-9._-]{12,}\b/i,
  /\b(api[_-]?key|secret|password|token)\s*[:=]\s*\S+/i
];

export interface MemoryFactRecord {
  fact: string;
  recordedAt: string;
}

export type MemoryPathResult =
  | { ok: true; abs: string; workspaceRoot: string }
  | { ok: false; reason: string };

export function resolveMemoryFilePath(workspace: string): MemoryPathResult {
  const trimmed = workspace?.trim();
  if (!trimmed) return { ok: false, reason: "Workspace path is required." };
  if (!isAbsolute(trimmed)) return { ok: false, reason: "Workspace path must be absolute." };
  if (/(^|[/\\])\.\.([/\\]|$)/.test(trimmed)) {
    return { ok: false, reason: "Workspace path must not contain parent segments (..)." };
  }

  const workspaceRoot = resolve(trimmed);
  if (!isSafeRelPath(MEMORY_REL_PATH)) {
    return { ok: false, reason: "Invalid memory file path." };
  }

  const abs = resolve(workspaceRoot, MEMORY_REL_PATH);
  const relToRoot = relative(workspaceRoot, abs);
  if (relToRoot.startsWith("..") || isAbsolute(relToRoot)) {
    return { ok: false, reason: "Memory path escapes workspace." };
  }

  return { ok: true, abs, workspaceRoot };
}

function containsSecretShape(text: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(text));
}

export function sanitizeMemoryFact(
  raw: string
): { ok: true; fact: string } | { ok: false; reason: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "Empty fact." };
  if (trimmed.length > MAX_MEMORY_FACT_CHARS) {
    return { ok: false, reason: `Fact exceeds ${MAX_MEMORY_FACT_CHARS} characters.` };
  }

  if (containsSecretShape(trimmed)) {
    return { ok: false, reason: "Secret-looking value refused." };
  }

  const redacted = redactToolOutput(trimmed).trim();
  if (!redacted) return { ok: false, reason: "Fact is empty after redaction." };
  if (containsSecretShape(redacted)) {
    return { ok: false, reason: "Secret-looking value refused." };
  }

  const withoutMarkers = redacted.replace(/\[REDACTED\]/g, "").trim();
  if (!withoutMarkers) {
    return { ok: false, reason: "Fact is mostly secrets; refused." };
  }

  return { ok: true, fact: redacted };
}

function parseMemoryLine(line: string): MemoryFactRecord | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as { fact?: unknown; recordedAt?: unknown };
    if (typeof parsed.fact !== "string") return null;
    const sanitized = sanitizeMemoryFact(parsed.fact);
    if (!sanitized.ok) return null;
    const recordedAt =
      typeof parsed.recordedAt === "string" && parsed.recordedAt.trim()
        ? parsed.recordedAt.trim()
        : new Date(0).toISOString();
    return { fact: sanitized.fact, recordedAt };
  } catch {
    return null;
  }
}

export function readApprovedMemoryFacts(workspace: string): MemoryFactRecord[] {
  const resolved = resolveMemoryFilePath(workspace);
  if (!resolved.ok || !existsSync(resolved.abs)) return [];

  let raw = "";
  try {
    const stat = statSync(resolved.abs);
    if (stat.size > MAX_MEMORY_FILE_BYTES) return [];
    raw = readFileSync(resolved.abs, "utf8");
  } catch {
    return [];
  }

  const facts: MemoryFactRecord[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const record = parseMemoryLine(line);
    if (record) facts.push(record);
    if (facts.length >= MAX_MEMORY_LINES) break;
  }
  return facts;
}

export function formatApprovedMemoryForContext(
  facts: MemoryFactRecord[],
  maxChars = MAX_MEMORY_CONTEXT_CHARS
): string {
  if (!facts.length) return "";
  const lines = facts.map((f, i) => `${i + 1}. ${f.fact}`);
  const body = truncateWithMarker(lines.join("\n"), Math.max(0, maxChars - "## Memoria aprobada\n".length));
  return `## Memoria aprobada\n${body}`.trim();
}

export function readApprovedMemoryContext(workspace: string): string {
  const facts = readApprovedMemoryFacts(workspace);
  return formatApprovedMemoryForContext(facts);
}

export function appendApprovedMemoryFact(
  workspace: string,
  rawFact: string
): { ok: true } | { ok: false; reason: string } {
  const sanitized = sanitizeMemoryFact(rawFact);
  if (!sanitized.ok) return sanitized;

  const resolved = resolveMemoryFilePath(workspace);
  if (!resolved.ok) return { ok: false, reason: resolved.reason };

  const existing = readApprovedMemoryFacts(workspace);
  if (existing.length >= MAX_MEMORY_LINES) {
    return { ok: false, reason: `Memory line cap (${MAX_MEMORY_LINES}) reached.` };
  }

  if (existsSync(resolved.abs)) {
    try {
      const size = statSync(resolved.abs).size;
      if (size >= MAX_MEMORY_FILE_BYTES) {
        return { ok: false, reason: `Memory file exceeds ${MAX_MEMORY_FILE_BYTES} bytes.` };
      }
    } catch {
      return { ok: false, reason: "Unable to read memory file." };
    }
  }

  const record: MemoryFactRecord = {
    fact: sanitized.fact,
    recordedAt: new Date().toISOString()
  };
  const line = `${JSON.stringify(record)}\n`;

  try {
    mkdirSync(dirname(resolved.abs), { recursive: true });
    writeFileSync(resolved.abs, line, { encoding: "utf8", flag: "a" });
  } catch {
    return { ok: false, reason: "Unable to write memory file." };
  }

  return { ok: true };
}

export function clearApprovedMemory(workspace: string): { ok: true; removed: boolean } | { ok: false; reason: string } {
  const resolved = resolveMemoryFilePath(workspace);
  if (!resolved.ok) return { ok: false, reason: resolved.reason };
  if (!existsSync(resolved.abs)) return { ok: true, removed: false };
  try {
    unlinkSync(resolved.abs);
    return { ok: true, removed: true };
  } catch {
    return { ok: false, reason: "Unable to clear memory file." };
  }
}
