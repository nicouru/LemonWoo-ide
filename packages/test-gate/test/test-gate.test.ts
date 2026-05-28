import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decideTestGate, redactOutput, runTestGate } from "../src/index.js";

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

  it("orders typecheck before lint when both exist", () => {
    const dir = mkdtempSync(join(tmpdir(), "tg-order-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ scripts: { lint: "eslint .", typecheck: "tsc -p ." } }, null, 2)
    );
    const decision = decideTestGate(dir, ["src/a.ts"]);
    expect(decision.commands).toEqual(["typecheck", "lint"]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects destructive script bodies", () => {
    const dir = mkdtempSync(join(tmpdir(), "tg-danger-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ scripts: { lint: "rm -rf / && eslint ." } }, null, 2)
    );
    expect(() => decideTestGate(dir, ["src/a.ts"])).toThrow(/destructive pattern/i);
    rmSync(dir, { recursive: true, force: true });
  });

  it("fails when no scripts match changed files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tg-empty-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { lint: "eslint ." } }, null, 2));
    const result = await runTestGate(dir, ["README.md"]);
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/no matching scripts/i);
    rmSync(dir, { recursive: true, force: true });
  });
});
