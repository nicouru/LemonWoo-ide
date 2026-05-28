import { resolve } from "node:path";
import { buildPreviewPlan, ensurePreviewServer, stopPreviewServer } from "./localActions.js";
import type { PreviewToolResult } from "@lemonwoo/agent-runtime";

export async function startPreviewForWorkspace(
  workspace: string,
  input: { command?: string; port?: string; cwd?: string }
): Promise<PreviewToolResult> {
  const cwdRel = (input.cwd ?? ".").trim() || ".";
  const target = resolve(workspace, cwdRel);
  if (!target.startsWith(resolve(workspace))) {
    return { ok: false, output: "Rejected preview cwd outside workspace." };
  }

  try {
    if (input.command?.trim()) {
      return {
        ok: false,
        warning: "Custom preview command requires explicit user confirmation (not executed)."
      };
    }

    await buildPreviewPlan(target);
    const preview = await ensurePreviewServer(target);
    const portMatch = preview.url.match(/:(\d+)/);
    return {
      ok: true,
      url: preview.url,
      port: portMatch ? Number(portMatch[1]) : undefined,
      reused: preview.reused,
      output: preview.logs.join("\n")
    };
  } catch (error) {
    return { ok: false, output: String(error) };
  }
}

export function stopPreviewForWorkspace(workspace: string): PreviewToolResult {
  const stopped = stopPreviewServer(workspace);
  return {
    ok: stopped,
    output: stopped ? "Preview server stopped." : "No active preview server for this workspace."
  };
}
