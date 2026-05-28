import { execa } from "execa";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface TestGateDecision {
  packageManager: "pnpm" | "npm" | "yarn";
  commands: string[];
}

const SECRET_PATTERNS = [/sk-[A-Za-z0-9_-]{8,}/g, /ghp_[A-Za-z0-9]{16,}/g, /github_pat_[A-Za-z0-9_]{16,}/g];

const DANGEROUS_SCRIPT =
  /(npm\s+install|pnpm\s+install|yarn\s+install|npx\s+|sudo\s+|rm\s+-rf?\s|curl\s+\S+\s*\|\s*sh|git\s+push)/i;

function assertSafeScriptBody(body: string, scriptName: string): void {
  if (DANGEROUS_SCRIPT.test(body)) {
    throw new Error(`Script "${scriptName}" blocked by TestGate (destructive pattern).`);
  }
}

export function redactOutput(text: string): string {
  return SECRET_PATTERNS.reduce((acc, pattern) => acc.replace(pattern, "[REDACTED]"), text);
}

export function decideTestGate(repoPath: string, changedFiles: string[]): TestGateDecision {
  const pkgPath = join(repoPath, "package.json");
  const pkg = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, "utf8")) : {};
  const scripts = pkg.scripts ?? {};
  const usesTs = changedFiles.some((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
  const touchesUi = changedFiles.some((f) => /(app|pages|components)/.test(f));
  const commands: string[] = [];

  if (usesTs && scripts.typecheck) commands.push("typecheck");
  if (usesTs && scripts.lint) commands.push("lint");
  if (touchesUi && scripts["test:e2e"]) commands.push("test:e2e");
  if (scripts.test) commands.push("test");

  for (const name of commands) {
    const body = scripts[name];
    if (typeof body === "string") {
      assertSafeScriptBody(body, name);
    }
  }

  const manager: TestGateDecision["packageManager"] = existsSync(join(repoPath, "pnpm-lock.yaml"))
    ? "pnpm"
    : existsSync(join(repoPath, "yarn.lock"))
      ? "yarn"
      : "npm";

  return { packageManager: manager, commands };
}

export async function runTestGate(
  repoPath: string,
  changedFiles: string[],
  signal?: AbortSignal
): Promise<{ ok: boolean; output: string }> {
  const decision = decideTestGate(repoPath, changedFiles);
  if (decision.commands.length === 0) {
    return {
      ok: false,
      output: "TestGate: no matching scripts in package.json for changed files (typecheck/lint/test)."
    };
  }
  let output = "";
  for (const cmd of decision.commands) {
    try {
      const child = execa(decision.packageManager, ["run", cmd], {
        cwd: repoPath,
        all: true,
        timeout: 120_000,
        reject: true,
        signal
      });
      const res = await child;
      output += `\n$ ${decision.packageManager} run ${cmd}\n${res.all ?? ""}\n`;
    } catch (error: any) {
      output += `\n$ ${decision.packageManager} run ${cmd}\n${error?.all ?? String(error)}\n`;
      return { ok: false, output: redactOutput(output) };
    }
  }
  return { ok: true, output: redactOutput(output) };
}
