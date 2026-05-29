import * as vscode from "vscode";
import { redactSecrets } from "@lemonwoo/deepseek";

/** Same secret id used by onboarding, chat, and inline completion. */
export const DEEPSEEK_SECRET_KEY = "deepseek.apiKey";

export async function getDeepSeekKeyFromSecretStorage(
  context: vscode.ExtensionContext
): Promise<string | undefined> {
  const key = await context.secrets.get(DEEPSEEK_SECRET_KEY);
  return key?.trim() || undefined;
}

export type SecretBackedEnvResult<T> =
  | { status: "ok"; value: T }
  | { status: "missing-key" }
  | { status: "error"; message: string };

/**
 * Runs fn with DEEPSEEK_API_KEY set from SecretStorage for child SDK/spike use only.
 * Restores prior env in finally. Never logs the key.
 */
export async function withSecretBackedDeepSeekEnv<T>(
  context: vscode.ExtensionContext,
  fn: () => Promise<T>
): Promise<SecretBackedEnvResult<T>> {
  const key = await getDeepSeekKeyFromSecretStorage(context);
  if (!key) return { status: "missing-key" };

  const prev = process.env.DEEPSEEK_API_KEY;
  try {
    process.env.DEEPSEEK_API_KEY = key;
    const value = await fn();
    return { status: "ok", value };
  } catch (error) {
    return { status: "error", message: redactSecrets(String(error), [key]) };
  } finally {
    if (prev === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = prev;
  }
}
