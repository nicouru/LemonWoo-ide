import { describe, expect, it } from "vitest";
import { compactRepoTree, isExcludedPath, shouldInvokeRg } from "../src/context.js";

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
});
