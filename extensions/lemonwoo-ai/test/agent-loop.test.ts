import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { shouldInvokeRg } from "../../../packages/agent-runtime/src/context.js";
import { planMultiFileApply } from "../../../packages/agent-runtime/src/multiDiff.js";

describe("agent programming loop wiring", () => {
  it("includes AGENTS.md and rules via agentContext", () => {
    const src = readFileSync(resolve(process.cwd(), "src/agentContext.ts"), "utf8");
    expect(src).toContain("AGENTS.md");
    expect(src).toContain(".lemonwoo");
  });

  it("uses runAgentTask and DeepSeek client in extension", () => {
    const src = readFileSync(resolve(process.cwd(), "src/extension.ts"), "utf8");
    expect(src).toContain("runAgentTask");
    expect(src).toContain("DeepSeekClient");
    expect(src).toContain("runTestGate");
    expect(src).not.toContain("modelSelect");
  });

  it("shows Corregir con agente only on test failure path", () => {
    const src = readFileSync(resolve(process.cwd(), "src/extension.ts"), "utf8");
    expect(src).toContain("fixAgent");
    expect(src).toContain('type: "fixAgent"');
    expect(src).toContain("lastTestFailed");
  });

  it("preserves lastUserTask for fix loop", () => {
    const src = readFileSync(resolve(process.cwd(), "src/extension.ts"), "utf8");
    expect(src).toContain("lastUserTask");
    expect(src).toMatch(/lastUserTask\s*=\s*prompt/);
    expect(src).toContain("originalTask = lastUserTask");
  });

  it("tracks text editor separately from webview focus", () => {
    const tracking = readFileSync(resolve(process.cwd(), "src/editorTracking.ts"), "utf8");
    const ext = readFileSync(resolve(process.cwd(), "src/extension.ts"), "utf8");
    expect(tracking).toContain("onDidChangeActiveTextEditor");
    expect(tracking).toContain('scheme === "file"');
    expect(ext).toContain("getPreferredTextEditor");
    expect(ext).toContain("registerTextEditorTracking");
  });

  it("invokes rg only on demand", () => {
    expect(shouldInvokeRg("busca usos de sum")).toBe(true);
    expect(shouldInvokeRg("explica este archivo")).toBe(false);
  });

  it("supports multi-file diff apply planning", () => {
    const diff = [
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1 +1 @@",
      "-old",
      "+new"
    ].join("\n");
    const plan = planMultiFileApply(diff, () => "old\n");
    expect(plan.ok).toBe(true);
    expect(plan.patches[0]?.content).toBe("new\n");
  });

  it("fixture agent-loop-ts starts red", async () => {
    const { spawnSync } = await import("node:child_process");
    const fixture = resolve(process.cwd(), "../../fixtures/agent-loop-ts");
    const res = spawnSync("npm", ["test"], { cwd: fixture, encoding: "utf8" });
    expect(res.status).not.toBe(0);
  });
});
