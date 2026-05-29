import { spawn } from "node:child_process";
import {
  buildSanitizedTerminalEnv,
  classifyTerminalCommand,
  parseAllowedTerminalCommand,
  type TerminalRunInput,
  type TerminalRunResult
} from "@lemonwoo/agent-runtime";
import { redactSecrets } from "@lemonwoo/deepseek";
import { assertWorkspaceDirectory } from "./workspacePath.js";

const MAX_OUTPUT = 12_000;

export function buildTerminalChildEnv(): NodeJS.ProcessEnv {
  return buildSanitizedTerminalEnv(process.env);
}

export async function runTerminalInWorkspace(
  workspace: string,
  input: TerminalRunInput,
  extraSecrets: string[] = []
): Promise<TerminalRunResult> {
  const command = input.command.trim();
  const cwdRel = (input.cwd ?? ".").trim() || ".";
  const cwdResolved = assertWorkspaceDirectory(workspace, cwdRel);
  if (!cwdResolved.ok) {
    return {
      ok: false,
      command,
      cwd: cwdRel,
      output: cwdResolved.reason,
      stdout: "",
      stderr: "",
      requiresConfirmation: false
    };
  }

  const classification = classifyTerminalCommand(command);
  if (classification.policy === "block") {
    return {
      ok: false,
      command,
      cwd: cwdRel,
      output: classification.reason ?? "Command blocked.",
      stdout: "",
      stderr: "",
      requiresConfirmation: false,
      warning: classification.reason
    };
  }
  if (classification.policy === "confirm") {
    return {
      ok: false,
      command,
      cwd: cwdRel,
      output: classification.reason ?? "Command requires confirmation.",
      stdout: "",
      stderr: "",
      requiresConfirmation: true,
      warning: classification.reason
    };
  }

  const parsed = parseAllowedTerminalCommand(command);
  if (!parsed) {
    return {
      ok: false,
      command,
      cwd: cwdRel,
      output: "Command could not be parsed for safe execution.",
      stdout: "",
      stderr: "",
      requiresConfirmation: true,
      warning: "Command requires confirmation."
    };
  }

  const timeoutMs = parseTimeout(input.timeoutMs);
  const childEnv = buildTerminalChildEnv();

  return await new Promise((resolvePromise) => {
    const child = spawn(parsed.executable, parsed.args, {
      cwd: cwdResolved.abs,
      shell: false,
      env: childEnv
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
