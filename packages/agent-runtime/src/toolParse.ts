import type { AgentToolName, AgentToolRequest } from "./contracts.js";

const TOOL_BLOCK_RE = /<lemonwoo_tool>\s*([\s\S]*?)\s*<\/lemonwoo_tool>/gi;

const ALLOWED_TOOLS = new Set<AgentToolName>([
  "read_file",
  "search",
  "propose_diff",
  "test_gate",
  "summarize",
  "run_terminal",
  "verify_files_exist",
  "start_preview_server",
  "stop_preview_server"
]);

export function parseToolRequests(modelText: string): AgentToolRequest[] {
  const requests: AgentToolRequest[] = [];
  for (const match of modelText.matchAll(TOOL_BLOCK_RE)) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as { tool?: string; args?: Record<string, string> };
      if (!parsed.tool || !ALLOWED_TOOLS.has(parsed.tool as AgentToolName)) continue;
      requests.push({
        tool: parsed.tool as AgentToolName,
        args: parsed.args ?? {}
      });
    } catch {
      // ignore malformed tool JSON
    }
  }
  return requests;
}

export function serializeToolRequests(requests: AgentToolRequest[]): string {
  return requests
    .map((r) => `<lemonwoo_tool>${JSON.stringify(r)}</lemonwoo_tool>`)
    .join("\n");
}
