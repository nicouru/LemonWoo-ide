import * as vscode from "vscode";
import * as path from "path";
import {
  DeepSeekClient,
  DeepSeekAbortError,
  buildMessages,
  redactSecrets
} from "@lemonwoo/deepseek";

const KEY_NAME = "deepseek.apiKey";

let lastInlineAbort: AbortController | undefined;
let debounceTimeout: NodeJS.Timeout | undefined;

let cachedClient: DeepSeekClient | undefined;
let cachedClientKey: string | undefined;

export function clearClientCache(): void {
  cachedClient = undefined;
  cachedClientKey = undefined;
}

function getClient(apiKey: string): DeepSeekClient {
  if (cachedClient && cachedClientKey === apiKey) {
    return cachedClient;
  }
  cachedClient = new DeepSeekClient({ apiKey });
  cachedClientKey = apiKey;
  return cachedClient;
}

function isSensitiveFile(fsPath: string): boolean {
  const basename = path.basename(fsPath).toLowerCase();
  if (basename === ".env" || basename.startsWith(".env.")) return true;
  if (basename === ".npmrc") return true;
  if (basename === ".yarnrc") return true;
  if (basename === ".pypirc") return true;
  if (basename === ".netrc") return true;
  if (basename === "id_rsa" || basename === "id_ed25519") return true;
  if (
    basename.endsWith(".pem") ||
    basename.endsWith(".key") ||
    basename.endsWith(".crt") ||
    basename.endsWith(".p12")
  ) return true;
  if (basename === "secrets" || basename.startsWith("secrets.")) return true;
  return false;
}

export function registerInlineCompletionProvider(context: vscode.ExtensionContext): vscode.Disposable {
  const provider: vscode.InlineCompletionItemProvider = {
    async provideInlineCompletionItems(
      document: vscode.TextDocument,
      position: vscode.Position,
      inlineContext: vscode.InlineCompletionContext,
      token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionList | vscode.InlineCompletionItem[] | undefined> {
      // 1. Basic validation of document scheme and language
      if (document.uri.scheme !== "file") {
        return undefined;
      }

      const ignoredLanguages = ["markdown", "git-commit", "git-rebase", "plaintext"];
      if (ignoredLanguages.includes(document.languageId)) {
        return undefined;
      }

      // 2. Validate workspace membership
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
      if (!workspaceFolder) {
        return undefined;
      }

      // 3. Sensitive file exclusion
      if (isSensitiveFile(document.uri.fsPath)) {
        return undefined;
      }

      // 4. Get the DeepSeek API key
      const apiKey = await context.secrets.get(KEY_NAME);
      if (!apiKey) {
        return undefined;
      }

      // 5. Perform size and path validations
      const text = document.getText();
      // Enforce 1MB limit (1,048,576 characters)
      if (text.length > 1024 * 1024) {
        return undefined;
      }

      const relativePath = path.relative(workspaceFolder.uri.fsPath, document.uri.fsPath);

      const pathParts = relativePath.split(/[\\/]/);
      const isExcluded = pathParts.some((part) => {
        const lower = part.toLowerCase();
        return (
          lower === ".git" ||
          lower === "node_modules" ||
          lower === "dist" ||
          lower === "build" ||
          lower === "out"
        );
      });

      if (isExcluded) {
        return undefined;
      }

      // 6. Debounce and Cancel Previous Request
      if (lastInlineAbort) {
        lastInlineAbort.abort();
      }
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
        debounceTimeout = undefined;
      }

      const currentAbort = new AbortController();
      lastInlineAbort = currentAbort;

      token.onCancellationRequested(() => {
        currentAbort.abort();
      });

      if (token.isCancellationRequested) {
        return undefined;
      }

      // Real debounce of 300ms before touching network
      try {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            currentAbort.signal.removeEventListener("abort", onAbort);
            resolve();
          }, 300);

          const onAbort = () => {
            clearTimeout(timeout);
            reject(new Error("aborted"));
          };
          currentAbort.signal.addEventListener("abort", onAbort);
        });
      } catch (err) {
        return undefined;
      }

      if (token.isCancellationRequested || currentAbort.signal.aborted) {
        return undefined;
      }

      // 7. Construct prefix and suffix contexts
      const offset = document.offsetAt(position);
      const prefixStart = Math.max(0, offset - 3000);
      const prefixText = text.substring(prefixStart, offset);

      const suffixEnd = Math.min(text.length, offset + 1500);
      const suffixText = text.substring(offset, suffixEnd);

      const systemPrompt = `You are an expert code autocomplete agent.
Your task is to generate the continuation of the code.
Given a prefix and suffix of a file, generate ONLY the code that should be inserted between them.
Do NOT wrap the response in markdown code blocks or any other formatting.
Do NOT repeat the prefix or suffix. Output ONLY the code to be inserted.`;

      const userInput = `Language: ${document.languageId}
File Path: ${relativePath}

[PREFIX]
${prefixText}
[SUFFIX]
${suffixText}`;

      const messages = buildMessages({
        systemPrompt,
        userInput
      });

      // 8. Query DeepSeek Flash via client.chat
      try {
        const client = getClient(apiKey);
        const result = await client.chat({
          task: "tab",
          messages,
          signal: currentAbort.signal,
          maxTokens: 256
        });

        if (token.isCancellationRequested || currentAbort.signal.aborted) {
          return undefined;
        }

        const completionText = result.text;
        if (!completionText || !completionText.trim()) {
          return undefined;
        }

        // 9. Return as ghost text item
        const item = new vscode.InlineCompletionItem(
          completionText,
          new vscode.Range(position, position)
        );

        return [item];
      } catch (error) {
        if (
          error instanceof DeepSeekAbortError ||
          (error as Error).name === "AbortError"
        ) {
          // Silent: Request was aborted
          return undefined;
        }

        // Redact secrets in logs
        const redactedErrorMsg = redactSecrets(String(error), [apiKey]);
        console.error("LemonWoo Autocomplete Error:", redactedErrorMsg);
        return undefined;
      }
    }
  };

  // Register for all languages/files
  return vscode.languages.registerInlineCompletionItemProvider(
    { pattern: "**" },
    provider
  );
}
