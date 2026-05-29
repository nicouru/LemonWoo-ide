import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("vscode", () => ({
  commands: { registerCommand: vi.fn(() => ({ dispose: vi.fn() })) },
  window: {
    showInformationMessage: vi.fn(),
    createOutputChannel: vi.fn(() => ({
      clear: vi.fn(),
      appendLine: vi.fn(),
      show: vi.fn()
    }))
  }
}));

import { runHarnessDiagnostic } from "../src/harnessDiagnostic.js";

describe("harnessDiagnostic", () => {
  it("defines packaged-app fallback with clear message and try/catch import", () => {
    const src = readFileSync(join(process.cwd(), "src/harnessDiagnostic.ts"), "utf8");
    expect(src).toContain("OpenCode diagnostic is unavailable in packaged LemonWoo");
    expect(src).toContain("pnpm opencode:spike");
    expect(src).toMatch(/catch\s*\{/);
    expect(src).not.toMatch(/from\s+["']@lemonwoo\/agent-runtime\/opencode["']/);
  });

  it("runHarnessDiagnostic returns fallback when opencode module is unavailable", async () => {
    const report = await runHarnessDiagnostic({ secrets: { get: vi.fn() } } as never, async () => null);
    expect(report).toContain("UNAVAILABLE");
    expect(report).toContain("pnpm opencode:spike");
    expect(report).not.toContain("sk-");
  });
});
