import { describe, expect, it, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import { registerInlineCompletionProvider } from "../src/inlineCompletion.js";
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
  });

  it("returns undefined and does not query DeepSeek if API key is missing", async () => {
    const document: any = {
      getText: () => "const x = 1;",
      uri: { fsPath: "/workspace/src/file.ts" },
      offsetAt: () => 0
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
      uri: { fsPath: "/workspace/src/file.ts" },
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
      uri: { fsPath: "/workspace/node_modules/pkg/index.ts" },
      offsetAt: () => 0,
      languageId: "typescript"
    };
    const position = new vscode.Position(0, 0);
    const inlineContext: any = {};
    const token: any = {
      onCancellationRequested: vi.fn(),
      isCancellationRequested: false
    };

    // Stub getWorkspaceFolder to simulate path relative resolution
    (vscode.workspace.getWorkspaceFolder as any).mockReturnValue({
      uri: { fsPath: "/workspace" }
    });

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
      uri: { fsPath: "/workspace/src/file.ts" },
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

  it("cancels previous request when a new completion is triggered (debounce)", async () => {
    mockSecrets["deepseek.apiKey"] = "sk-fakekey";

    const document: any = {
      getText: () => "const x = 1;",
      uri: { fsPath: "/workspace/src/file.ts" },
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

    // Trigger second request immediately
    const p2 = providerInstance.provideInlineCompletionItems(
      document,
      position,
      inlineContext,
      token2
    );

    await Promise.all([p1, p2]);

    // The first request's abort signal should be aborted
    const signal1 = chatMock.mock.calls[0][0].signal;
    const signal2 = chatMock.mock.calls[1][0].signal;

    expect(signal1.aborted).toBe(true);
    expect(signal2.aborted).toBe(false);
  });

  it("handles empty response, cancellation, and errors gracefully", async () => {
    mockSecrets["deepseek.apiKey"] = "sk-fakekey";

    const document: any = {
      getText: () => "const x = 1;",
      uri: { fsPath: "/workspace/src/file.ts" },
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
});
