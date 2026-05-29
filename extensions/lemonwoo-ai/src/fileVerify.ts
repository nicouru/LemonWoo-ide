import { isSafeRelPath } from "@lemonwoo/agent-runtime";
import type { VerifyFilesResult } from "@lemonwoo/agent-runtime";
import { resolveWithinWorkspace } from "./workspacePath.js";
import { existsSync } from "node:fs";

export function verifyFilesInWorkspace(workspace: string, paths: string[]): VerifyFilesResult {
  const present: string[] = [];
  const missing: string[] = [];

  for (const raw of paths) {
    const rel = raw.trim();
    if (!rel) continue;
    const resolved = resolveWithinWorkspace(workspace, rel);
    if (!resolved.ok) {
      missing.push(`${rel} (rejected path)`);
      continue;
    }
    if (existsSync(resolved.abs)) present.push(rel);
    else missing.push(rel);
  }

  return { ok: missing.length === 0, present, missing };
}
