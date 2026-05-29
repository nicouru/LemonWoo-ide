import { describe, expect, it, vi, afterEach } from "vitest";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { executeTool } from "@lemonwoo/agent-runtime";
import { runTerminalInWorkspace } from "../src/terminalAdapter.js";

const RUNTIME_LIMITS = {
  maxSteps: 6,
  maxRepairAttempts: 2,
  maxToolOutputChars: 500,
  maxSearchResults: 20,
  maxFileReadChars: 20_000
};

const EXTRA_SECRETS = ["sk-gauntlet-redact-test-abcdefghijklmnop"];

function mockSpawnChild(exitCode = 0): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  (child as ChildProcess & { stdout: EventEmitter }).stdout = new EventEmitter();
  (child as ChildProcess & { stderr: EventEmitter }).stderr = new EventEmitter();
  (child as ChildProcess & { kill: ReturnType<typeof vi.fn> }).kill = vi.fn();
  setTimeout(() => child.emit("close", exitCode), 0);
  return child;
}

function seedSecretEnv(): () => void {
  const prev: Record<string, string | undefined> = {
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    MY_SECRET: process.env.MY_SECRET,
    PASSWORD: process.env.PASSWORD,
    CUSTOM_KEY: process.env.CUSTOM_KEY
  };
  process.env.DEEPSEEK_API_KEY = "sk-test-deepseek-secret";
  process.env.GITHUB_TOKEN = "ghp_testtoken1234567890";
  process.env.MY_SECRET = "secret-value";
  process.env.PASSWORD = "password-value";
  process.env.CUSTOM_KEY = "custom-key-value";
  return () => {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

function makeWorkspace(mode: "pass" | "long" | "leak" = "pass"): string {
  const root = join(import.meta.dirname, "..", "..", "..", "fixtures", "terminal-gauntlet");
  const workspace = mkdtempSync(join(tmpdir(), "lemonwoo-terminal-gauntlet-"));
  cpSync(root, workspace, { recursive: true });
  if (mode === "long") {
    writeFileSync(join(workspace, "test", "run.js"), 'console.log("x".repeat(20000));\n');
  }
  if (mode === "leak") {
    writeFileSync(
      join(workspace, "test", "run.js"),
      'console.log("output contains sk-gauntlet-redact-test-abcdefghijklmnop");\n'
    );
  }
  return workspace;
}

function terminalAdapter(workspace: string) {
  return {
    runTerminal: (input: Parameters<typeof runTerminalInWorkspace>[1]) =>
      runTerminalInWorkspace(workspace, input, EXTRA_SECRETS)
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("v2 terminal tool gauntlet (deterministic, no-key)", () => {
  it("allows npm test via executeTool through extension terminal adapter with shell:false", async () => {
    const restoreEnv = seedSecretEnv();
    const workspace = makeWorkspace("pass");
    const spawnSpy = vi.fn(() => mockSpawnChild(0));
    const adapter = {
      runTerminal: (input: Parameters<typeof runTerminalInWorkspace>[1]) =>
        runTerminalInWorkspace(workspace, input, EXTRA_SECRETS, {
          spawnProcess: spawnSpy as never
        })
    };

    try {
      const result = await executeTool(
        { tool: "run_terminal", args: { command: "npm test" } },
        { adapters: adapter, limits: RUNTIME_LIMITS, touchedFiles: [] }
      );

      expect(result.ok).toBe(true);
      expect(result.requiresConfirmation).toBeFalsy();
      expect(spawnSpy).toHaveBeenCalledTimes(1);

      const call = spawnSpy.mock.calls[0];
      expect(call?.[0]).toBe("npm");
      expect(call?.[1]).toEqual(["test"]);
      expect(call?.[2]?.shell).toBe(false);
      expect(call?.[2]?.env?.DEEPSEEK_API_KEY).toBeUndefined();
      expect(call?.[2]?.env?.GITHUB_TOKEN).toBeUndefined();
      expect(call?.[2]?.env?.MY_SECRET).toBeUndefined();
      expect(call?.[2]?.env?.PASSWORD).toBeUndefined();
      expect(call?.[2]?.env?.CUSTOM_KEY).toBeUndefined();
    } finally {
      restoreEnv();
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 20_000);

  it("runs allowed npm test with real spawn and sanitized child env", async () => {
    const restoreEnv = seedSecretEnv();
    const workspace = makeWorkspace("pass");

    try {
      const direct = await runTerminalInWorkspace(
        workspace,
        { command: "npm test" },
        EXTRA_SECRETS
      );
      expect(direct.ok).toBe(true);
      expect(direct.output).toContain("gauntlet-ok");
      expect(direct.output).not.toContain("sk-test-deepseek-secret");
      expect(direct.output).not.toContain("forbidden-env");
    } finally {
      restoreEnv();
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 20_000);

  it("requires confirmation for install/create/npx-like commands without executing", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "lemonwoo-terminal-blocked-"));
    const spawnSpy = vi.fn(() => mockSpawnChild(0));

    try {
      for (const command of ["pnpm install", "npm create vite@latest", "npx create-vite"]) {
        const result = await executeTool(
          { tool: "run_terminal", args: { command } },
          {
            adapters: {
              runTerminal: (input) =>
                runTerminalInWorkspace(workspace, input, EXTRA_SECRETS, {
                  spawnProcess: spawnSpy as never
                })
            },
            limits: RUNTIME_LIMITS,
            touchedFiles: []
          }
        );
        expect(result.ok).toBe(false);
        expect(result.requiresConfirmation).toBe(true);
      }
      expect(spawnSpy).not.toHaveBeenCalled();
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("blocks traversal, .git, and destructive commands", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "lemonwoo-terminal-blocked-"));
    const spawnSpy = vi.fn(() => mockSpawnChild(0));
    const adapter = {
      runTerminal: (input: Parameters<typeof runTerminalInWorkspace>[1]) =>
        runTerminalInWorkspace(workspace, input, EXTRA_SECRETS, {
          spawnProcess: spawnSpy as never
        })
    };

    try {
      const blocked = [
        "rm -rf node_modules",
        "git push origin main",
        "rg foo ../outside",
        "ls .git"
      ];
      for (const command of blocked) {
        const result = await executeTool(
          { tool: "run_terminal", args: { command } },
          { adapters: adapter, limits: RUNTIME_LIMITS, touchedFiles: [] }
        );
        expect(result.ok).toBe(false);
        expect(result.output).toMatch(/blocked|Rejected/i);
      }

      const badCwd = await executeTool(
        { tool: "run_terminal", args: { command: "npm test", cwd: "../outside" } },
        { adapters: adapter, limits: RUNTIME_LIMITS, touchedFiles: [] }
      );
      expect(badCwd.ok).toBe(false);
      expect(badCwd.output).toMatch(/Rejected cwd/i);
      expect(spawnSpy).not.toHaveBeenCalled();
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("bounds and redacts terminal output through executeTool", async () => {
    const restoreEnv = seedSecretEnv();
    const workspace = makeWorkspace("long");

    try {
      const long = await executeTool(
        { tool: "run_terminal", args: { command: "npm test" } },
        { adapters: terminalAdapter(workspace), limits: RUNTIME_LIMITS, touchedFiles: [] }
      );
      expect(long.ok).toBe(true);
      expect(long.truncated).toBe(true);
      expect(long.output.length).toBeLessThanOrEqual(RUNTIME_LIMITS.maxToolOutputChars + 32);
      expect(long.output).toContain("...[truncated]");
    } finally {
      restoreEnv();
      rmSync(workspace, { recursive: true, force: true });
    }

    const leakWorkspace = makeWorkspace("leak");
    try {
      const redacted = await executeTool(
        { tool: "run_terminal", args: { command: "npm test" } },
        { adapters: terminalAdapter(leakWorkspace), limits: RUNTIME_LIMITS, touchedFiles: [] }
      );
      expect(redacted.ok).toBe(true);
      expect(redacted.output).toContain("[REDACTED]");
      expect(redacted.output).not.toContain("sk-gauntlet-redact-test-abcdefghijklmnop");
    } finally {
      restoreEnv();
      rmSync(leakWorkspace, { recursive: true, force: true });
    }
  }, 30_000);
});
