import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readApprovedMemoryFacts } from "@lemonwoo/agent-runtime";
import { tryHandleMemoryCommand } from "../src/memoryCommands.js";

describe("memoryCommands", () => {
  it("records, lists, and clears only on explicit prompts", () => {
    const root = mkdtempSync(join(tmpdir(), "lemonwoo-mem-cmd-"));

    const record = tryHandleMemoryCommand(root, "remember this: use pnpm for installs");
    expect(record.handled).toBe(true);
    expect(readApprovedMemoryFacts(root)).toHaveLength(1);

    const list = tryHandleMemoryCommand(root, "list memory");
    expect(list.handled).toBe(true);
    expect(list.message).toContain("use pnpm");

    const clear = tryHandleMemoryCommand(root, "clear memory");
    expect(clear.handled).toBe(true);
    expect(readApprovedMemoryFacts(root)).toHaveLength(0);

    const ignored = tryHandleMemoryCommand(root, "fix the failing test");
    expect(ignored.handled).toBe(false);

    rmSync(root, { recursive: true, force: true });
  });
});
