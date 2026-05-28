import type { AgentPhase, AgentContextSnapshot, AgentTaskResult } from "./types.js";

/** Internal tool names for v2 bounded loop (not MCP). */
export type AgentToolName =
  | "read_file"
  | "search"
  | "propose_diff"
  | "test_gate"
  | "summarize";

export interface AgentToolRequest {
  tool: AgentToolName;
  args: Record<string, string>;
}

export interface AgentToolResult {
  ok: boolean;
  tool: AgentToolName;
  output: string;
  truncated?: boolean;
}

export interface AgentStep {
  index: number;
  kind: "model" | "tool" | "repair";
  summary?: string;
}

export interface RuntimeLimits {
  maxSteps: number;
  maxRepairAttempts: number;
  maxToolOutputChars: number;
  maxSearchResults: number;
  maxFileReadChars: number;
}

export const DEFAULT_RUNTIME_LIMITS: RuntimeLimits = {
  maxSteps: 6,
  maxRepairAttempts: 2,
  maxToolOutputChars: 12_000,
  maxSearchResults: 20,
  maxFileReadChars: 20_000
};

export interface RuntimeLoopState {
  steps: AgentStep[];
  toolResults: AgentToolResult[];
  repairAttempts: number;
  stoppedReason?: "done" | "max_steps" | "aborted";
}

export type AgentEvent = AgentRuntimeEvent;

export type AgentRuntimeEvent =
  | { type: "phase"; phase: AgentPhase }
  | { type: "delta"; text: string }
  | { type: "message"; text: string }
  | { type: "tool"; tool: AgentToolName; phase: "start" | "done"; summary?: string }
  | { type: "warning"; text: string }
  | { type: "done"; result: AgentTaskResult };

export interface TestGateStructuredResult {
  ok: boolean;
  output: string;
  commands: string[];
  durationMs?: number;
  truncated?: boolean;
}

export interface AgentRuntimeAdapters {
  readFile?: (relPath: string) => Promise<string | null>;
  searchWorkspace?: (query: string) => Promise<string[]>;
  runTestGate?: (changedFiles: string[]) => Promise<TestGateStructuredResult>;
}

export interface RunAgentLoopInput {
  client: import("@lemonwoo/deepseek").DeepSeekClient;
  context: AgentContextSnapshot;
  signal?: AbortSignal;
  fixTestOutput?: string;
  adapters?: AgentRuntimeAdapters;
  limits?: Partial<RuntimeLimits>;
  /** Legacy single-shot without multi-step loop. */
  singleShot?: boolean;
}

export type { AgentContextSnapshot, AgentPhase, AgentTaskResult };
