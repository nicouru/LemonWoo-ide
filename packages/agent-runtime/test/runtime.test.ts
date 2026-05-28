import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("runtime constraints", () => {
  it("does not reference anthropic compatibility", () => {
    const src = readFileSync(resolve(process.cwd(), "src/index.ts"), "utf8");
    expect(src.toLowerCase()).not.toContain("anthropic");
  });
});
