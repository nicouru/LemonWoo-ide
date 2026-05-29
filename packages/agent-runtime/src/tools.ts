import { evaluateDiffProposal } from "./multiDiff.js";
import { isSafeRelPath } from "./multiDiff.js";
import type { AgentRuntimeAdapters, AgentToolRequest, AgentToolResult, RuntimeLimits } from "./contracts.js";
import { boundOutput, redactToolOutput } from "./redactTool.js";
import { classifyTerminalCommand, parseTerminalTimeoutMs } from "./terminalSafety.js";

export interface ToolExecutionContext {
  adapters: AgentRuntimeAdapters;
  limits: RuntimeLimits;
  volatileSearchBlob?: string;
  touchedFiles: string[];
}

export async function executeTool(
  request: AgentToolRequest,
  ctx: ToolExecutionContext
): Promise<AgentToolResult> {
  const { limits, adapters } = ctx;

  switch (request.tool) {
    case "read_file": {
      const relPath = (request.args.path ?? "").trim();
      if (!isSafeRelPath(relPath)) {
        return fail("read_file", "Rejected path (must be workspace-relative, not .git or traversal).");
      }
      const raw = adapters.readFile ? await adapters.readFile(relPath) : null;
      if (raw === null) {
        return fail("read_file", `Could not read: ${relPath}`);
      }
      const bounded = boundOutput(redactToolOutput(raw), limits.maxFileReadChars);
      return {
        ok: true,
        tool: "read_file",
        output: bounded.text,
        truncated: bounded.truncated
      };
    }

    case "search": {
      const query = (request.args.query ?? "").trim();
      if (!query) return fail("search", "Missing query.");
      let lines: string[] = [];
      if (adapters.searchWorkspace) {
        lines = await adapters.searchWorkspace(query);
      } else if (ctx.volatileSearchBlob) {
        const q = query.toLowerCase();
        lines = ctx.volatileSearchBlob
          .split("\n")
          .filter((line) => line.toLowerCase().includes(q))
          .slice(0, limits.maxSearchResults);
      }
      const joined = redactToolOutput(lines.join("\n") || "No matches.");
      const bounded = boundOutput(joined, limits.maxToolOutputChars);
      return {
        ok: true,
        tool: "search",
        output: bounded.text,
        truncated: bounded.truncated
      };
    }

    case "propose_diff": {
      const diffText = request.args.diff ?? request.args.text ?? "";
      const proposal = evaluateDiffProposal(diffText);
      if (!proposal.hasDiff) {
        return {
          ...fail("propose_diff", proposal.warning ?? "Invalid or empty diff proposal."),
          hasDiff: false,
          rawDiff: null,
          touchedFiles: [],
          warning: proposal.warning
        };
      }
      for (const f of proposal.touchedFiles) {
        if (!ctx.touchedFiles.includes(f)) ctx.touchedFiles.push(f);
      }
      const summary = [
        `Diff proposal (${proposal.touchedFiles.length} file(s)): ${proposal.touchedFiles.join(", ")}`,
        proposal.warning ?? ""
      ]
        .filter(Boolean)
        .join("\n");
      const bounded = boundOutput(redactToolOutput(summary), limits.maxToolOutputChars);
      return {
        ok: true,
        tool: "propose_diff",
        output: bounded.text,
        truncated: bounded.truncated,
        hasDiff: true,
        rawDiff: proposal.rawDiff,
        touchedFiles: proposal.touchedFiles,
        warning: proposal.warning
      };
    }

    case "test_gate": {
      const files = (request.args.files ?? "")
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean);
      const changed = files.length ? files : ctx.touchedFiles;
      if (!adapters.runTestGate) {
        return fail("test_gate", "TestGate not available (extension must provide adapter).");
      }
      const started = Date.now();
      const gate = await adapters.runTestGate(changed);
      const durationMs = Date.now() - started;
      const header = `TestGate ${gate.ok ? "PASS" : "FAIL"} (${durationMs}ms)`;
      const cmds = gate.commands?.length ? `Commands: ${gate.commands.join(", ")}` : "";
      const body = redactToolOutput(gate.output);
      const bounded = boundOutput(`${header}\n${cmds}\n${body}`.trim(), limits.maxToolOutputChars);
      return {
        ok: gate.ok,
        tool: "test_gate",
        output: bounded.text,
        truncated: bounded.truncated || gate.truncated
      };
    }

    case "summarize": {
      const text = request.args.text ?? request.args.summary ?? "";
      const bounded = boundOutput(redactToolOutput(text), limits.maxToolOutputChars);
      return { ok: true, tool: "summarize", output: bounded.text, truncated: bounded.truncated };
    }

    case "run_terminal": {
      const command = (request.args.command ?? "").trim();
      if (!command) return fail("run_terminal", "Missing command.");
      const classification = classifyTerminalCommand(command);
      const cwd = (request.args.cwd ?? ".").trim() || ".";
      if (!isSafeRelPath(cwd) && cwd !== ".") {
        return fail("run_terminal", "Rejected cwd (workspace-relative only).");
      }
      if (classification.policy === "block") {
        return {
          ...fail("run_terminal", classification.reason ?? "Command blocked."),
          warning: classification.reason
        };
      }
      if (classification.policy === "confirm") {
        return {
          ok: false,
          tool: "run_terminal",
          output: classification.reason ?? "Command requires confirmation.",
          requiresConfirmation: true,
          warning: classification.reason
        };
      }
      if (!adapters.runTerminal) {
        return fail("run_terminal", "Terminal adapter not available (extension must provide runTerminal).");
      }
      const result = await adapters.runTerminal({
        command,
        cwd,
        timeoutMs: String(parseTerminalTimeoutMs(request.args.timeoutMs)),
        reason: request.args.reason
      });
      const bounded = boundOutput(redactToolOutput(result.output), limits.maxToolOutputChars);
      return {
        ok: result.ok,
        tool: "run_terminal",
        output: bounded.text,
        truncated: bounded.truncated,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        requiresConfirmation: result.requiresConfirmation,
        warning: result.warning
      };
    }

    case "verify_files_exist": {
      const paths = (request.args.paths ?? "")
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      if (!paths.length) return fail("verify_files_exist", "Missing paths.");
      for (const p of paths) {
        if (!isSafeRelPath(p)) {
          return fail("verify_files_exist", `Rejected path: ${p}`);
        }
      }
      if (!adapters.verifyFilesExist) {
        return fail("verify_files_exist", "verifyFilesExist adapter not available.");
      }
      const result = await adapters.verifyFilesExist(paths);
      const summary = result.ok
        ? `All ${result.present.length} file(s) present: ${result.present.join(", ")}`
        : `Missing: ${result.missing.join(", ")}; present: ${result.present.join(", ") || "(none)"}`;
      const bounded = boundOutput(redactToolOutput(summary), limits.maxToolOutputChars);
      return {
        ok: result.ok,
        tool: "verify_files_exist",
        output: bounded.text,
        truncated: bounded.truncated,
        present: result.present,
        missing: result.missing
      };
    }

    case "start_preview_server": {
      if (!adapters.startPreviewServer) {
        return fail("start_preview_server", "Preview adapter not available.");
      }
      const result = await adapters.startPreviewServer({
        command: request.args.command,
        port: request.args.port,
        cwd: request.args.cwd,
        reason: request.args.reason
      });
      const lines = [
        result.ok ? "Preview server ready." : "Preview server failed.",
        result.url ? `URL: ${result.url}` : "",
        result.reused ? "(reused existing server)" : "",
        result.output ?? "",
        result.warning ?? ""
      ]
        .filter(Boolean)
        .join("\n");
      const bounded = boundOutput(redactToolOutput(lines), limits.maxToolOutputChars);
      return {
        ok: result.ok,
        tool: "start_preview_server",
        output: bounded.text,
        truncated: bounded.truncated,
        url: result.url,
        warning: result.warning
      };
    }

    case "stop_preview_server": {
      if (!adapters.stopPreviewServer) {
        return fail("stop_preview_server", "Preview adapter not available.");
      }
      const result = await adapters.stopPreviewServer({
        cwd: request.args.cwd
      });
      const bounded = boundOutput(redactToolOutput(result.output ?? ""), limits.maxToolOutputChars);
      return {
        ok: result.ok,
        tool: "stop_preview_server",
        output: bounded.text,
        truncated: bounded.truncated
      };
    }

    default:
      return fail("summarize", "Unknown tool.");
  }
}

function fail(tool: AgentToolRequest["tool"], message: string): AgentToolResult {
  return { ok: false, tool, output: message };
}
