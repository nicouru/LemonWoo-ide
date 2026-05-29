import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  MEMORY_REL_PATH,
  appendApprovedMemoryFact,
  clearApprovedMemory,
  readApprovedMemoryContext,
  readApprovedMemoryFacts,
  resolveMemoryFilePath,
  sanitizeMemoryFact
} from "../src/memory.js";

function tempWorkspace(): string {
  return mkdtempSync(join(tmpdir(), "lemonwoo-memory-"));
}

describe("approved memory", () => {
  it("resolves memory only inside workspace", () => {
    const root = tempWorkspace();
    const ok = resolveMemoryFilePath(root);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.abs).toBe(join(root, MEMORY_REL_PATH));
    }
    const bad = resolveMemoryFilePath("../escape");
    expect(bad.ok).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects path traversal via workspace argument", () => {
    const root = tempWorkspace();
    const traversalWorkspace = `${root}/../../etc/passwd`;
    const result = resolveMemoryFilePath(traversalWorkspace);
    expect(result.ok).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it("appends explicit fact only and reads into stable context block", () => {
    const root = tempWorkspace();
    const append = appendApprovedMemoryFact(root, "Prefer pnpm in this repo.");
    expect(append.ok).toBe(true);

    const facts = readApprovedMemoryFacts(root);
    expect(facts).toHaveLength(1);
    expect(facts[0]?.fact).toBe("Prefer pnpm in this repo.");

    const context = readApprovedMemoryContext(root);
    expect(context).toContain("Memoria aprobada");
    expect(context).toContain("Prefer pnpm in this repo.");

    rmSync(root, { recursive: true, force: true });
  });

  it("rejects or redacts secret-looking values", () => {
    const secret = sanitizeMemoryFact("api_key=supersecretvalue");
    expect(secret.ok).toBe(false);

    const sk = sanitizeMemoryFact("Use sk-abcdefghijklmnopqrstuvwxyz for nothing");
    expect(sk.ok).toBe(false);

    const safe = sanitizeMemoryFact("Run tests with pnpm test before merge.");
    expect(safe.ok).toBe(true);
  });

  it("clear removes repo-local memory file", () => {
    const root = tempWorkspace();
    appendApprovedMemoryFact(root, "Temporary note.");
    const memoryPath = join(root, MEMORY_REL_PATH);
    expect(existsSync(memoryPath)).toBe(true);

    const cleared = clearApprovedMemory(root);
    expect(cleared.ok).toBe(true);
    if (cleared.ok) expect(cleared.removed).toBe(true);
    expect(existsSync(memoryPath)).toBe(false);

    rmSync(root, { recursive: true, force: true });
  });

  it("ignores invalid jsonl lines when reading", () => {
    const root = tempWorkspace();
    mkdirSync(join(root, ".lemonwoo"), { recursive: true });
    writeFileSync(
      join(root, MEMORY_REL_PATH),
      '{"fact":"valid"}\nnot json\n{"fact":"sk-abcdefghijklmnopqrstuvwxyz"}\n',
      "utf8"
    );
    const facts = readApprovedMemoryFacts(root);
    expect(facts).toHaveLength(1);
    expect(facts[0]?.fact).toBe("valid");
    rmSync(root, { recursive: true, force: true });
  });

  it("does not read memory outside resolved workspace root", () => {
    const root = tempWorkspace();
    const outside = tempWorkspace();
    appendApprovedMemoryFact(outside, "Outside fact.");
    const context = readApprovedMemoryContext(root);
    expect(context).toBe("");
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  it("persists append as jsonl", () => {
    const root = tempWorkspace();
    appendApprovedMemoryFact(root, "Use vitest.");
    const raw = readFileSync(join(root, MEMORY_REL_PATH), "utf8").trim();
    expect(() => JSON.parse(raw)).not.toThrow();
    rmSync(root, { recursive: true, force: true });
  });
});
