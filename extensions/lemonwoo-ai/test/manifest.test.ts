import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("manifest", () => {
  it("exposes LemonWoo Open Agent command", () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));
    const commands = pkg.contributes?.commands ?? [];
    expect(commands.some((c: any) => c.command === "lemonwoo.openAgent")).toBe(true);
  });

  it("starts the agent surface on application startup", () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));
    expect(pkg.activationEvents).toContain("onStartupFinished");
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
    expect(src).toContain("isSafeWorkspacePath");
    expect(src).toContain("relative(workspace");
    expect(src).toContain("\".git\"");
  });

  it("applies unified diffs instead of replacing files with added lines only", () => {
    const src = readFileSync(resolve(process.cwd(), "src/extension.ts"), "utf8");
    expect(src).toContain("applyUnifiedDiffToText");
    expect(src).not.toContain("extractSingleFileReplacement");
  });

  it("wires real cancellation for the stop button", () => {
    const src = readFileSync(resolve(process.cwd(), "src/extension.ts"), "utf8");
    expect(src).toContain("AbortController");
    expect(src).toContain("type:'stop'");
    expect(src).toContain("activeAbort?.abort()");
  });
});
