import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { isExcludedPath } from "@lemonwoo/agent-runtime";

const MAX_TREE_DEPTH = 4;

/** Lists workspace files with paths relative to `root` (not the recursion dir). */
export function listWorkspaceFiles(root: string, currentDir = root, depth = 0): string[] {
  if (depth > MAX_TREE_DEPTH) return [];
  const out: string[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(currentDir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const abs = join(currentDir, name);
    const rel = relative(root, abs).replace(/\\/g, "/");
    if (!rel || isExcludedPath(rel)) continue;
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      out.push(`${rel}/`);
      out.push(...listWorkspaceFiles(root, abs, depth + 1));
    } else if (st.size < 200_000) {
      out.push(rel);
    }
  }
  return out;
}
