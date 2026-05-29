import { buildPreviewPlan, ensurePreviewServer, stopPreviewServer } from "./localActions.js";
import type { PreviewToolResult } from "@lemonwoo/agent-runtime";
import { assertWorkspaceDirectory, resolveWithinWorkspace } from "./workspacePath.js";

export async function startPreviewForWorkspace(
  workspace: string,
  input: { command?: string; port?: string; cwd?: string }
): Promise<PreviewToolResult> {
  const cwdRel = (input.cwd ?? ".").trim() || ".";
  const resolved = assertWorkspaceDirectory(workspace, cwdRel);
  if (!resolved.ok) {
    return { ok: false, output: resolved.reason };
  }

  try {
    if (input.command?.trim()) {
      return {
        ok: false,
        warning: "Custom preview command requires explicit user confirmation (not executed)."
      };
    }

    await buildPreviewPlan(resolved.abs);
    const preview = await ensurePreviewServer(resolved.abs);
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

export function stopPreviewForWorkspace(workspace: string, cwd?: string): PreviewToolResult {
  const cwdRel = (cwd ?? ".").trim() || ".";
  const resolved = resolveWithinWorkspace(workspace, cwdRel);
  if (!resolved.ok) {
    return { ok: false, output: resolved.reason };
  }
  const stopped = stopPreviewServer(resolved.abs);
  return {
    ok: stopped,
    output: stopped ? "Preview server stopped." : "No active preview server for this workspace path."
  };
}
