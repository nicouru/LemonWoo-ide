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
      singleShot: true,
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
      singleShot: true,
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
      singleShot: true,
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
      singleShot: true,
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
      singleShot: true,
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
      singleShot: true,
      client: makeClient(),
      context: { userTask: "tab", taskKind: "tab" }
    });
    const inline = await runAgentTaskOnce({
      singleShot: true,
      client: makeClient(),
      context: { userTask: "inline", taskKind: "inline-edit" }
    });
    const small = await runAgentTaskOnce({
      singleShot: true,
      client: makeClient(),
      context: { userTask: "small", taskKind: "small-write" }
    });
    const agent = await runAgentTaskOnce({
      singleShot: true,
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
      singleShot: true,
      client: mockClient,
      context: { userTask: "x" }
    });
    expect(result.message).toContain("buffered response");
  });

  it("routes normal agent prompts mentioning inline to Pro (agent task)", async () => {
    let task = "";
    const mockClient = {
      chatStream: async function* (args: { task: string }) {
        task = args.task;
        yield "sin diff";
      },
      chat: async (args: { task: string }) => {
        task = args.task;
        return {
          text: "sin diff",
          mode: "think" as const,
          modelLabel: "pro" as const,
          modelId: "deepseek-v4-pro",
          usedAlias: false
        };
      }
    } as unknown as DeepSeekClient;

    await runAgentTaskOnce({
      singleShot: true,
      client: mockClient,
      context: { userTask: "Revisá el componente inline del formulario y proponé un patch mínimo." }
    });
    expect(task).toBe("agent");
  });

  it("escalates write-routed small-write to Pro when multiple files are touched", async () => {
    const calls: string[] = [];
    const multiFileDiff =
      "```diff\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-a\n+a\n--- a/src/b.ts\n+++ b/src/b.ts\n@@ -1 +1 @@\n-c\n+d\n```";
    const mockClient = {
      chatStream: async function* (args: { task: string }) {
        calls.push(args.task);
        yield args.task === "small-write" ? multiFileDiff : "ok";
      },
      chat: async () => ({
        text: "unused",
        mode: "think" as const,
        modelLabel: "pro" as const,
        modelId: "deepseek-v4-pro",
        usedAlias: false
      })
    } as unknown as DeepSeekClient;

    await runAgentTaskOnce({
      singleShot: true,
      client: mockClient,
      context: { userTask: "small patch", taskKind: "small-write" }
    });
    expect(calls).toEqual(["small-write", "agent"]);
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
        singleShot: true,
        client: mockClient,
        context: { userTask: "x" }
      })
    ).rejects.toBeInstanceOf(DeepSeekAbortError);
  });
});
