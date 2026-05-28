/**
 * LemonWoo agent runtime entrypoint.
 * v2 default: bounded multi-step loop via `runAgentLoop` (local fallback harness).
 * External harness evaluation lives in `opencodeSpike.ts` only; not wired here.
 * v1 compatibility: `singleShot: true` keeps one-shot behavior for tests.
 */
import { DeepSeekAbortError } from "@lemonwoo/deepseek";
import { routeTask, shouldEscalateToPro, type LemonWooTaskKind } from "@lemonwoo/deepseek";
import type { AgentRuntimeAdapters, AgentEvent, RunAgentLoopInput } from "./contracts.js";
import { runAgentLoop } from "./runAgentLoop.js";
import { LEMONWOO_AGENT_SYSTEM_PROMPT } from "./prompt.js";
import { evaluateDiffProposal } from "./multiDiff.js";
import type { AgentContextSnapshot, AgentPhase, AgentTaskResult } from "./types.js";

export type { AgentContextSnapshot, AgentPhase, AgentTaskResult, AgentEvent };
export type { AgentRuntimeAdapters, AgentRuntimeEvent, TestGateStructuredResult } from "./contracts.js";
export { runAgentLoop } from "./runAgentLoop.js";
export {
  DEFAULT_RUNTIME_LIMITS,
  type AgentToolName,
  type AgentToolRequest,
  type AgentToolResult,
  type RuntimeLimits
} from "./contracts.js";

export interface RunAgentTaskInput {
  client: RunAgentLoopInput["client"];
  context: AgentContextSnapshot;
  signal?: AbortSignal;
  fixTestOutput?: string;
  adapters?: AgentRuntimeAdapters;
  /** When true, skip v2 loop (unit tests / legacy). */
  singleShot?: boolean;
  limits?: RunAgentLoopInput["limits"];
}

function pickTaskKind(input: RunAgentTaskInput): LemonWooTaskKind {
  if (input.fixTestOutput) return "verify";
  const t = input.context.userTask.toLowerCase();
  if (/(refactor|migr)/i.test(t)) return "refactor";
  if (/(debug|depur|error|falla|fix|corrige)/i.test(t)) return "debug";
  if (/(^|\s)(tab|autocomplete|inline\s+edit|completado\s+tab)(\s|$)/i.test(t)) {
    return "small-write";
  }
  return "agent";
}

function pickPhase(task: LemonWooTaskKind, fix: boolean): AgentPhase {
  if (fix) return "Verificando";
  if (task === "small-write") return "Escribiendo";
  return "Pensando";
}

async function* runAgentTaskSingleShot(input: RunAgentTaskInput): AsyncGenerator<AgentEvent> {
  let task = input.context.taskKind ?? pickTaskKind(input);
  const phase = pickPhase(task, Boolean(input.fixTestOutput));
  yield { type: "phase", phase };

  const userInput = input.fixTestOutput
    ? [
        "TestGate falló. Corregí el código con un patch mínimo.",
        `Salida de tests:\n${input.fixTestOutput}`,
        `Tarea original:\n${input.context.userTask}`
      ].join("\n\n")
    : input.context.userTask;

  const volatile = [input.context.volatileContext, input.fixTestOutput ? `Test output:\n${input.fixTestOutput}` : ""]
    .filter(Boolean)
    .join("\n\n");

  const build = {
    systemPrompt: LEMONWOO_AGENT_SYSTEM_PROMPT,
    repoRules: [input.context.agentsMd, input.context.repoRules].filter(Boolean).join("\n\n"),
    stableContext: input.context.stableContext,
    volatileContext: volatile,
    userInput
  };

  let text = "";
  let mode: "pro" | "flash" = "pro";
  try {
    for await (const piece of input.client.chatStream({
      task,
      signal: input.signal,
      build
    })) {
      text += piece;
      yield { type: "delta", text: piece };
    }
    mode = routeTask(task) === "write" ? "flash" : "pro";
  } catch (error) {
    if (error instanceof DeepSeekAbortError) {
      throw error;
    }
    const chat = await input.client.chat({
      task,
      signal: input.signal,
      build
    });
    text = chat.text;
    mode = chat.modelLabel;
  }

  let diff = evaluateDiffProposal(text);
  if (
    routeTask(task) === "write" &&
    shouldEscalateToPro({
      task,
      touchedFiles: diff.touchedFiles.length,
      testsFailed: Boolean(input.fixTestOutput),
      hasNonTrivialError: Boolean(input.fixTestOutput)
    })
  ) {
    task = "agent";
    yield { type: "phase", phase: pickPhase(task, Boolean(input.fixTestOutput)) };
    text = "";
    try {
      for await (const piece of input.client.chatStream({
        task,
        signal: input.signal,
        build
      })) {
        text += piece;
        yield { type: "delta", text: piece };
      }
      mode = "pro";
    } catch (error) {
      if (error instanceof DeepSeekAbortError) {
        throw error;
      }
      const chat = await input.client.chat({
        task,
        signal: input.signal,
        build
      });
      text = chat.text;
      mode = chat.modelLabel;
    }
    diff = evaluateDiffProposal(text);
  }
  const message = diff.warning
    ? `${text}\n\n${diff.warning}`
    : diff.hasDiff
      ? `Propuesta (todavía no aplicada):\n\n${text}`
      : text;

  yield { type: "message", text: message };
  yield {
    type: "done",
    result: {
      message,
      rawDiff: diff.rawDiff,
      touchedFiles: diff.touchedFiles,
      hasDiff: diff.hasDiff,
      mode
    }
  };
}

export async function* runAgentTask(input: RunAgentTaskInput): AsyncGenerator<AgentEvent> {
  if (input.singleShot) {
    yield* runAgentTaskSingleShot(input);
    return;
  }
  yield* runAgentLoop(input);
}

export async function runAgentTaskOnce(input: RunAgentTaskInput): Promise<AgentTaskResult> {
  let result: AgentTaskResult | undefined;
  for await (const event of runAgentTask(input)) {
    if (event.type === "done") result = event.result;
  }
  if (!result) throw new Error("Agent task produced no result");
  return result;
}
