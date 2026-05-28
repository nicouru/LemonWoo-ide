import * as vscode from "vscode";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { spawn } from "node:child_process";
import {
  buildVolatileContext,
  compactRepoTree,
  isExcludedPath,
  shouldInvokeRg
} from "@lemonwoo/agent-runtime";
import type { AgentContextSnapshot } from "@lemonwoo/agent-runtime";

const MAX_READ = 6000;
const MAX_TREE_DEPTH = 4;

function readOptionalFile(path: string, max = MAX_READ): string {
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8").slice(0, max);
}

export function readRules(workspace: string): string {
  const rulesDir = join(workspace, ".lemonwoo", "rules");
  if (!existsSync(rulesDir)) return "";
  const files = readdirSync(rulesDir).filter((f) => f.endsWith(".md"));
  return files.map((f) => readOptionalFile(join(rulesDir, f))).join("\n---\n");
}

export async function readGitDiff(workspace: string, signal?: AbortSignal): Promise<string> {
  return await new Promise((resolve) => {
    const child = spawn("git", ["diff", "--", "."], { cwd: workspace, shell: false });
    let out = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve(out.slice(0, MAX_READ));
    }, 2000);
    const onAbort = () => child.kill("SIGTERM");
    signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", (d) => (out += d.toString()));
    child.on("exit", () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(out.slice(0, MAX_READ));
    });
    child.on("error", () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve("");
    });
  });
}

function listWorkspaceFiles(workspace: string, depth = 0): string[] {
  if (depth > MAX_TREE_DEPTH) return [];
  const out: string[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(workspace);
  } catch {
    return out;
  }
  for (const name of entries) {
    const abs = join(workspace, name);
    const rel = relative(workspace, abs).replace(/\\/g, "/");
    if (!rel || isExcludedPath(rel)) continue;
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      out.push(`${rel}/`);
      out.push(...listWorkspaceFiles(abs, depth + 1));
    } else if (st.size < 200_000) {
      out.push(rel);
    }
  }
  return out;
}

function deriveRgQuery(prompt: string): string | null {
  const quoted = prompt.match(/["'`]([^"'`]{2,80})["'`]/);
  if (quoted?.[1]) return quoted[1];
  const words = prompt.split(/\s+/).filter((w) => w.length > 3);
  return words.length ? words[words.length - 1]! : null;
}

export async function runRg(workspace: string, query: string, signal?: AbortSignal): Promise<string> {
  return await new Promise((resolve) => {
    const child = spawn("rg", ["-n", "--max-count", "40", query, "."], {
      cwd: workspace,
      shell: false
    });
    let out = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve(out.slice(0, MAX_READ));
    }, 5000);
    const onAbort = () => child.kill("SIGTERM");
    signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (out += d.toString()));
    child.on("exit", () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(out.slice(0, MAX_READ));
    });
    child.on("error", () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve("");
    });
  });
}

export async function gatherAgentContext(
  workspace: string,
  userTask: string,
  signal?: AbortSignal
): Promise<AgentContextSnapshot> {
  const editor = vscode.window.activeTextEditor;
  const agentsMd = readOptionalFile(join(workspace, "AGENTS.md"));
  const repoRules = readRules(workspace);
  const gitDiff = await readGitDiff(workspace, signal);

  const filePath = editor?.document.uri.fsPath ?? "";
  const relActive = filePath ? relative(workspace, filePath).replace(/\\/g, "/") : "";
  const selection = editor?.document.getText(editor.selection) ?? "";
  const openFile = editor?.document.getText().slice(0, 4000) ?? "";
  const diagnostics = editor
    ? vscode.languages
        .getDiagnostics(editor.document.uri)
        .map((d) => `${d.severity}:${d.message}`)
        .join("\n")
    : "";

  let rgOut = "";
  if (shouldInvokeRg(userTask)) {
    const q = deriveRgQuery(userTask);
    if (q) rgOut = await runRg(workspace, q, signal);
  }

  const tree = compactRepoTree(listWorkspaceFiles(workspace));

  const volatileContext = buildVolatileContext({
    "Archivo activo": relActive,
    Selección: selection,
    "Archivo (truncado)": openFile,
    Diagnostics: diagnostics,
    "Git diff": gitDiff,
    "Búsqueda rg": rgOut
  });

  return {
    userTask,
    agentsMd,
    repoRules,
    stableContext: `Estructura del repo:\n${tree}`,
    volatileContext
  };
}
