import {
  appendApprovedMemoryFact,
  clearApprovedMemory,
  readApprovedMemoryFacts
} from "@lemonwoo/agent-runtime";

export interface MemoryCommandResult {
  handled: boolean;
  message: string;
}

const RECORD_PREFIX =
  /^(?:record[aá]\s+esto|remember\s+this|guard[aá]\s+en\s+memoria|save\s+to\s+memory)\s*[:\-]?\s*/i;
const LIST_PROMPT =
  /^(?:list|mostr[aá]|show)\s+(?:la\s+)?memor(?:y|ia)(?:\s+local)?\s*$/i;
const CLEAR_PROMPT =
  /^(?:clear|borr[aá]|limpia|empty)\s+(?:la\s+)?memor(?:y|ia)(?:\s+local)?\s*$/i;

export function tryHandleMemoryCommand(workspace: string, prompt: string): MemoryCommandResult {
  const text = prompt.trim();
  if (!text) return { handled: false, message: "" };

  if (LIST_PROMPT.test(text)) {
    const facts = readApprovedMemoryFacts(workspace);
    if (!facts.length) {
      return { handled: true, message: "No hay hechos en memoria local (.lemonwoo/memory.jsonl)." };
    }
    const lines = facts.map((f, i) => `${i + 1}. ${f.fact}`);
    return { handled: true, message: `Memoria local (${facts.length}):\n${lines.join("\n")}` };
  }

  if (CLEAR_PROMPT.test(text)) {
    const result = clearApprovedMemory(workspace);
    if (!result.ok) return { handled: true, message: result.reason };
    return {
      handled: true,
      message: result.removed
        ? "Memoria local borrada (.lemonwoo/memory.jsonl)."
        : "No había memoria local para borrar."
    };
  }

  const recordMatch = text.match(RECORD_PREFIX);
  if (recordMatch) {
    const fact = text.slice(recordMatch[0].length).trim();
    if (!fact) {
      return {
        handled: true,
        message: 'Escribí el hecho después del comando, por ejemplo: recordá esto: usar pnpm.'
      };
    }
    const result = appendApprovedMemoryFact(workspace, fact);
    if (!result.ok) return { handled: true, message: result.reason };
    return { handled: true, message: "Hecho guardado en memoria local aprobada." };
  }

  return { handled: false, message: "" };
}
