import { describe, expect, it, vi, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { buildTerminalChildEnv, runTerminalInWorkspace } from "../src/terminalAdapter.js";
import { resolveWithinWorkspace } from "../src/workspacePath.js";

function mockSpawnChild(): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  (child as any).stdout = new EventEmitter();
  (child as any).stderr = new EventEmitter();
  (child as any).kill = vi.fn();
  setTimeout(() => child.emit("close", 0), 0);
  return child;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("terminalAdapter env", () => {
  it("buildTerminalChildEnv excludes DEEPSEEK_API_KEY", () => {
    const prev = process.env.DEEPSEEK_API_KEY;
    process.env.DEEPSEEK_API_KEY = "sk-test-secret";
    const env = buildTerminalChildEnv();
    expect(env.DEEPSEEK_API_KEY).toBeUndefined();
    if (prev === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = prev;
  });

  it("spawn uses sanitized env without DEEPSEEK_API_KEY", async () => {
    const spawnSpy = vi.fn(() => mockSpawnChild());
    process.env.DEEPSEEK_API_KEY = "sk-test-secret";
    const root = mkdtempSync(join(tmpdir(), "lemonwoo-term-"));
    await runTerminalInWorkspace(
      root,
      { command: "npm test" },
      ["sk-test-secret"],
      { spawnProcess: spawnSpy as never }
    );
    const call = spawnSpy.mock.calls.at(-1);
    expect(call?.[2]?.env?.DEEPSEEK_API_KEY).toBeUndefined();
    expect(call?.[2]?.shell).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("workspacePath", () => {
  it("allows subdir inside workspace", () => {
    const root = mkdtempSync(join(tmpdir(), "lemonwoo-ws-"));
    const resolved = resolveWithinWorkspace(root, "pkg");
    expect(resolved.ok).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects sibling outside workspace", () => {
    const root = mkdtempSync(join(tmpdir(), "lemonwoo-ws-"));
    const sibling = mkdtempSync(join(tmpdir(), "lemonwoo-out-"));
    const resolved = resolveWithinWorkspace(root, join("..", sibling.split("/").pop()!));
    expect(resolved.ok).toBe(false);
    rmSync(root, { recursive: true, force: true });
    rmSync(sibling, { recursive: true, force: true });
  });
});
