import { describe, expect, it, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import { registerInlineCompletionProvider, resetInlineCompletionState } from "../src/inlineCompletion.js";
import { DeepSeekClient, buildMessages, DeepSeekAbortError } from "@lemonwoo/deepseek";

// Mock vscode module
vi.mock("vscode", () => {
  class Position {
    constructor(public line: number, public character: number) {}
  }
  class Range {
    constructor(public start: Position, public end: Position) {}
  }
  class InlineCompletionItem {
    constructor(public insertText: string, public range: Range) {}
  }
  return {
    Position,
    Range,
    InlineCompletionItem,
    languages: {
      registerInlineCompletionItemProvider: vi.fn(() => ({ dispose: vi.fn() }))
    },
    workspace: {
      getWorkspaceFolder: vi.fn()
    }
  };
});

// Mock @lemonwoo/deepseek
vi.mock("@lemonwoo/deepseek", () => {
  const chatMock = vi.fn().mockResolvedValue({ text: "completion text" });
  const DeepSeekClientMock = vi.fn().mockImplementation(() => {
    return {
      chat: chatMock,
      getRedactedKey: () => "sk-..."
    };
  });
  return {
    DeepSeekClient: DeepSeekClientMock,
    DeepSeekAbortError: class extends Error {
      constructor(msg?: string) {
        super(msg);
        this.name = "DeepSeekAbortError";
      }
    },
    buildMessages: vi.fn().mockReturnValue([]),
    redactSecrets: vi.fn((x) => x)
  };
});

describe("Inline Completion Provider", () => {
  let mockContext: any;
  let mockSecrets: Record<string, string>;
  let providerInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSecrets = {};
    mockContext = {
      secrets: {
        get: vi.fn(async (key) => mockSecrets[key]),
        store: vi.fn(async (key, val) => {
          mockSecrets[key] = val;
        }),
        delete: vi.fn(async (key) => {
          delete mockSecrets[key];
        })
      },
      subscriptions: []
    };

    // Register provider to extract the provider instance
    registerInlineCompletionProvider(mockContext);
    const registerSpy = vscode.languages.registerInlineCompletionItemProvider as any;
    providerInstance = registerSpy.mock.calls[0][1];

    // Mock getWorkspaceFolder by default
    (vscode.workspace.getWorkspaceFolder as any).mockReturnValue({
      uri: { fsPath: "/workspace" }
    });

    resetInlineCompletionState();
  });

  it("returns undefined and does not query DeepSeek if API key is missing", async () => {
    const document: any = {
      getText: () => "const x = 1;",
      uri: { fsPath: "/workspace/src/file.ts", scheme: "file" },
      offsetAt: () => 0,
      languageId: "typescript"
    };
    const position = new vscode.Position(0, 0);
    const inlineContext: any = {};
    const token: any = {
      onCancellationRequested: vi.fn(),
      isCancellationRequested: false
    };

    const result = await providerInstance.provideInlineCompletionItems(
      document,
      position,
      inlineContext,
      token
    );

    expect(result).toBeUndefined();
    expect(DeepSeekClient).not.toHaveBeenCalled();
  });

  it("limits prefix to 3000 chars and suffix to 1500 chars", async () => {
    mockSecrets["deepseek.apiKey"] = "sk-fakekey";

    const longPrefix = "a".repeat(4000);
    const longSuffix = "b".repeat(2000);
    const fullText = longPrefix + longSuffix;

    const document: any = {
      getText: () => fullText,
      uri: { fsPath: "/workspace/src/file.ts", scheme: "file" },
      offsetAt: () => 4000,
      languageId: "typescript"
    };
    const position = new vscode.Position(0, 4000);
    const inlineContext: any = {};
    const token: any = {
      onCancellationRequested: vi.fn(),
      isCancellationRequested: false
    };

    await providerInstance.provideInlineCompletionItems(
      document,
      position,
      inlineContext,
      token
    );

    expect(buildMessages).toHaveBeenCalled();
    const buildArgs = (buildMessages as any).mock.calls[0][0];

    // Check prefix is sliced to last 3000 chars
    expect(buildArgs.userInput).toContain("a".repeat(3000));
    expect(buildArgs.userInput).not.toContain("a".repeat(3001));

    // Check suffix is sliced to first 1500 chars
    expect(buildArgs.userInput).toContain("b".repeat(1500));
    expect(buildArgs.userInput).not.toContain("b".repeat(1501));
  });

  it("excludes files in excluded directories (.git, node_modules, dist)", async () => {
    mockSecrets["deepseek.apiKey"] = "sk-fakekey";

    const document: any = {
      getText: () => "const x = 1;",
      uri: { fsPath: "/workspace/node_modules/pkg/index.ts", scheme: "file" },
      offsetAt: () => 0,
      languageId: "typescript"
    };
    const position = new vscode.Position(0, 0);
    const inlineContext: any = {};
    const token: any = {
      onCancellationRequested: vi.fn(),
      isCancellationRequested: false
    };

    const result = await providerInstance.provideInlineCompletionItems(
      document,
      position,
      inlineContext,
      token
    );

    expect(result).toBeUndefined();
    expect(DeepSeekClient).not.toHaveBeenCalled();
  });

  it("returns InlineCompletionItem on valid autocomplete response", async () => {
    mockSecrets["deepseek.apiKey"] = "sk-fakekey";

    const document: any = {
      getText: () => "const x = 1;",
      uri: { fsPath: "/workspace/src/file.ts", scheme: "file" },
      offsetAt: () => 12,
      languageId: "typescript"
    };
    const position = new vscode.Position(0, 12);
    const inlineContext: any = {};
    const token: any = {
      onCancellationRequested: vi.fn(),
      isCancellationRequested: false
    };

    const chatMock = vi.fn().mockResolvedValue({ text: " + 2;" });
    (DeepSeekClient as any).mockImplementation(() => ({
      chat: chatMock
    }));

    const result = await providerInstance.provideInlineCompletionItems(
      document,
      position,
      inlineContext,
      token
    );

    expect(result).toBeDefined();
    expect(result.length).toBe(1);
    expect(result[0].insertText).toBe(" + 2;");
  });

  it("strips markdown fences from ghost text", async () => {
    mockSecrets["deepseek.apiKey"] = "sk-fakekey";

    const document: any = {
      getText: () => "const x = 1;",
      uri: { fsPath: "/workspace/src/file.ts", scheme: "file" },
      offsetAt: () => 12,
      languageId: "typescript"
    };
    const position = new vscode.Position(0, 12);
    const inlineContext: any = {};
    const token: any = {
      onCancellationRequested: vi.fn(),
      isCancellationRequested: false
    };

    const chatMock = vi.fn().mockResolvedValue({ text: "```typescript\n + 2;\n```" });
    (DeepSeekClient as any).mockImplementation(() => ({
      chat: chatMock
    }));

    const result = await providerInstance.provideInlineCompletionItems(
      document,
      position,
      inlineContext,
      token
    );

    expect(result?.[0]?.insertText).toBe(" + 2;");
  });

  it("cancels previous request when a new completion is triggered (debounce)", async () => {
    mockSecrets["deepseek.apiKey"] = "sk-fakekey";

    const document: any = {
      getText: () => "const x = 1;",
      uri: { fsPath: "/workspace/src/file.ts", scheme: "file" },
      offsetAt: () => 12,
      languageId: "typescript"
    };
    const position = new vscode.Position(0, 12);
    const inlineContext: any = {};

    const token1: any = {
      onCancellationRequested: vi.fn(),
      isCancellationRequested: false
    };
    const token2: any = {
      onCancellationRequested: vi.fn(),
      isCancellationRequested: false
    };

    const chatMock = vi.fn().mockImplementation((args) => {
      return new Promise((resolve) => setTimeout(() => resolve({ text: "res" }), 100));
    });
    (DeepSeekClient as any).mockImplementation(() => ({
      chat: chatMock
    }));

    // Trigger first request
    const p1 = providerInstance.provideInlineCompletionItems(
      document,
      position,
      inlineContext,
      token1
    );

    // Wait a tiny bit (less than debounce 300ms)
    await new Promise((r) => setTimeout(r, 50));

    // Trigger second request immediately
    const p2 = providerInstance.provideInlineCompletionItems(
      document,
      position,
      inlineContext,
      token2
    );

    const [res1, res2] = await Promise.all([p1, p2]);

    expect(res1).toBeUndefined();
    expect(res2).toBeDefined();

    // The second request should not be aborted
    const lastCall = chatMock.mock.calls[chatMock.mock.calls.length - 1];
    expect(lastCall[0].signal.aborted).toBe(false);
  });

  it("handles empty response, cancellation, and errors gracefully", async () => {
    mockSecrets["deepseek.apiKey"] = "sk-fakekey";

    const document: any = {
      getText: () => "const x = 1;",
      uri: { fsPath: "/workspace/src/file.ts", scheme: "file" },
      offsetAt: () => 12,
      languageId: "typescript"
    };
    const position = new vscode.Position(0, 12);
    const inlineContext: any = {};
    const token: any = {
      onCancellationRequested: vi.fn(),
      isCancellationRequested: false
    };

    // Case 1: Empty text
    let chatMock = vi.fn().mockResolvedValue({ text: "" });
    (DeepSeekClient as any).mockImplementation(() => ({ chat: chatMock }));
    let res = await providerInstance.provideInlineCompletionItems(document, position, inlineContext, token);
    expect(res).toBeUndefined();

    // Case 2: DeepSeekAbortError
    chatMock = vi.fn().mockRejectedValue(new DeepSeekAbortError("Request aborted"));
    (DeepSeekClient as any).mockImplementation(() => ({ chat: chatMock }));
    res = await providerInstance.provideInlineCompletionItems(document, position, inlineContext, token);
    expect(res).toBeUndefined();

    // Case 3: Other errors
    chatMock = vi.fn().mockRejectedValue(new Error("API internal error"));
    (DeepSeekClient as any).mockImplementation(() => ({ chat: chatMock }));
    res = await providerInstance.provideInlineCompletionItems(document, position, inlineContext, token);
    expect(res).toBeUndefined();
  });

  it("caches DeepSeekClient per API key and reuses it", async () => {
    mockSecrets["deepseek.apiKey"] = "sk-fakekey";
    const document: any = {
      getText: () => "const x = 1;",
      uri: { fsPath: "/workspace/src/file.ts", scheme: "file" },
      offsetAt: () => 12,
      languageId: "typescript"
    };
    const position = new vscode.Position(0, 12);
    const inlineContext: any = {};
    const token: any = {
      onCancellationRequested: vi.fn(),
      isCancellationRequested: false
    };

    const chatMock = vi.fn().mockResolvedValue({ text: "completion" });
    (DeepSeekClient as any).mockImplementation(() => ({
      chat: chatMock
    }));

    resetInlineCompletionState();

    // Call twice
    await providerInstance.provideInlineCompletionItems(document, position, inlineContext, token);
    await providerInstance.provideInlineCompletionItems(document, position, inlineContext, token);

    expect(DeepSeekClient).toHaveBeenCalledTimes(1);
  });

  it("resets inline completion state (clears cache, aborts request)", async () => {
    mockSecrets["deepseek.apiKey"] = "sk-fakekey";
    const document: any = {
      getText: () => "const x = 1;",
      uri: { fsPath: "/workspace/src/file.ts", scheme: "file" },
      offsetAt: () => 12,
      languageId: "typescript"
    };
    const position = new vscode.Position(0, 12);
    const inlineContext: any = {};
    const token: any = {
      onCancellationRequested: vi.fn(),
      isCancellationRequested: false
    };

    const chatMock = vi.fn().mockResolvedValue({ text: "completion" });
    (DeepSeekClient as any).mockImplementation(() => ({
      chat: chatMock
    }));

    resetInlineCompletionState();

    // Completion 1 -> instantiates client
    await providerInstance.provideInlineCompletionItems(document, position, inlineContext, token);
    expect(DeepSeekClient).toHaveBeenCalledTimes(1);

    // Reset state
    resetInlineCompletionState();

    // Completion 2 -> instantiates new client
    await providerInstance.provideInlineCompletionItems(document, position, inlineContext, token);
    expect(DeepSeekClient).toHaveBeenCalledTimes(2);
  });

  it("aborts in-flight/debounce request when resetInlineCompletionState is called", async () => {
    mockSecrets["deepseek.apiKey"] = "sk-fakekey";
    const document: any = {
      getText: () => "const x = 1;",
      uri: { fsPath: "/workspace/src/file.ts", scheme: "file" },
      offsetAt: () => 12,
      languageId: "typescript"
    };
    const position = new vscode.Position(0, 12);
    const inlineContext: any = {};
    const token: any = {
      onCancellationRequested: vi.fn(),
      isCancellationRequested: false
    };

    const chatMock = vi.fn().mockResolvedValue({ text: "completion" });
    (DeepSeekClient as any).mockImplementation(() => ({
      chat: chatMock
    }));

    // Trigger request
    const p1 = providerInstance.provideInlineCompletionItems(document, position, inlineContext, token);

    // Wait a tiny bit for secrets.get to resolve and debounce phase to start
    await new Promise((r) => setTimeout(r, 10));

    // Call reset state immediately
    resetInlineCompletionState();

    const res = await p1;
    expect(res).toBeUndefined();
    expect(chatMock).not.toHaveBeenCalled();
  });

  it("debounces rapid typing, resulting in a single DeepSeek call", async () => {
    mockSecrets["deepseek.apiKey"] = "sk-fakekey";
    const document: any = {
      getText: () => "const x = 1;",
      uri: { fsPath: "/workspace/src/file.ts", scheme: "file" },
      offsetAt: () => 12,
      languageId: "typescript"
    };
    const position = new vscode.Position(0, 12);
    const inlineContext: any = {};
    const token1: any = {
      onCancellationRequested: vi.fn(),
      isCancellationRequested: false
    };
    const token2: any = {
      onCancellationRequested: vi.fn(),
      isCancellationRequested: false
    };

    const chatMock = vi.fn().mockResolvedValue({ text: "completion" });
    (DeepSeekClient as any).mockImplementation(() => ({
      chat: chatMock
    }));

    // Trigger two requests quickly
    const p1 = providerInstance.provideInlineCompletionItems(document, position, inlineContext, token1);
    await new Promise((r) => setTimeout(r, 50));
    const p2 = providerInstance.provideInlineCompletionItems(document, position, inlineContext, token2);

    const [res1, res2] = await Promise.all([p1, p2]);

    expect(res1).toBeUndefined();
    expect(res2).toBeDefined();

    // Chat should only be called once, because the first request was aborted in debounce
    expect(chatMock).toHaveBeenCalledTimes(1);
  });

  it("excludes sensitive files (.env, credentials, config, ssh, aws, docker, kubeconfig, service-account)", async () => {
    mockSecrets["deepseek.apiKey"] = "sk-fakekey";

    const sensitivePaths = [
      "/workspace/src/.env",
      "/workspace/src/.env.local",
      "/workspace/src/.npmrc",
      "/workspace/src/.yarnrc",
      "/workspace/src/.pypirc",
      "/workspace/src/.netrc",
      "/workspace/src/id_rsa",
      "/workspace/src/id_ed25519",
      "/workspace/src/cert.pem",
      "/workspace/src/app.key",
      "/workspace/src/cert.crt",
      "/workspace/src/cert.p12",
      "/workspace/src/secrets.json",
      "/workspace/src/secrets.yaml",
      "/workspace/src/.aws/credentials",
      "/workspace/src/.aws/config",
      "/workspace/src/.ssh/config",
      "/workspace/src/.ssh/authorized_keys",
      "/workspace/src/credentials",
      "/workspace/src/credentials.json",
      "/workspace/src/credentials.yaml",
      "/workspace/src/credentials.yml",
      "/workspace/src/service-account.json",
      "/workspace/src/service-account-key.json",
      "/workspace/src/kubeconfig",
      "/workspace/src/prod.kubeconfig",
      "/workspace/src/.docker/config.json"
    ];

    const chatMock = vi.fn().mockResolvedValue({ text: "completion" });
    (DeepSeekClient as any).mockImplementation(() => ({
      chat: chatMock
    }));

    for (const p of sensitivePaths) {
      const document: any = {
        getText: () => "const x = 1;",
        uri: { fsPath: p, scheme: "file" },
        offsetAt: () => 12,
        languageId: "typescript"
      };
      const position = new vscode.Position(0, 12);
      const inlineContext: any = {};
      const token: any = {
        onCancellationRequested: vi.fn(),
        isCancellationRequested: false
      };

      const res = await providerInstance.provideInlineCompletionItems(document, position, inlineContext, token);
      expect(res).toBeUndefined();
    }

    expect(chatMock).not.toHaveBeenCalled();
  });

  it("returns undefined if file is outside workspace", async () => {
    mockSecrets["deepseek.apiKey"] = "sk-fakekey";
    const document: any = {
      getText: () => "const x = 1;",
      uri: { fsPath: "/workspace/src/file.ts", scheme: "file" },
      offsetAt: () => 12,
      languageId: "typescript"
    };
    const position = new vscode.Position(0, 12);
    const inlineContext: any = {};
    const token: any = {
      onCancellationRequested: vi.fn(),
      isCancellationRequested: false
    };

    (vscode.workspace.getWorkspaceFolder as any).mockReturnValue(undefined);

    const res = await providerInstance.provideInlineCompletionItems(document, position, inlineContext, token);
    expect(res).toBeUndefined();
    expect(DeepSeekClient).not.toHaveBeenCalled();
  });

  it("ignores non-file schemas and non-code languages (markdown, plaintext)", async () => {
    mockSecrets["deepseek.apiKey"] = "sk-fakekey";

    // Non-file scheme
    const docNonFile: any = {
      getText: () => "const x = 1;",
      uri: { fsPath: "/workspace/src/file.ts", scheme: "untitled" },
      offsetAt: () => 12,
      languageId: "typescript"
    };
    const position = new vscode.Position(0, 12);
    const inlineContext: any = {};
    const token: any = {
      onCancellationRequested: vi.fn(),
      isCancellationRequested: false
    };

    let res = await providerInstance.provideInlineCompletionItems(docNonFile, position, inlineContext, token);
    expect(res).toBeUndefined();

    // Markdown language
    const docMarkdown: any = {
      getText: () => "# Header",
      uri: { fsPath: "/workspace/src/readme.md", scheme: "file" },
      offsetAt: () => 8,
      languageId: "markdown"
    };
    res = await providerInstance.provideInlineCompletionItems(docMarkdown, position, inlineContext, token);
    expect(res).toBeUndefined();
  });

  it("returns undefined if file exceeds 1MB limit", async () => {
    mockSecrets["deepseek.apiKey"] = "sk-fakekey";
    const document: any = {
      getText: () => "a".repeat(1024 * 1024 + 1),
      uri: { fsPath: "/workspace/src/large-file.ts", scheme: "file" },
      offsetAt: () => 12,
      languageId: "typescript"
    };
    const position = new vscode.Position(0, 12);
    const inlineContext: any = {};
    const token: any = {
      onCancellationRequested: vi.fn(),
      isCancellationRequested: false
    };

    const res = await providerInstance.provideInlineCompletionItems(document, position, inlineContext, token);
    expect(res).toBeUndefined();
    expect(DeepSeekClient).not.toHaveBeenCalled();
  });

  it("excludes files in keys, certificates, and credentials directories", async () => {
    mockSecrets["deepseek.apiKey"] = "sk-fakekey";
    const excludedDirs = ["keys", "certificates", "credentials"];
    for (const dir of excludedDirs) {
      const document: any = {
        getText: () => "const x = 1;",
        uri: { fsPath: `/workspace/${dir}/pkg/index.ts`, scheme: "file" },
        offsetAt: () => 0,
        languageId: "typescript"
      };
      const position = new vscode.Position(0, 0);
      const inlineContext: any = {};
      const token: any = {
        onCancellationRequested: vi.fn(),
        isCancellationRequested: false
      };

      const res = await providerInstance.provideInlineCompletionItems(
        document,
        position,
        inlineContext,
        token
      );
      expect(res).toBeUndefined();
    }
  });
});
