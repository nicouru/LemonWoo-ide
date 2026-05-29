import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { verifyFilesInWorkspace } from "../src/fileVerify.js";
import { classifyTerminalCommand } from "@lemonwoo/agent-runtime";

describe("fileVerify", () => {
  it("reports present and missing files", () => {
    const root = mkdtempSync(join(tmpdir(), "lemonwoo-verify-"));
    writeFileSync(join(root, "index.html"), "<html></html>");
    const result = verifyFilesInWorkspace(root, ["index.html", "missing.css"]);
    expect(result.present).toEqual(["index.html"]);
    expect(result.missing).toEqual(["missing.css"]);
    expect(result.ok).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects traversal paths", () => {
    const root = mkdtempSync(join(tmpdir(), "lemonwoo-verify-"));
    const result = verifyFilesInWorkspace(root, ["../outside"]);
    expect(result.ok).toBe(false);
    expect(result.missing[0]).toMatch(/rejected/i);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("harness wiring", () => {
  it("extension registers harness diagnostic command", () => {
    const pkg = readFileSync(join(process.cwd(), "package.json"), "utf8");
    expect(pkg).toContain("lemonwoo.runHarnessDiagnostic");
  });

  it("extension buildAgentAdapters wires capability adapters", () => {
    const src = readFileSync(join(process.cwd(), "src/extension.ts"), "utf8");
    expect(src).toContain("runTerminal:");
    expect(src).toContain("verifyFilesExist:");
    expect(src).toContain("startPreviewServer:");
    expect(src).toContain("stopPreviewServer:");
  });

  it("terminal safety blocks rm -rf", () => {
    expect(classifyTerminalCommand("rm -rf dist").policy).toBe("block");
  });
});
