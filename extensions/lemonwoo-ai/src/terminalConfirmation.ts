import {
  classifyTerminalCommand,
  parseConfirmableTerminalCommand,
  type TerminalRunInput
} from "@lemonwoo/agent-runtime";

export interface PendingTerminalCommand {
  command: string;
  cwd: string;
  timeoutMs?: string;
  reason?: string;
}

let pendingTerminalCommand: PendingTerminalCommand | undefined;

export function getPendingTerminalCommand(): PendingTerminalCommand | undefined {
  return pendingTerminalCommand;
}

export function setPendingTerminalCommand(command: PendingTerminalCommand): void {
  pendingTerminalCommand = command;
}

export function clearPendingTerminalCommand(): void {
  pendingTerminalCommand = undefined;
}

export function canStorePendingTerminalCommand(command: string): boolean {
  const classification = classifyTerminalCommand(command.trim());
  if (classification.policy === "block") return false;
  if (classification.policy !== "confirm") return false;
  return parseConfirmableTerminalCommand(command) !== null;
}

export function pendingFromToolArgs(args: Record<string, string> | undefined): PendingTerminalCommand | null {
  const command = (args?.command ?? "").trim();
  if (!command || !canStorePendingTerminalCommand(command)) return null;
  return {
    command,
    cwd: (args?.cwd ?? ".").trim() || ".",
    timeoutMs: args?.timeoutMs,
    reason: args?.reason
  };
}

export function toConfirmedRunInput(pending: PendingTerminalCommand): TerminalRunInput {
  return {
    command: pending.command,
    cwd: pending.cwd,
    timeoutMs: pending.timeoutMs,
    reason: pending.reason,
    confirmed: true
  };
}
