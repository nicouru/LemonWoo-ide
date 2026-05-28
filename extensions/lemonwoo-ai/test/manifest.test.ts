import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("manifest", () => {
  it("exposes LemonWoo Open Agent command", () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));
    const commands = pkg.contributes?.commands ?? [];
    expect(commands.some((c: any) => c.command === "lemonwoo.openAgent")).toBe(true);
  });

  it("does not expose model/provider pickers", () => {
    const pkgRaw = readFileSync(resolve(process.cwd(), "src/extension.ts"), "utf8");
    expect(pkgRaw).not.toContain("modelSelect");
    expect(pkgRaw).not.toContain("providerSelect");
  });

  it("includes AGENTS.md and .lemonwoo/rules context hooks", () => {
    const src = readFileSync(resolve(process.cwd(), "src/extension.ts"), "utf8");
    expect(src).toContain("AGENTS.md");
    expect(src).toContain(".lemonwoo");
  });

  it("guards path traversal and .git edits in apply flow", () => {
    const src = readFileSync(resolve(process.cwd(), "src/extension.ts"), "utf8");
    expect(src).toContain("startsWith(workspace)");
    expect(src).toContain(".git/");
  });
});
