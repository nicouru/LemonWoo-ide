import type { AgentPhase, AgentContextSnapshot, AgentTaskResult } from "./types.js";

/** Internal tool names for v2 bounded loop (not MCP). */
export type AgentToolName =
  | "read_file"
  | "search"
  | "propose_diff"
  | "test_gate"
  | "summarize"
  | "run_terminal"
  | "verify_files_exist"
  | "start_preview_server"
  | "stop_preview_server";

export interface AgentToolRequest {
  tool: AgentToolName;
  args: Record<string, string>;
}

export interface AgentToolResult {
  ok: boolean;
  tool: AgentToolName;
  output: string;
  truncated?: boolean;
  /** Set by propose_diff when the patch is valid and apply-ready. */
  hasDiff?: boolean;
  rawDiff?: string | null;
  touchedFiles?: string[];
  warning?: string;
  requiresConfirmation?: boolean;
  exitCode?: number;
  url?: string;
  present?: string[];
  missing?: string[];
  timedOut?: boolean;
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

export interface TerminalRunInput {
  command: string;
  cwd?: string;
  timeoutMs?: string;
  reason?: string;
}

export interface TerminalRunResult {
  ok: boolean;
  command: string;
  cwd: string;
  output: string;
  stdout: string;
  stderr: string;
  exitCode?: number;
  timedOut?: boolean;
  requiresConfirmation?: boolean;
  warning?: string;
}

export interface VerifyFilesResult {
  ok: boolean;
  present: string[];
  missing: string[];
}

export interface PreviewToolResult {
  ok: boolean;
  url?: string;
  port?: number;
  command?: string;
  output?: string;
  reused?: boolean;
  warning?: string;
}

export interface AgentRuntimeAdapters {
  readFile?: (relPath: string) => Promise<string | null>;
  searchWorkspace?: (query: string) => Promise<string[]>;
  runTestGate?: (changedFiles: string[]) => Promise<TestGateStructuredResult>;
  runTerminal?: (input: TerminalRunInput) => Promise<TerminalRunResult>;
  verifyFilesExist?: (paths: string[]) => Promise<VerifyFilesResult>;
  startPreviewServer?: (input: { command?: string; port?: string; cwd?: string; reason?: string }) => Promise<PreviewToolResult>;
  stopPreviewServer?: (input?: { cwd?: string }) => Promise<PreviewToolResult>;
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
