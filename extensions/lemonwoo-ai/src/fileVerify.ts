import { existsSync } from "node:fs";
import { join } from "node:path";
import { isSafeRelPath } from "@lemonwoo/agent-runtime";
import type { VerifyFilesResult } from "@lemonwoo/agent-runtime";

export function verifyFilesInWorkspace(workspace: string, paths: string[]): VerifyFilesResult {
  const present: string[] = [];
  const missing: string[] = [];

  for (const raw of paths) {
    const rel = raw.trim();
    if (!rel) continue;
    if (!isSafeRelPath(rel)) {
      missing.push(`${rel} (rejected path)`);
      continue;
    }
    if (existsSync(join(workspace, rel))) present.push(rel);
    else missing.push(rel);
  }

  return { ok: missing.length === 0, present, missing };
}
