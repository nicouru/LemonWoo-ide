import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import {
  canStorePendingTerminalCommand,
  clearPendingTerminalCommand,
  getPendingTerminalCommand,
  pendingFromToolArgs,
  setPendingTerminalCommand,
  toConfirmedRunInput
} from "../src/terminalConfirmation.js";
import { runTerminalInWorkspace } from "../src/terminalAdapter.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensionSrc = readFileSync(resolve(__dirname, "../src/extension.ts"), "utf8");

function mockSpawnChild(exitCode = 0): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  (child as ChildProcess & { stdout: EventEmitter }).stdout = new EventEmitter();
  (child as ChildProcess & { stderr: EventEmitter }).stderr = new EventEmitter();
  (child as ChildProcess & { kill: ReturnType<typeof vi.fn> }).kill = vi.fn();
  setTimeout(() => child.emit("close", exitCode), 0);
  return child;
}

afterEach(() => {
  clearPendingTerminalCommand();
  vi.restoreAllMocks();
});

describe("terminalConfirmation state", () => {
  it("stores pending command for confirm-required install", () => {
    const pending = pendingFromToolArgs({ command: "pnpm install", cwd: "." });
    expect(pending).toEqual({ command: "pnpm install", cwd: "." });
    setPendingTerminalCommand(pending!);
    expect(getPendingTerminalCommand()?.command).toBe("pnpm install");
  });

  it("cancel clears pending command", () => {
    setPendingTerminalCommand({ command: "pnpm install", cwd: "." });
    clearPendingTerminalCommand();
    expect(getPendingTerminalCommand()).toBeUndefined();
  });

  it("blocked command never becomes pending/confirmable", () => {
    expect(canStorePendingTerminalCommand("rm -rf node_modules")).toBe(false);
    expect(pendingFromToolArgs({ command: "rm -rf node_modules" })).toBeNull();
    expect(canStorePendingTerminalCommand("git push origin main")).toBe(false);
    expect(pendingFromToolArgs({ command: "ls .git" })).toBeNull();
  });
});

describe("confirmed terminal execution", () => {
  it("confirm executes through terminal adapter with shell:false and sanitized env", async () => {
    const restoreEnv = seedSecretEnv();
    const workspace = mkdtempSync(join(tmpdir(), "lemonwoo-term-confirm-"));
    const spawnSpy = vi.fn(() => mockSpawnChild(0));

    try {
      const result = await runTerminalInWorkspace(
        workspace,
        toConfirmedRunInput({ command: "pnpm install", cwd: "." }),
        ["sk-test-secret"],
        { spawnProcess: spawnSpy as never }
      );

      expect(result.requiresConfirmation).toBeFalsy();
      expect(spawnSpy).toHaveBeenCalledTimes(1);
      const call = spawnSpy.mock.calls[0];
      expect(call?.[0]).toBe("pnpm");
      expect(call?.[1]).toEqual(["install"]);
      expect(call?.[2]?.shell).toBe(false);
      expect(call?.[2]?.env?.DEEPSEEK_API_KEY).toBeUndefined();
    } finally {
      restoreEnv();
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});

describe("extension terminal confirmation wiring", () => {
  it("renders confirmation UI and message handlers in the agent webview", () => {
    expect(extensionSrc).toContain('id="terminalConfirm"');
    expect(extensionSrc).toContain('type: "terminalConfirm"');
    expect(extensionSrc).toContain('type: "terminalConfirmClear"');
    expect(extensionSrc).toContain('msg.type === "confirmTerminal"');
    expect(extensionSrc).toContain('msg.type === "cancelTerminal"');
    expect(extensionSrc).toContain("pendingFromToolArgs");
    expect(extensionSrc).toContain("handleConfirmTerminal");
    expect(extensionSrc).toContain("handleCancelTerminal");
  });

  it("confirmed output uses info on #out and does not touch previewBox", () => {
    const fn = extensionSrc.slice(
      extensionSrc.indexOf("async function handleConfirmTerminal"),
      extensionSrc.indexOf("async function handleTestGate")
    );
    expect(fn).toContain('type: "info"');
    expect(fn).not.toContain("previewBox");
    expect(fn).not.toContain("runAgentTask");
    expect(fn).not.toContain("runAgentCycle");
  });
});

function seedSecretEnv(): () => void {
  const prev = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "sk-test-secret";
  return () => {
    if (prev === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = prev;
  };
}
