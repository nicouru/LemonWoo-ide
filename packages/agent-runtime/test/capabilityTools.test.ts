import { describe, expect, it, vi } from "vitest";
import { executeTool } from "../src/tools.js";
import { DEFAULT_RUNTIME_LIMITS } from "../src/contracts.js";

const limits = DEFAULT_RUNTIME_LIMITS;

describe("capability tools", () => {
  it("run_terminal returns requiresConfirmation for install", async () => {
    const result = await executeTool(
      { tool: "run_terminal", args: { command: "pnpm install" } },
      { adapters: { runTerminal: vi.fn() }, limits, touchedFiles: [] }
    );
    expect(result.requiresConfirmation).toBe(true);
    expect(result.ok).toBe(false);
  });

  it("run_terminal executes allowed command via adapter", async () => {
    const runTerminal = vi.fn(async () => ({
      ok: true,
      command: "npm test",
      cwd: ".",
      output: "ok",
      stdout: "ok",
      stderr: ""
    }));
    const result = await executeTool(
      { tool: "run_terminal", args: { command: "npm test" } },
      { adapters: { runTerminal }, limits, touchedFiles: [] }
    );
    expect(runTerminal).toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it("verify_files_exist reports missing files", async () => {
    const result = await executeTool(
      { tool: "verify_files_exist", args: { paths: "src/a.ts,src/b.ts" } },
      {
        adapters: {
          verifyFilesExist: async () => ({ ok: false, present: ["src/a.ts"], missing: ["src/b.ts"] })
        },
        limits,
        touchedFiles: []
      }
    );
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["src/b.ts"]);
  });

  it("start_preview_server returns url", async () => {
    const result = await executeTool(
      { tool: "start_preview_server", args: {} },
      {
        adapters: {
          startPreviewServer: async () => ({
            ok: true,
            url: "http://localhost:8000",
            reused: false,
            output: "ready"
          })
        },
        limits,
        touchedFiles: []
      }
    );
    expect(result.url).toBe("http://localhost:8000");
    expect(result.ok).toBe(true);
  });

  it("rejects unsafe verify path", async () => {
    const result = await executeTool(
      { tool: "verify_files_exist", args: { paths: "../secret" } },
      { adapters: {}, limits, touchedFiles: [] }
    );
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(/Rejected path/);
  });
});
