import { DeepSeekAbortError } from "@lemonwoo/deepseek";
import { routeTask, shouldEscalateToPro, type LemonWooTaskKind } from "@lemonwoo/deepseek";
import type { AgentRuntimeEvent, RunAgentLoopInput, RuntimeLimits, RuntimeLoopState } from "./contracts.js";
import { DEFAULT_RUNTIME_LIMITS } from "./contracts.js";
import { evaluateDiffProposal } from "./multiDiff.js";
import { LEMONWOO_AGENT_SYSTEM_PROMPT } from "./prompt.js";
import { parseToolRequests } from "./toolParse.js";
import { executeTool, type ToolExecutionContext } from "./tools.js";
import type { AgentPhase } from "./types.js";

function pickTaskKind(input: RunAgentLoopInput, fix: boolean): LemonWooTaskKind {
  if (fix) return "verify";
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

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DeepSeekAbortError("aborted");
  }
}

function formatToolLog(results: { tool: string; output: string }[]): string {
  if (!results.length) return "";
  return results
    .map((r) => `[tool:${r.tool}]\n${r.output}`)
    .join("\n\n")
    .slice(0, 12_000);
}

export async function* runAgentLoop(input: RunAgentLoopInput): AsyncGenerator<AgentRuntimeEvent> {
  const limits: RuntimeLimits = { ...DEFAULT_RUNTIME_LIMITS, ...input.limits };
  const state: RuntimeLoopState = { steps: [], toolResults: [], repairAttempts: 0 };
  const touchedFiles: string[] = [];
  const adapters = input.adapters ?? {};

  let task = input.context.taskKind ?? pickTaskKind(input, Boolean(input.fixTestOutput));
  let mode: "pro" | "flash" = "pro";
  let lastText = "";
  let lastDiff = evaluateDiffProposal("");

  const runRepair = Boolean(input.fixTestOutput);
  if (runRepair) {
    state.repairAttempts = 1;
  }

  const baseVolatile = [
    input.context.volatileContext,
    input.fixTestOutput ? `Test output:\n${input.fixTestOutput}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");

  let volatileExtra = "";
  let stepIndex = 0;

  while (stepIndex < limits.maxSteps) {
    checkAbort(input.signal);
    const phase = pickPhase(task, runRepair && stepIndex === 0);
    yield { type: "phase", phase };

    const userInput =
      runRepair && stepIndex === 0
        ? [
            "TestGate falló. Corregí el código con un patch mínimo.",
            `Salida de tests:\n${input.fixTestOutput}`,
            `Tarea original:\n${input.context.userTask}`
          ].join("\n\n")
        : input.context.userTask;

    const build = {
      systemPrompt: LEMONWOO_AGENT_SYSTEM_PROMPT,
      repoRules: [input.context.agentsMd, input.context.repoRules].filter(Boolean).join("\n\n"),
      stableContext: input.context.stableContext,
      volatileContext: [baseVolatile, volatileExtra].filter(Boolean).join("\n\n"),
      userInput
    };

    state.steps.push({ index: stepIndex, kind: runRepair && stepIndex === 0 ? "repair" : "model" });

    let text = "";
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
      if (error instanceof DeepSeekAbortError) throw error;
      const chat = await input.client.chat({ task, signal: input.signal, build });
      text = chat.text;
      mode = chat.modelLabel;
      yield { type: "delta", text };
    }

    lastText = text;

    const toolCtx: ToolExecutionContext = {
      adapters,
      limits,
      volatileSearchBlob: baseVolatile,
      touchedFiles
    };

    const toolRequests = parseToolRequests(lastText);
    if (toolRequests.length > 0) {
      for (const req of toolRequests) {
        checkAbort(input.signal);
        yield { type: "tool", tool: req.tool, phase: "start" };
        const result = await executeTool(req, toolCtx);
        state.toolResults.push(result);
        state.steps.push({ index: stepIndex, kind: "tool", summary: req.tool });
        yield {
          type: "tool",
          tool: req.tool,
          phase: "done",
          summary: result.output.slice(0, 200)
        };
      }
      volatileExtra = formatToolLog(state.toolResults);
      stepIndex += 1;
      continue;
    }

    lastDiff = evaluateDiffProposal(lastText);
    if (
      routeTask(task) === "write" &&
      shouldEscalateToPro({
        task,
        touchedFiles: lastDiff.touchedFiles.length,
        testsFailed: runRepair,
        hasNonTrivialError: runRepair
      })
    ) {
      task = "agent";
      stepIndex += 1;
      continue;
    }

    if (lastDiff.hasDiff) {
      break;
    }

    if (stepIndex >= limits.maxSteps - 1) {
      state.stoppedReason = "max_steps";
      yield {
        type: "warning",
        text: "Límite de pasos alcanzado. Revisá la salida o refiná la tarea."
      };
      break;
    }

    stepIndex += 1;
  }

  if (state.stoppedReason === "max_steps" && !lastDiff.hasDiff) {
    const message = lastDiff.warning
      ? `${lastText}\n\n${lastDiff.warning}`
      : lastText || "No se generó diff en el límite de pasos.";
    yield { type: "message", text: message };
    yield {
      type: "done",
      result: {
        message,
        rawDiff: null,
        touchedFiles: [],
        hasDiff: false,
        mode
      }
    };
    return;
  }

  const message = lastDiff.warning
    ? `${lastText}\n\n${lastDiff.warning}`
    : lastDiff.hasDiff
      ? `Propuesta (todavía no aplicada):\n\n${lastText}`
      : lastText;

  yield { type: "message", text: message };
  yield {
    type: "done",
    result: {
      message,
      rawDiff: lastDiff.rawDiff,
      touchedFiles: lastDiff.touchedFiles,
      hasDiff: lastDiff.hasDiff,
      mode
    }
  };
}
