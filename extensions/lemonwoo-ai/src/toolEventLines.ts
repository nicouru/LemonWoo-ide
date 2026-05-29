import type { AgentToolName } from "@lemonwoo/agent-runtime";

export type AgentBusyState =
  | "Pensando"
  | "Escribiendo"
  | "Verificando"
  | "Sirviendo"
  | "Ejecutando comando"
  | "Levantando servidor"
  | "Leyendo archivo"
  | "Buscando"
  | "Comprobando archivos"
  | "Listo";

export interface ToolEventView {
  tool: AgentToolName;
  phase: "start" | "done";
  summary?: string;
  args?: Record<string, string>;
}

function shortPath(path: string): string {
  const trimmed = path.trim().replace(/^\.\//, "");
  const parts = trimmed.split(/[/\\]/);
  return parts.length > 3 ? `…/${parts.slice(-2).join("/")}` : trimmed;
}

function clip(text: string, max = 72): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Status bar label while a tool is running. */
export function toolStartStatus(event: ToolEventView): AgentBusyState | null {
  if (event.phase !== "start") return null;
  switch (event.tool) {
    case "read_file":
      return "Leyendo archivo";
    case "search":
      return "Buscando";
    case "test_gate":
      return "Verificando";
    case "run_terminal":
      return "Ejecutando comando";
    case "start_preview_server":
      return "Levantando servidor";
    case "verify_files_exist":
      return "Comprobando archivos";
    case "propose_diff":
      return "Escribiendo";
    case "stop_preview_server":
      return "Sirviendo";
    default:
      return null;
  }
}

/** One-line activity note appended to the agent stream (not raw tool output). */
export function toolDoneLine(event: ToolEventView): string | null {
  if (event.phase !== "done") return null;
  const args = event.args ?? {};
  const summary = event.summary ?? "";

  switch (event.tool) {
    case "read_file": {
      const path = args.path?.trim();
      return path ? `↳ Leyó ${shortPath(path)}` : "↳ Archivo leído";
    }
    case "search": {
      const query = args.query?.trim();
      if (/no matches/i.test(summary)) {
        return query ? `↳ Sin coincidencias para «${clip(query, 48)}»` : "↳ Sin coincidencias";
      }
      const hits = summary.split("\n").filter((line) => line.trim()).length;
      return query
        ? `↳ Buscó «${clip(query, 48)}» (${hits} coincidencia${hits === 1 ? "" : "s"})`
        : `↳ Búsqueda (${hits} coincidencia${hits === 1 ? "" : "s"})`;
    }
    case "test_gate":
      if (/FAIL/i.test(summary)) return "↳ Tests fallaron";
      if (/PASS/i.test(summary)) return "↳ Tests pasaron";
      return "↳ Verificación de tests";
    case "run_terminal": {
      const cmd = clip(args.command ?? "comando", 56);
      if (/requiere confirmación/i.test(summary)) {
        return `↳ «${cmd}» requiere confirmación`;
      }
      if (/blocked|rejected/i.test(summary)) {
        return `↳ Comando no permitido: ${cmd}`;
      }
      const exit = summary.match(/exit(?:\s*code)?:\s*(\d+)/i)?.[1];
      if (exit === "0" || /\bok\b/i.test(summary)) return `↳ Comando listo: ${cmd}`;
      if (exit) return `↳ Comando falló (${exit}): ${cmd}`;
      return `↳ Comando ejecutado: ${cmd}`;
    }
    case "propose_diff": {
      const m = summary.match(/(\d+)\s+file/i);
      const n = m?.[1];
      return n ? `↳ Cambios propuestos (${n} archivo${n === "1" ? "" : "s"})` : "↳ Cambios propuestos";
    }
    case "verify_files_exist":
      if (/missing:/i.test(summary)) return "↳ Faltan archivos en el proyecto";
      return "↳ Archivos comprobados";
    case "start_preview_server":
    case "stop_preview_server":
      return null;
    case "summarize":
      return null;
    default:
      return null;
  }
}

/** User-facing warning line (no tool names or provider jargon). */
export function formatAgentWarning(text: string): string {
  if (/requiere confirmación/i.test(text)) {
    return "Comando requiere confirmación — no se ejecutó automáticamente.";
  }
  if (/límite de pasos/i.test(text)) {
    return text;
  }
  return text.replace(/TestGate/gi, "tests").slice(0, 280);
}

export const AGENT_BUSY_STATES: readonly AgentBusyState[] = [
  "Pensando",
  "Escribiendo",
  "Verificando",
  "Ejecutando comando",
  "Levantando servidor",
  "Leyendo archivo",
  "Buscando",
  "Comprobando archivos",
  "Sirviendo"
];
