import { describe, expect, it } from "vitest";
import { runAgentTaskOnce } from "../src/runAgentTask.js";
import { runAgentTask } from "../src/runAgentTask.js";
import type { DeepSeekClient } from "@lemonwoo/deepseek";
import { DeepSeekAbortError } from "@lemonwoo/deepseek";

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

  it("streams deltas before final result", async () => {
    const mockClient = {
      chatStream: async function* () {
        yield "hola";
        yield " mundo";
      },
      chat: async () => ({
        text: "unused",
        mode: "think" as const,
        modelLabel: "pro" as const,
        modelId: "deepseek-v4-pro",
        usedAlias: false
      })
    } as unknown as DeepSeekClient;

    const deltas: string[] = [];
    let done = false;
    for await (const event of runAgentTask({
      client: mockClient,
      context: { userTask: "saluda" }
    })) {
      if (event.type === "delta") deltas.push(event.text);
      if (event.type === "done") done = true;
    }
    expect(deltas.join("")).toBe("hola mundo");
    expect(done).toBe(true);
  });

  it("does not accept multiple diff blocks", async () => {
    const mockClient = {
      chatStream: async function* () {
        yield [
          "```diff",
          "--- a/src/a.ts",
          "+++ b/src/a.ts",
          "@@ -1 +1 @@",
          "-a",
          "+b",
          "```",
          "text",
          "```diff",
          "--- a/src/b.ts",
          "+++ b/src/b.ts",
          "@@ -1 +1 @@",
          "-c",
          "+d",
          "```"
        ].join("\n");
      },
      chat: async () => ({
        text: "unused",
        mode: "think" as const,
        modelLabel: "pro" as const,
        modelId: "deepseek-v4-pro",
        usedAlias: false
      })
    } as unknown as DeepSeekClient;
    const result = await runAgentTaskOnce({
      client: mockClient,
      context: { userTask: "multi diff" }
    });
    expect(result.hasDiff).toBe(false);
    expect(result.rawDiff).toBeNull();
    expect(result.touchedFiles).toEqual([]);
    expect(result.message).toContain("múltiples bloques diff");
  });

  it("keeps single diff proposal applyable", async () => {
    const mockClient = {
      chatStream: async function* () {
        yield "```diff\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-a\n+b\n```";
      },
      chat: async () => ({
        text: "unused",
        mode: "think" as const,
        modelLabel: "pro" as const,
        modelId: "deepseek-v4-pro",
        usedAlias: false
      })
    } as unknown as DeepSeekClient;
    const result = await runAgentTaskOnce({
      client: mockClient,
      context: { userTask: "single diff" }
    });
    expect(result.hasDiff).toBe(true);
    expect(result.rawDiff).toContain("--- a/src/a.ts");
  });

  it("reports flash mode for tab/inline-edit/small-write in streaming path", async () => {
    const makeClient = () =>
      ({
        chatStream: async function* () {
          yield "texto";
        },
        chat: async () => ({
          text: "unused",
          mode: "write" as const,
          modelLabel: "flash" as const,
          modelId: "deepseek-v4-flash",
          usedAlias: false
        })
      }) as unknown as DeepSeekClient;

    const tab = await runAgentTaskOnce({
      client: makeClient(),
      context: { userTask: "tab", taskKind: "tab" }
    });
    const inline = await runAgentTaskOnce({
      client: makeClient(),
      context: { userTask: "inline", taskKind: "inline-edit" }
    });
    const small = await runAgentTaskOnce({
      client: makeClient(),
      context: { userTask: "small", taskKind: "small-write" }
    });
    const agent = await runAgentTaskOnce({
      client: makeClient(),
      context: { userTask: "agent", taskKind: "agent" }
    });

    expect(tab.mode).toBe("flash");
    expect(inline.mode).toBe("flash");
    expect(small.mode).toBe("flash");
    expect(agent.mode).toBe("pro");
  });

  it("falls back to buffered chat when stream fails", async () => {
    const mockClient = {
      chatStream: async function* () {
        throw new Error("stream unavailable");
      },
      chat: async () => ({
        text: "buffered response",
        mode: "think" as const,
        modelLabel: "pro" as const,
        modelId: "deepseek-v4-pro",
        usedAlias: false
      })
    } as unknown as DeepSeekClient;
    const result = await runAgentTaskOnce({
      client: mockClient,
      context: { userTask: "x" }
    });
    expect(result.message).toContain("buffered response");
  });

  it("propagates abort errors (no fallback)", async () => {
    const mockClient = {
      chatStream: async function* () {
        throw new DeepSeekAbortError("aborted");
      },
      chat: async () => ({
        text: "should not happen",
        mode: "think" as const,
        modelLabel: "pro" as const,
        modelId: "deepseek-v4-pro",
        usedAlias: false
      })
    } as unknown as DeepSeekClient;

    await expect(
      runAgentTaskOnce({
        client: mockClient,
        context: { userTask: "x" }
      })
    ).rejects.toBeInstanceOf(DeepSeekAbortError);
  });
});
