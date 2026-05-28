import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, relative } from "node:path";
import { redactSecrets } from "@lemonwoo/deepseek";
import type { TerminalRunInput, TerminalRunResult } from "@lemonwoo/agent-runtime";

const MAX_OUTPUT = 12_000;

function isWithinWorkspace(workspace: string, target: string): boolean {
  const absWorkspace = resolve(workspace);
  const absTarget = resolve(target);
  const rel = relative(absWorkspace, absTarget);
  return rel === "" || (!rel.startsWith("..") && !absTarget.includes(`${resolve(absWorkspace, ".git")}`));
}

export async function runTerminalInWorkspace(
  workspace: string,
  input: TerminalRunInput,
  extraSecrets: string[] = []
): Promise<TerminalRunResult> {
  const command = input.command.trim();
  const cwdRel = (input.cwd ?? ".").trim() || ".";
  const cwd = resolve(workspace, cwdRel);

  if (!isWithinWorkspace(workspace, cwd) || !existsSync(cwd)) {
    return {
      ok: false,
      command,
      cwd: cwdRel,
      output: "Rejected cwd (must stay inside workspace).",
      stdout: "",
      stderr: "",
      requiresConfirmation: false
    };
  }

  const timeoutMs = parseTimeout(input.timeoutMs);
  return await new Promise((resolvePromise) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      env: process.env
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      const msg = redactSecrets(String(err), extraSecrets);
      resolvePromise({
        ok: false,
        command,
        cwd: cwdRel,
        output: msg,
        stdout: truncate(redactSecrets(stdout, extraSecrets)),
        stderr: truncate(redactSecrets(stderr, extraSecrets)),
        exitCode: 1,
        timedOut,
        requiresConfirmation: false
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const outStdout = truncate(redactSecrets(stdout, extraSecrets));
      const outStderr = truncate(redactSecrets(stderr, extraSecrets));
      const combined = [outStdout, outStderr].filter(Boolean).join("\n").trim();
      resolvePromise({
        ok: code === 0 && !timedOut,
        command,
        cwd: cwdRel,
        output: timedOut
          ? `Command timed out after ${timeoutMs}ms.\n${combined}`
          : combined || `(exit ${code ?? "unknown"})`,
        stdout: outStdout,
        stderr: outStderr,
        exitCode: code ?? undefined,
        timedOut,
        requiresConfirmation: false
      });
    });
  });
}

function parseTimeout(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 30_000;
  return Math.min(n, 120_000);
}

function truncate(text: string): string {
  if (text.length <= MAX_OUTPUT) return text;
  return `${text.slice(0, MAX_OUTPUT)}\n...[truncated]`;
}
