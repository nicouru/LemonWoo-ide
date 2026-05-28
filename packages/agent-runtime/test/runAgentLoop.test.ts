import { describe, expect, it } from "vitest";
import { runAgentLoop } from "../src/runAgentLoop.js";
import { runAgentTaskOnce } from "../src/runAgentTask.js";
import type { DeepSeekClient } from "@lemonwoo/deepseek";
import { DeepSeekAbortError } from "@lemonwoo/deepseek";
import { parseToolRequests } from "../src/toolParse.js";

describe("v2 agent loop", () => {
  it("parses lemonwoo_tool blocks", () => {
    const text = [
      'Plan.',
      '<lemonwoo_tool>{"tool":"read_file","args":{"path":"src/a.ts"}}</lemonwoo_tool>',
      "```diff\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-a\n+b\n```"
    ].join("\n");
    const tools = parseToolRequests(text);
    expect(tools).toHaveLength(1);
    expect(tools[0].tool).toBe("read_file");
  });

  it("runs tool step then completes on diff", async () => {
    let calls = 0;
    const mockClient = {
      chatStream: async function* () {
        calls += 1;
        if (calls === 1) {
          yield '<lemonwoo_tool>{"tool":"read_file","args":{"path":"src/a.ts"}}</lemonwoo_tool>';
          return;
        }
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

    const events: string[] = [];
    const result = await (async () => {
      let done;
      for await (const event of runAgentLoop({
        client: mockClient,
        context: { userTask: "fix" },
        adapters: {
          readFile: async () => "content"
        },
        limits: { maxSteps: 6, maxRepairAttempts: 2, maxToolOutputChars: 12000, maxSearchResults: 20, maxFileReadChars: 20000 }
      })) {
        events.push(event.type);
        if (event.type === "done") done = event.result;
      }
      return done!;
    })();

    expect(calls).toBe(2);
    expect(events).toContain("tool");
    expect(result.hasDiff).toBe(true);
  });

  it("stops at max steps with warning", async () => {
    const mockClient = {
      chatStream: async function* () {
        yield "thinking without tools or diff";
      },
      chat: async () => ({
        text: "no diff",
        mode: "think" as const,
        modelLabel: "pro" as const,
        modelId: "deepseek-v4-pro",
        usedAlias: false
      })
    } as unknown as DeepSeekClient;

    let warned = false;
    for await (const event of runAgentLoop({
      client: mockClient,
      context: { userTask: "noop" },
      limits: { maxSteps: 1, maxRepairAttempts: 0, maxToolOutputChars: 1000, maxSearchResults: 5, maxFileReadChars: 1000 }
    })) {
      if (event.type === "warning") warned = true;
    }
    expect(warned).toBe(true);
  });

  it("respects AbortSignal between steps", async () => {
    const controller = new AbortController();
    const mockClient = {
      chatStream: async function* () {
        yield '<lemonwoo_tool>{"tool":"read_file","args":{"path":"src/a.ts"}}</lemonwoo_tool>';
        controller.abort();
      },
      chat: async () => ({
        text: "x",
        mode: "think" as const,
        modelLabel: "pro" as const,
        modelId: "x",
        usedAlias: false
      })
    } as unknown as DeepSeekClient;

    await expect(
      (async () => {
        for await (const _ of runAgentLoop({
          client: mockClient,
          context: { userTask: "x" },
          signal: controller.signal,
          adapters: { readFile: async () => "x" }
        })) {
          // drain
        }
      })()
    ).rejects.toBeInstanceOf(DeepSeekAbortError);
  });

  it("finishes with applicable diff when model only uses propose_diff tool", async () => {
    const diffPayload = "--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-a\n+b\n";
    const toolBlock = `<lemonwoo_tool>${JSON.stringify({
      tool: "propose_diff",
      args: { diff: `\`\`\`diff\n${diffPayload}\n\`\`\`` }
    })}</lemonwoo_tool>`;
    const mockClient = {
      chatStream: async function* () {
        yield toolBlock;
        yield "\nListo.";
      },
      chat: async () => ({
        text: "unused",
        mode: "think" as const,
        modelLabel: "pro" as const,
        modelId: "deepseek-v4-pro",
        usedAlias: false
      })
    } as unknown as DeepSeekClient;

    let done;
    for await (const event of runAgentLoop({
      client: mockClient,
      context: { userTask: "fix file" }
    })) {
      if (event.type === "done") done = event.result;
    }

    expect(done?.hasDiff).toBe(true);
    expect(done?.rawDiff).toContain("--- a/src/a.ts");
    expect(done?.touchedFiles).toContain("src/a.ts");
  });

  it("rejects invalid propose_diff tool without enabling apply", async () => {
    const mockClient = {
      chatStream: async function* () {
        yield '<lemonwoo_tool>{"tool":"propose_diff","args":{"diff":"not a diff"}}</lemonwoo_tool>';
      },
      chat: async () => ({
        text: "x",
        mode: "think" as const,
        modelLabel: "pro" as const,
        modelId: "x",
        usedAlias: false
      })
    } as unknown as DeepSeekClient;

    let done;
    for await (const event of runAgentLoop({
      client: mockClient,
      context: { userTask: "x" },
      limits: { maxSteps: 2, maxRepairAttempts: 0, maxToolOutputChars: 1000, maxSearchResults: 5, maxFileReadChars: 1000 }
    })) {
      if (event.type === "done") done = event.result;
    }
    expect(done?.hasDiff).toBe(false);
    expect(done?.rawDiff).toBeNull();
  });

  it("routes agent prompts with inline to Pro via loop", async () => {
    let task = "";
    const mockClient = {
      chatStream: async function* (args: { task: string }) {
        task = args.task;
        yield "ok";
      },
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
      context: { userTask: "Revisá el componente inline del formulario" }
    });
    expect(task).toBe("agent");
  });
});
