import { describe, expect, it } from "vitest";
import {
  compactRepoTree,
  CONTEXT_BUDGETS,
  isExcludedPath,
  packAgentContext,
  packVolatileContext,
  redactContextText,
  shouldInvokeRg,
  sliceActiveFileAroundSelection,
  TRUNCATION_MARKER,
  truncateWithMarker
} from "../src/context.js";

describe("context helpers", () => {
  it("excludes heavy directories", () => {
    expect(isExcludedPath("node_modules/pkg/index.js")).toBe(true);
    expect(isExcludedPath("src/index.ts")).toBe(false);
  });

  it("invokes rg only on demand", () => {
    expect(shouldInvokeRg("busca referencias de foo")).toBe(true);
    expect(shouldInvokeRg("explicame este archivo")).toBe(false);
  });

  it("compacts repo tree with cap", () => {
    const files = Array.from({ length: 120 }, (_, i) => `src/f${i}.ts`);
    const tree = compactRepoTree(files, 10);
    expect(tree.split("\n").length).toBeLessThanOrEqual(11);
    expect(tree).toContain("más");
  });

  it("clips oversized text with an explicit marker", () => {
    const clipped = truncateWithMarker("x".repeat(100), 40);
    expect(clipped.length).toBeLessThanOrEqual(40);
    expect(clipped).toContain(TRUNCATION_MARKER);
  });

  it("redacts secrets before context packing", () => {
    const out = redactContextText("token sk-abcdefghijklmnopqrstuvwxyz");
    expect(out).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");
    expect(out).toContain("[REDACTED]");
  });

  it("slices large active files around the selection", () => {
    const head = "A".repeat(5000);
    const selection = "TARGET_SELECTION";
    const tail = "B".repeat(5000);
    const file = `${head}${selection}${tail}`;
    const sliced = sliceActiveFileAroundSelection(file, selection, 800);
    expect(sliced).toContain("TARGET_SELECTION");
    expect(sliced.length).toBeLessThanOrEqual(800);
  });

  it("packs volatile context within the total budget", () => {
    const packed = packVolatileContext(
      {
        activePath: "src/index.ts",
        selection: "keep-me",
        activeFile: "Y".repeat(20_000),
        diagnostics: "E".repeat(20_000),
        gitDiff: "D".repeat(20_000),
        rgOutput: "R".repeat(20_000)
      },
      CONTEXT_BUDGETS.volatileContext
    );
    expect(packed.length).toBeLessThanOrEqual(CONTEXT_BUDGETS.volatileContext);
    expect(packed).toContain("keep-me");
    expect(packed).toContain("src/index.ts");
  });

  it("keeps active selection when lower-priority context is large", () => {
    const packed = packVolatileContext({
      activePath: "src/important.ts",
      selection: "selectedSymbol",
      activeFile: "Z".repeat(30_000),
      diagnostics: "diag".repeat(5_000),
      gitDiff: "+".repeat(30_000),
      rgOutput: "match".repeat(5_000)
    });
    expect(packed).toContain("selectedSymbol");
    expect(packed).toContain("src/important.ts");
    expect(packed).toContain(TRUNCATION_MARKER);
  });

  it("packs stable and volatile agent context within explicit budgets", () => {
    const packed = packAgentContext({
      agentsMd: "# Agents\n" + "a".repeat(20_000),
      repoRules: "# Rules\n" + "r".repeat(20_000),
      stableContext: "Estructura del repo:\n" + "t".repeat(20_000),
      volatileParts: {
        activePath: "src/main.ts",
        selection: "focusHere",
        gitDiff: "diff".repeat(10_000),
        rgOutput: "rg".repeat(10_000)
      }
    });

    expect(packed.agentsMd.length).toBeLessThanOrEqual(CONTEXT_BUDGETS.agentsMd);
    expect(packed.repoRules.length).toBeLessThanOrEqual(CONTEXT_BUDGETS.repoRules);
    expect(packed.stableContext.length).toBeLessThanOrEqual(CONTEXT_BUDGETS.stableContext);
    expect(packed.volatileContext.length).toBeLessThanOrEqual(CONTEXT_BUDGETS.volatileContext);
    expect(packed.agentsMd).toContain(TRUNCATION_MARKER);
    expect(packed.volatileContext).toContain("focusHere");
  });
});
