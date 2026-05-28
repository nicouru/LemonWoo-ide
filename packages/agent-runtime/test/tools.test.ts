import { describe, expect, it } from "vitest";
import { executeTool } from "../src/tools.js";
import { DEFAULT_RUNTIME_LIMITS } from "../src/contracts.js";

describe("internal tool execution", () => {
  const limits = DEFAULT_RUNTIME_LIMITS;

  it("rejects unsafe read_file paths", async () => {
    const result = await executeTool(
      { tool: "read_file", args: { path: "../.git/config" } },
      { adapters: {}, limits, touchedFiles: [] }
    );
    expect(result.ok).toBe(false);
  });

  it("rejects absolute paths", async () => {
    const result = await executeTool(
      { tool: "read_file", args: { path: "/etc/passwd" } },
      { adapters: {}, limits, touchedFiles: [] }
    );
    expect(result.ok).toBe(false);
  });

  it("redacts secrets in tool output", async () => {
    const result = await executeTool(
      { tool: "read_file", args: { path: "src/x.ts" } },
      {
        adapters: {
          readFile: async () => "const key = 'sk-secretvalue1234567890';"
        },
        limits,
        touchedFiles: []
      }
    );
    expect(result.ok).toBe(true);
    expect(result.output).toContain("[REDACTED]");
    expect(result.output).not.toContain("sk-secret");
  });

  it("propose_diff does not write to disk", async () => {
    const diff = "```diff\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-a\n+b\n```";
    const touched: string[] = [];
    const result = await executeTool(
      { tool: "propose_diff", args: { diff } },
      { adapters: {}, limits, touchedFiles: touched }
    );
    expect(result.ok).toBe(true);
    expect(touched).toContain("src/a.ts");
  });
});
