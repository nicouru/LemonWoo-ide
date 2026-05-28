import { describe, expect, it } from "vitest";
import { decideTestGate, redactOutput } from "../src/index.js";

describe("test gate", () => {
  it("redacts secrets from output", () => {
    const out = redactOutput("error sk-secret-value");
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("sk-secret-value");
  });

  it("returns package manager and commands", () => {
    const decision = decideTestGate(process.cwd(), ["src/file.ts"]);
    expect(["pnpm", "npm", "yarn"]).toContain(decision.packageManager);
    expect(Array.isArray(decision.commands)).toBe(true);
  });
});
