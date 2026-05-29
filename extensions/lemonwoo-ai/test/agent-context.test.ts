import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { listWorkspaceFiles } from "../src/repoFiles.js";
import {
  appendApprovedMemoryFact,
  packAgentContext,
  readApprovedMemoryContext,
  TRUNCATION_MARKER
} from "@lemonwoo/agent-runtime";

describe("agentContext", () => {
  it("lists nested files with root-relative paths", () => {
    const root = mkdtempSync(join(tmpdir(), "lemonwoo-tree-"));
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "sum.ts"), "export const x = 1;");
    writeFileSync(join(root, "package.json"), "{}");

    const files = listWorkspaceFiles(root);
    expect(files).toContain("src/");
    expect(files).toContain("src/sum.ts");
    expect(files).not.toContain("sum.ts");

    rmSync(root, { recursive: true, force: true });
  });

  it("gatherAgentContext accepts explicit editor snapshot", () => {
    const src = readFileSync(resolve(process.cwd(), "src/agentContext.ts"), "utf8");
    expect(src).toContain("editorSnapshot?: EditorSnapshot");
    expect(src).toContain("editorSnapshot ?? editorToSnapshot(editor, workspace)");
    expect(src).not.toMatch(/vscode\.window\.activeTextEditor/);
  });

  it("runRg passes -- before query to prevent rg option injection", () => {
    const src = readFileSync(resolve(process.cwd(), "src/agentContext.ts"), "utf8");
    const runRgBlock = src.slice(src.indexOf("export async function runRg"));
    expect(runRgBlock).toMatch(/"!out\/\*\*"\s*,\s*"\-\-"\s*,\s*query\s*,\s*"\."\s*\]/);
    expect(runRgBlock).toContain('shell: false');
  });

  it("gatherAgentContext uses packAgentContext for bounded output", () => {
    const src = readFileSync(resolve(process.cwd(), "src/agentContext.ts"), "utf8");
    expect(src).toContain("packAgentContext");
    expect(src).not.toContain("buildVolatileContext");
  });

  it("gatherAgentContext wires approved memory into stable context", () => {
    const src = readFileSync(resolve(process.cwd(), "src/agentContext.ts"), "utf8");
    expect(src).toContain("readApprovedMemoryContext");

    const root = mkdtempSync(join(tmpdir(), "lemonwoo-ctx-mem-"));
    appendApprovedMemoryFact(root, "Always run pnpm test before merge.");
    const memoryBlock = readApprovedMemoryContext(root);
    const packed = packAgentContext({
      agentsMd: "",
      repoRules: "",
      stableContext: `Estructura del repo:\nsrc/\n\n${memoryBlock}`,
      volatileParts: {}
    });
    expect(packed.stableContext).toContain("Memoria aprobada");
    expect(packed.stableContext).toContain("pnpm test");
    rmSync(root, { recursive: true, force: true });
  });

  it("packAgentContext keeps selection when diff and rg output are huge", () => {
    const packed = packAgentContext({
      agentsMd: "# Agents",
      repoRules: "",
      stableContext: "Estructura del repo:\nsrc/",
      volatileParts: {
        activePath: "src/app.ts",
        selection: "function criticalSelection() {}",
        activeFile: "line\n".repeat(8_000),
        diagnostics: "",
        gitDiff: "+added\n".repeat(8_000),
        rgOutput: "src/app.ts:1:match\n".repeat(8_000)
      }
    });

    expect(packed.volatileContext).toContain("criticalSelection");
    expect(packed.volatileContext).toContain(TRUNCATION_MARKER);
  });
});
