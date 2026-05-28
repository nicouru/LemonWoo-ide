import { describe, expect, it } from "vitest";
import { runAgentTaskOnce } from "../src/runAgentTask.js";
import type { DeepSeekClient } from "@lemonwoo/deepseek";

describe("runAgentTask fallback", () => {
  it("executes one cycle with mocked DeepSeek client", async () => {
    const mockClient = {
      chat: async () => ({
        text: "Arreglé el bug.\n```diff\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new\n```",
        mode: "think" as const,
        modelLabel: "pro" as const,
        modelId: "deepseek-v4-pro",
        usedAlias: false
      })
    } as unknown as DeepSeekClient;

    const result = await runAgentTaskOnce({
      client: mockClient,
      context: {
        userTask: "arreglá el test",
        agentsMd: "# Agents",
        repoRules: "# Rules"
      }
    });

    expect(result.hasDiff).toBe(true);
    expect(result.mode).toBe("pro");
    expect(result.message).toContain("Propuesta");
    expect(result.touchedFiles).toContain("src/a.ts");
  });

  it("uses verify task for fix loop", async () => {
    let task = "";
    const mockClient = {
      chat: async (args: { task: string }) => {
        task = args.task;
        return {
          text: "ok",
          mode: "think" as const,
          modelLabel: "pro" as const,
          modelId: "deepseek-v4-pro",
          usedAlias: false
        };
      }
    } as unknown as DeepSeekClient;

    await runAgentTaskOnce({
      client: mockClient,
      context: { userTask: "fix tests" },
      fixTestOutput: "FAIL expected 2 got 1"
    });
    expect(task).toBe("verify");
  });
});
