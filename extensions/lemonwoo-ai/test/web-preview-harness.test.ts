import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createConnection } from "node:net";
import { verifyFilesInWorkspace } from "../src/fileVerify.js";
import { startPreviewForWorkspace, stopPreviewForWorkspace } from "../src/previewAdapter.js";
import { stopAllPreviewServers } from "../src/localActions.js";
import { executeTool } from "@lemonwoo/agent-runtime";

afterEach(() => {
  stopAllPreviewServers();
});

async function isPortUp(port: number): Promise<boolean> {
  return await new Promise((resolve) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

describe("web preview harness gauntlet", () => {
  it("uses real verify/preview adapters end-to-end", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "lemonwoo-web-harness-"));
    writeFileSync(join(workspace, "index.html"), "<!doctype html><html></html>");
    writeFileSync(join(workspace, "style.css"), "body{}");
    writeFileSync(join(workspace, "script.js"), "console.log(1)");

    const verify = verifyFilesInWorkspace(workspace, ["index.html", "style.css", "script.js"]);
    expect(verify.ok).toBe(true);

    const toolVerify = await executeTool(
      { tool: "verify_files_exist", args: { paths: "index.html,style.css,script.js" } },
      {
        adapters: {
          verifyFilesExist: async (paths) => verifyFilesInWorkspace(workspace, paths)
        },
        limits: {
          maxSteps: 6,
          maxRepairAttempts: 2,
          maxToolOutputChars: 12_000,
          maxSearchResults: 20,
          maxFileReadChars: 20_000
        },
        touchedFiles: []
      }
    );
    expect(toolVerify.ok).toBe(true);

    const start = await startPreviewForWorkspace(workspace, {});
    expect(start.ok).toBe(true);
    expect(start.url).toMatch(/localhost:\d+/);

    const port = Number(start.url?.match(/:(\d+)/)?.[1]);
    expect(await isPortUp(port)).toBe(true);

    const stop = stopPreviewForWorkspace(workspace);
    expect(stop.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 800));
    expect(await isPortUp(port)).toBe(false);

    rmSync(workspace, { recursive: true, force: true });
  }, 40_000);
});

describe("startup safety", () => {
  it("extension startup does not statically import opencode harness", () => {
    const ext = readFileSync(join(process.cwd(), "src/extension.ts"), "utf8");
    const harness = readFileSync(join(process.cwd(), "src/harnessDiagnostic.ts"), "utf8");
    expect(ext).not.toMatch(/from\s+["']@lemonwoo\/agent-runtime\/opencode["']/);
    expect(harness).not.toMatch(/from\s+["']@lemonwoo\/agent-runtime\/opencode["']/);
    expect(harness).toContain("await import(\"@lemonwoo/agent-runtime/opencode\")");
  });
});
