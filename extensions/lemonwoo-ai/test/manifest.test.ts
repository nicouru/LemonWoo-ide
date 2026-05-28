import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("manifest", () => {
  it("exposes LemonWoo Open Agent command", () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf8"));
    const commands = pkg.contributes?.commands ?? [];
    expect(commands.some((c: any) => c.command === "lemonwoo.openAgent")).toBe(true);
  });

  it("starts the agent surface on application startup", () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf8"));
    expect(pkg.activationEvents).toContain("onStartupFinished");
  });

  it("uses a CommonJS bundle entry despite package type module", () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf8"));
    expect(pkg.type).toBe("module");
    expect(pkg.main).toBe("./dist/extension.cjs");
  });

  it("does not expose model/provider pickers", () => {
    const pkgRaw = readFileSync(resolve(__dirname, "../src/extension.ts"), "utf8");
    expect(pkgRaw).not.toContain("modelSelect");
    expect(pkgRaw).not.toContain("providerSelect");
  });

  it("includes AGENTS.md and .lemonwoo/rules context hooks", () => {
    const src = readFileSync(resolve(__dirname, "../src/agentContext.ts"), "utf8");
    expect(src).toContain("AGENTS.md");
    expect(src).toContain(".lemonwoo");
  });

  it("guards path traversal and .git edits in apply flow", () => {
    const src = readFileSync(resolve(__dirname, "../src/multiDiffApply.ts"), "utf8");
    expect(src).toContain("isSafeWorkspacePath");
    expect(src).toContain("relative(workspace");
    expect(src).toContain("\".git\"");
  });

  it("applies multi-file diffs via agent-runtime planner", () => {
    const src = readFileSync(resolve(__dirname, "../src/multiDiffApply.ts"), "utf8");
    expect(src).toContain("planMultiFileApply");
    expect(src).toContain("workspace.applyEdit");
  });

  it("wires real cancellation for the stop button", () => {
    const src = readFileSync(resolve(__dirname, "../src/extension.ts"), "utf8");
    expect(src).toContain("AbortController");
    expect(src).toContain("type:'stop'");
    expect(src).toContain("activeAbort?.abort()");
  });

  it("shows serving state and a clickable preview URL", () => {
    const src = readFileSync(resolve(__dirname, "../src/extension.ts"), "utf8");
    expect(src).toContain("\"Sirviendo\"");
    expect(src).toContain("type: \"serverReady\"");
    expect(src).toContain("<a href=");
  });

  it("focuses DeepSeek key input when key is missing", () => {
    const src = readFileSync(resolve(__dirname, "../src/extension.ts"), "utf8");
    expect(src).toContain("function focusKey()");
    expect(src).toContain("if (m.type === 'needKey')");
    expect(src).toContain("focusKey()");
  });

  it("focuses agent prompt when key is already configured", () => {
    const src = readFileSync(resolve(__dirname, "../src/extension.ts"), "utf8");
    expect(src).toContain("function focusPrompt()");
    expect(src).toContain("if (m.type === 'ready')");
    expect(src).toContain("focusPrompt()");
  });

  it("safely closes welcome tabs without closing user files", () => {
    const src = readFileSync(resolve(__dirname, "../src/extension.ts"), "utf8");
    expect(src).toContain("closeWelcomeTabs");
    expect(src).toContain("isWelcomeTab");
    expect(src).toContain("!tab.isDirty && !tab.isPinned");
    expect(src).toContain("vscode.window.tabGroups.close");
  });
});
