import { describe, expect, it } from "vitest";
import {
  countDiffBlocks,
  isSafeRelPath,
  parseMultiFileDiff,
  planMultiFileApply,
  touchedFilesFromDiff
} from "../src/multiDiff.js";

describe("multi-file diff", () => {
  const sample = [
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -1,2 +1,2 @@",
    " export const x = 1;",
    "-export const y = 1;",
    "+export const y = 2;",
    "--- a/src/new.ts",
    "+++ b/src/new.ts",
    "@@ -0,0 +1,1 @@",
    "+export const created = true;"
  ].join("\n");

  it("parses multiple files", () => {
    const patches = parseMultiFileDiff(sample);
    expect(patches.length).toBe(2);
    expect(patches.map((p) => p.relPath)).toEqual(["src/a.ts", "src/new.ts"]);
  });

  it("rejects path traversal and .git", () => {
    expect(isSafeRelPath("../secret")).toBe(false);
    expect(isSafeRelPath(".git/config")).toBe(false);
    expect(isSafeRelPath("src/ok.ts")).toBe(true);
  });

  it("creates new file content", () => {
    const files = new Map<string, string>([["src/a.ts", "export const x = 1;\nexport const y = 1;\n"]]);
    const plan = planMultiFileApply(sample, (rel) => files.get(rel) ?? null);
    expect(plan.ok).toBe(true);
    expect(plan.patches.find((p) => p.relPath === "src/new.ts")?.content).toContain("created");
  });

  it("fails without partial apply when hunk mismatches", () => {
    const files = new Map<string, string>([["src/a.ts", "export const x = 1;\nexport const y = 999;\n"]]);
    const plan = planMultiFileApply(sample, (rel) => files.get(rel) ?? null);
    expect(plan.ok).toBe(false);
    expect(plan.error).toMatch(/no coincide/i);
  });

  it("lists touched files", () => {
    expect(touchedFilesFromDiff(sample).sort()).toEqual(["src/a.ts", "src/new.ts"]);
  });

  it("rejects multiple fenced diff blocks", () => {
    const raw = "```diff\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-a\n+b\n```\ntext\n```diff\n--- a/b.ts\n+++ b/b.ts\n@@ -1 +1 @@\n-c\n+d\n```";
    expect(countDiffBlocks(raw)).toBe(2);
    const plan = planMultiFileApply(raw, () => "a\n");
    expect(plan.ok).toBe(false);
  });
});
