import { existsSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { isSafeRelPath } from "@lemonwoo/agent-runtime";

export interface WorkspacePathResult {
  ok: true;
  abs: string;
  rel: string;
}

export interface WorkspacePathError {
  ok: false;
  reason: string;
}

export function resolveWithinWorkspace(
  workspace: string,
  relPath = "."
): WorkspacePathResult | WorkspacePathError {
  const rel = (relPath ?? ".").trim() || ".";
  if (rel !== "." && !isSafeRelPath(rel)) {
    return { ok: false, reason: "Rejected path (workspace-relative only, no .git or traversal)." };
  }
  const absWorkspace = resolve(workspace);
  const abs = resolve(absWorkspace, rel);
  const relToRoot = relative(absWorkspace, abs);
  if (relToRoot.startsWith("..") || isAbsolute(relToRoot)) {
    return { ok: false, reason: "Rejected path outside workspace." };
  }
  if (abs.split(/[/\\]/).includes(".git")) {
    return { ok: false, reason: "Rejected .git path." };
  }
  return { ok: true, abs, rel: rel === "." ? "." : relToRoot.split(/[/\\]/).join("/") };
}

export function assertWorkspaceDirectory(
  workspace: string,
  relPath = "."
): WorkspacePathResult | WorkspacePathError {
  const resolved = resolveWithinWorkspace(workspace, relPath);
  if (!resolved.ok) return resolved;
  if (!existsSync(resolved.abs)) {
    return { ok: false, reason: "Directory does not exist." };
  }
  return resolved;
}
