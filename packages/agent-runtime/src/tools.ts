import { evaluateDiffProposal } from "./multiDiff.js";
import { isSafeRelPath } from "./multiDiff.js";
import type { AgentRuntimeAdapters, AgentToolRequest, AgentToolResult, RuntimeLimits } from "./contracts.js";
import { boundOutput, redactToolOutput } from "./redactTool.js";

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
        return fail("propose_diff", proposal.warning ?? "Invalid or empty diff proposal.");
      }
      ctx.touchedFiles.push(...proposal.touchedFiles);
      const summary = [
        `Diff proposal (${proposal.touchedFiles.length} file(s)): ${proposal.touchedFiles.join(", ")}`,
        proposal.warning ?? ""
      ]
        .filter(Boolean)
        .join("\n");
      const bounded = boundOutput(redactToolOutput(summary), limits.maxToolOutputChars);
      return { ok: true, tool: "propose_diff", output: bounded.text, truncated: bounded.truncated };
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

    default:
      return fail("summarize", "Unknown tool.");
  }
}

function fail(tool: AgentToolRequest["tool"], message: string): AgentToolResult {
  return { ok: false, tool, output: message };
}
