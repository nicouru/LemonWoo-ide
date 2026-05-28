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

export function registerInlineCompletionProvider(context: vscode.ExtensionContext): vscode.Disposable {
  const provider: vscode.InlineCompletionItemProvider = {
    async provideInlineCompletionItems(
      document: vscode.TextDocument,
      position: vscode.Position,
      inlineContext: vscode.InlineCompletionContext,
      token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionList | vscode.InlineCompletionItem[] | undefined> {
      // 1. Get the DeepSeek API key
      const apiKey = await context.secrets.get(KEY_NAME);
      if (!apiKey) {
        return undefined;
      }

      // 2. Perform size and path validations
      const text = document.getText();
      // Enforce 1MB limit (1,048,576 characters)
      if (text.length > 1024 * 1024) {
        return undefined;
      }

      const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
      const relativePath = workspaceFolder
        ? path.relative(workspaceFolder.uri.fsPath, document.uri.fsPath)
        : document.uri.fsPath;

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

      // 3. Debounce and Cancel Previous Request
      if (lastInlineAbort) {
        lastInlineAbort.abort();
      }

      const currentAbort = new AbortController();
      lastInlineAbort = currentAbort;

      token.onCancellationRequested(() => {
        currentAbort.abort();
      });

      if (token.isCancellationRequested) {
        return undefined;
      }

      // 4. Construct prefix and suffix contexts
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

      // 5. Query DeepSeek Flash via client.chat
      try {
        const client = new DeepSeekClient({ apiKey });
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

        // 6. Return as ghost text item
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
