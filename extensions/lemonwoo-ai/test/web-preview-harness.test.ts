import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createConnection } from "node:net";
import { get } from "node:http";
import { verifyFilesInWorkspace } from "../src/fileVerify.js";
import { startPreviewForWorkspace, stopPreviewForWorkspace } from "../src/previewAdapter.js";
import {
  buildPreviewPlan,
  hasServableProject,
  shouldUsePreviewFastPath,
  stopAllPreviewServers
} from "../src/localActions.js";
import { executeTool, planMultiFileApply } from "@lemonwoo/agent-runtime";

/** Deterministic multi-file diff: scaffold index.html, style.css, script.js in an empty workspace. */
const WEB_SCAFFOLD_DIFF = [
  "```diff",
  "--- /dev/null",
  "+++ b/index.html",
  "@@ -0,0 +1,7 @@",
  "+<!doctype html>",
  "+<html lang=\"en\">",
  "+<head><link rel=\"stylesheet\" href=\"style.css\"></head>",
  "+<body><h1>LemonWoo</h1><script src=\"script.js\"></script></body>",
  "+</html>",
  "--- /dev/null",
  "+++ b/style.css",
  "@@ -0,0 +1,3 @@",
  "+body {",
  "+  font-family: system-ui, sans-serif;",
  "+}",
  "--- /dev/null",
  "+++ b/script.js",
  "@@ -0,0 +1,1 @@",
  "+console.log(\"lemonwoo preview gauntlet\");",
  "```"
].join("\n");

const RUNTIME_LIMITS = {
  maxSteps: 6,
  maxRepairAttempts: 2,
  maxToolOutputChars: 12_000,
  maxSearchResults: 20,
  maxFileReadChars: 20_000
};

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

async function httpStatus(url: string): Promise<number> {
  return await new Promise((resolve, reject) => {
    get(url, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    }).on("error", reject);
  });
}

function applyPatchesInWorkspace(
  workspace: string,
  rawDiff: string
): string[] {
  const plan = planMultiFileApply(rawDiff, () => null);
  if (!plan.ok) {
    throw new Error(plan.error ?? "apply plan failed");
  }
  const written: string[] = [];
  for (const patch of plan.patches) {
    if (!patch.ok || patch.content === undefined) {
      throw new Error(patch.error ?? `patch failed for ${patch.relPath}`);
    }
    writeFileSync(join(workspace, patch.relPath), patch.content);
    written.push(patch.relPath);
  }
  return written;
}

describe("preview dogfood gauntlet (deterministic, no-key)", () => {
  it("create → apply → verify → preview → stop without preview-before-apply", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "lemonwoo-preview-dogfood-"));

    try {
      expect(hasServableProject(workspace)).toBe(false);
      await expect(buildPreviewPlan(workspace)).rejects.toThrow(/proyecto servible/i);

      expect(shouldUsePreviewFastPath("creá una web", workspace)).toBe(false);
      expect(shouldUsePreviewFastPath("create a web page", workspace)).toBe(false);
      expect(shouldUsePreviewFastPath("levantá servidor local", workspace)).toBe(false);

      const proposal = await executeTool(
        { tool: "propose_diff", args: { diff: WEB_SCAFFOLD_DIFF } },
        { adapters: {}, limits: RUNTIME_LIMITS, touchedFiles: [] }
      );
      expect(proposal.ok).toBe(true);
      expect(proposal.hasDiff).toBe(true);
      expect(proposal.rawDiff).toBeTruthy();
      expect(proposal.touchedFiles?.sort()).toEqual(["index.html", "script.js", "style.css"]);

      const preApplyPlan = planMultiFileApply(proposal.rawDiff!, () => null);
      expect(preApplyPlan.ok).toBe(true);
      expect(preApplyPlan.patches.map((p) => p.relPath).sort()).toEqual([
        "index.html",
        "script.js",
        "style.css"
      ]);

      const written = applyPatchesInWorkspace(workspace, proposal.rawDiff!);
      expect(written.sort()).toEqual(["index.html", "script.js", "style.css"]);
      expect(existsSync(join(workspace, "index.html"))).toBe(true);

      const diskVerify = verifyFilesInWorkspace(workspace, [
        "index.html",
        "style.css",
        "script.js"
      ]);
      expect(diskVerify.ok).toBe(true);

      const toolVerify = await executeTool(
        { tool: "verify_files_exist", args: { paths: "index.html,style.css,script.js" } },
        {
          adapters: {
            verifyFilesExist: async (paths) => verifyFilesInWorkspace(workspace, paths)
          },
          limits: RUNTIME_LIMITS,
          touchedFiles: []
        }
      );
      expect(toolVerify.ok).toBe(true);

      expect(hasServableProject(workspace)).toBe(true);
      expect(shouldUsePreviewFastPath("creá una web", workspace)).toBe(false);
      expect(shouldUsePreviewFastPath("levantá servidor local", workspace)).toBe(true);

      const start = await startPreviewForWorkspace(workspace, {});
      expect(start.ok).toBe(true);
      expect(start.url).toMatch(/localhost:\d+/);

      const port = Number(start.url?.match(/:(\d+)/)?.[1]);
      expect(await isPortUp(port)).toBe(true);
      expect(await httpStatus(start.url!)).toBe(200);

      const stop = stopPreviewForWorkspace(workspace);
      expect(stop.ok).toBe(true);
      await new Promise((r) => setTimeout(r, 800));
      expect(await isPortUp(port)).toBe(false);
    } finally {
      stopAllPreviewServers();
      rmSync(workspace, { recursive: true, force: true });
    }
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
