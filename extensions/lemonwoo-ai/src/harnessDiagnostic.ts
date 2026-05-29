import * as vscode from "vscode";
import { withSecretBackedDeepSeekEnv } from "./deepSeekSecrets.js";

async function loadOpenCodeHarnessModule() {
  return await import("@lemonwoo/agent-runtime/opencode");
}

export async function runHarnessDiagnostic(context: vscode.ExtensionContext): Promise<string> {
  const wrapped = await withSecretBackedDeepSeekEnv(context, async () => {
    const { runOpenCodeHarnessSpike } = await loadOpenCodeHarnessModule();
    return runOpenCodeHarnessSpike();
  });
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
  const { formatHarnessReport } = await loadOpenCodeHarnessModule();
  return formatHarnessReport(wrapped.value);
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
