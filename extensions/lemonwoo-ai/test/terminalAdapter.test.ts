import { describe, expect, it, vi, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { buildTerminalChildEnv, runTerminalInWorkspace } from "../src/terminalAdapter.js";
import { resolveWithinWorkspace } from "../src/workspacePath.js";
import { startPreviewForWorkspace, stopPreviewForWorkspace } from "../src/previewAdapter.js";
import { stopAllPreviewServers } from "../src/localActions.js";

afterEach(() => {
  stopAllPreviewServers();
});

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    spawn: vi.fn(() => {
      const { EventEmitter } = require("node:events");
      const child = new EventEmitter();
      (child as any).stdout = new EventEmitter();
      (child as any).stderr = new EventEmitter();
      (child as any).kill = vi.fn();
      setTimeout(() => child.emit("close", 0), 0);
      return child;
    })
  };
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
    process.env.DEEPSEEK_API_KEY = "sk-test-secret";
    const root = mkdtempSync(join(tmpdir(), "lemonwoo-term-"));
    await runTerminalInWorkspace(root, { command: "npm test" }, ["sk-test-secret"]);
    const call = vi.mocked(spawn).mock.calls.at(-1);
    expect(call?.[2]?.env?.DEEPSEEK_API_KEY).toBeUndefined();
    rmSync(root, { recursive: true, force: true });
  });
});

describe("workspacePath", () => {
  it("allows subdir inside workspace", () => {
    const root = mkdtempSync(join(tmpdir(), "lemonwoo-ws-"));
    mkdirSync(join(root, "pkg"), { recursive: true });
    writeFileSync(join(root, "pkg", ".keep"), "");
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

describe("previewAdapter cwd", () => {
  it("preview subdir stop uses same path key", async () => {
    const root = mkdtempSync(join(tmpdir(), "lemonwoo-prev-sub-"));
    const sub = join(root, "site");
    mkdirSync(sub, { recursive: true });
    writeFileSync(join(sub, "index.html"), "<html></html>");
    const start = await startPreviewForWorkspace(root, { cwd: "site" });
    expect(start.ok).toBe(true);
    const stop = stopPreviewForWorkspace(root, "site");
    expect(stop.ok).toBe(true);
    rmSync(root, { recursive: true, force: true });
  }, 35_000);

  it("rejects cwd outside workspace", async () => {
    const root = mkdtempSync(join(tmpdir(), "lemonwoo-prev-"));
    const result = await startPreviewForWorkspace(root, { cwd: "../outside" });
    expect(result.ok).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });
});
