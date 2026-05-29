import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startPreviewForWorkspace, stopPreviewForWorkspace } from "../src/previewAdapter.js";
import { stopAllPreviewServers } from "../src/localActions.js";

afterEach(() => {
  stopAllPreviewServers();
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
