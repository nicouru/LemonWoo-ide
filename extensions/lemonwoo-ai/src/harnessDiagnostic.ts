import * as vscode from "vscode";
import { withSecretBackedDeepSeekEnv } from "./deepSeekSecrets.js";

const PACKAGED_UNAVAILABLE_MESSAGE = [
  "LemonWoo Harness Diagnostic",
  "UNAVAILABLE: OpenCode diagnostic is unavailable in packaged LemonWoo.",
  "Run `pnpm opencode:spike` from the repository for CLI harness checks."
].join("\n");

type OpenCodeHarnessModule = typeof import("@lemonwoo/agent-runtime/opencode");

export async function loadOpenCodeHarnessModule(): Promise<OpenCodeHarnessModule | null> {
  try {
    return await import("@lemonwoo/agent-runtime/opencode");
  } catch {
    return null;
  }
}

export async function runHarnessDiagnostic(
  context: vscode.ExtensionContext,
  loadModule: () => Promise<OpenCodeHarnessModule | null> = loadOpenCodeHarnessModule
): Promise<string> {
  const mod = await loadModule();
  if (!mod) {
    return PACKAGED_UNAVAILABLE_MESSAGE;
  }

  const wrapped = await withSecretBackedDeepSeekEnv(context, async () => mod.runOpenCodeHarnessSpike());
  if (wrapped.status === "missing-key") {
    return [
      "LemonWoo Harness Diagnostic",
      "DEEPSEEK_CONFIG: SKIP",
      "SIMPLE_PROMPT: SKIP",
      "FIXTURE_MULTI_FILE: SKIP",
      "- Conectá DeepSeek en LemonWoo Agent (SecretStorage) para diagnóstico live."
    ].join("\n");
  }
  if (wrapped.status === "error") {
    return `LemonWoo Harness Diagnostic\nERROR: ${wrapped.message}`;
  }
  return mod.formatHarnessReport(wrapped.value);
}

export function registerHarnessDiagnosticCommand(context: vscode.ExtensionContext): void {
  const cmd = vscode.commands.registerCommand("lemonwoo.runHarnessDiagnostic", async () => {
    const report = await runHarnessDiagnostic(context);
    await vscode.window.showInformationMessage("Harness diagnostic finished. See output channel.");
    const channel = vscode.window.createOutputChannel("LemonWoo Harness");
    channel.clear();
    channel.appendLine(report);
    channel.show(true);
  });
  context.subscriptions.push(cmd);
}
