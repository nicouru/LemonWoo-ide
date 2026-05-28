export type AgentPhase = "Pensando" | "Escribiendo" | "Verificando";

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
  taskKind?: import("@lemonwoo/deepseek").LemonWooTaskKind;
}
