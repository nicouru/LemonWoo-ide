import { DeepSeekClient } from "@lemonwoo/deepseek";
import type { LemonWooTaskKind } from "@lemonwoo/deepseek";
import { LEMONWOO_AGENT_SYSTEM_PROMPT } from "./prompt.js";
import { touchedFilesFromDiff } from "./multiDiff.js";

export type AgentPhase = "Pensando" | "Escribiendo" | "Verificando";

export type AgentEvent =
  | { type: "phase"; phase: AgentPhase }
  | { type: "message"; text: string }
  | { type: "done"; result: AgentTaskResult };

export interface AgentTaskResult {
  message: string;
  rawDiff: string | null;
  touchedFiles: string[];
  hasDiff: boolean;
  mode: "pro" | "flash";
}

export interface AgentContextSnapshot {
  userTask: string;
  agentsMd?: string;
  repoRules?: string;
  stableContext?: string;
  volatileContext?: string;
  taskKind?: LemonWooTaskKind;
}

export interface RunAgentTaskInput {
  client: DeepSeekClient;
  context: AgentContextSnapshot;
  signal?: AbortSignal;
  /** When set, runs verify/fix pass with prior test output. */
  fixTestOutput?: string;
}

function pickTaskKind(input: RunAgentTaskInput): LemonWooTaskKind {
  if (input.fixTestOutput) return "verify";
  const t = input.context.userTask.toLowerCase();
  if (/(refactor|migr)/i.test(t)) return "refactor";
  if (/(debug|depur|error|falla|fix|corrige)/i.test(t)) return "debug";
  if (/(tab|autocomplete|inline|complet)/i.test(t) && !/(test|verific|debug)/i.test(t)) {
    return "small-write";
  }
  return "agent";
}

function pickPhase(task: LemonWooTaskKind, fix: boolean): AgentPhase {
  if (fix) return "Verificando";
  if (task === "small-write") return "Escribiendo";
  return "Pensando";
}

export function extractDiffFromResponse(text: string): string | null {
  const match = text.match(/```diff\s*([\s\S]*?)```/);
  return match?.[1]?.trim() ?? null;
}

export async function* runAgentTask(input: RunAgentTaskInput): AsyncGenerator<AgentEvent> {
  const task = input.context.taskKind ?? pickTaskKind(input);
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

  const chat = await input.client.chat({
    task,
    signal: input.signal,
    build: {
      systemPrompt: LEMONWOO_AGENT_SYSTEM_PROMPT,
      repoRules: [input.context.agentsMd, input.context.repoRules].filter(Boolean).join("\n\n"),
      stableContext: input.context.stableContext,
      volatileContext: volatile,
      userInput
    }
  });

  const rawDiff = extractDiffFromResponse(chat.text);
  const touchedFiles = rawDiff ? touchedFilesFromDiff(rawDiff) : [];
  const hasDiff = Boolean(rawDiff);
  const message = hasDiff
    ? `Propuesta (todavía no aplicada):\n\n${chat.text}`
    : chat.text;

  yield { type: "message", text: message };
  yield {
    type: "done",
    result: {
      message,
      rawDiff,
      touchedFiles,
      hasDiff,
      mode: chat.modelLabel
    }
  };
}

/** Buffered helper for callers that do not need streaming. */
export async function runAgentTaskOnce(input: RunAgentTaskInput): Promise<AgentTaskResult> {
  let result: AgentTaskResult | undefined;
  for await (const event of runAgentTask(input)) {
    if (event.type === "done") result = event.result;
  }
  if (!result) throw new Error("Agent task produced no result");
  return result;
}
