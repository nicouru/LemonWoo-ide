import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DeepSeekAbortError,
  DeepSeekAuthError,
  DeepSeekClient,
  DeepSeekError,
  DeepSeekRateLimitError,
  DeepSeekServerError,
  MODEL_MAP
} from "../src/index.js";

const FAKE_KEY = "sk-fakeLocalTestKey_1234567890";

interface FetchCall {
  url: string;
  method: string | undefined;
  body: string | undefined;
  headers: Record<string, string>;
  signal: AbortSignal | undefined;
}

interface MockHandle {
  fetch: typeof fetch;
  calls: FetchCall[];
  enqueueResponse: (r: Response) => void;
  enqueueError: (e: Error) => void;
  enqueueRaw: (item: Response | Error | ((req: FetchCall) => Response | Promise<Response> | Error)) => void;
}

function modelsResponse(ids: string[] = [MODEL_MAP.pro, MODEL_MAP.flash]): Response {
  return new Response(
    JSON.stringify({
      object: "list",
      data: ids.map((id) => ({ id, object: "model", owned_by: "deepseek" }))
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

function chatResponse(content: string, modelId = MODEL_MAP.flash): Response {
  return new Response(
    JSON.stringify({
      id: "chatcmpl-test",
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: modelId,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content },
          finish_reason: "stop"
        }
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

function errorResponse(status: number, body: object, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers }
  });
}

function createFetchMock(): MockHandle {
  const calls: FetchCall[] = [];
  const queue: Array<Response | Error | ((req: FetchCall) => Response | Promise<Response> | Error)> = [];
  const mock = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const urlStr =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    const headers: Record<string, string> = {};
    const initHeaders = init?.headers;
    if (initHeaders) {
      if (Array.isArray(initHeaders)) {
        for (const [k, v] of initHeaders) headers[k.toLowerCase()] = v;
      } else if (typeof (initHeaders as Headers).forEach === "function") {
        (initHeaders as Headers).forEach((v, k) => {
          headers[k.toLowerCase()] = v;
        });
      } else {
        for (const [k, v] of Object.entries(initHeaders as Record<string, string>)) {
          headers[k.toLowerCase()] = v;
        }
      }
    }
    const call: FetchCall = {
      url: urlStr,
      method: init?.method,
      body: typeof init?.body === "string" ? init.body : undefined,
      headers,
      signal: init?.signal ?? undefined
    };
    calls.push(call);
    if (init?.signal?.aborted) {
      throw new DOMException("Aborted by caller before send", "AbortError");
    }
    const next = queue.shift();
    if (next === undefined) {
      throw new Error(`fetch mock queue empty (call ${calls.length}, url ${urlStr})`);
    }
    if (typeof next === "function") {
      const v = await next(call);
      if (v instanceof Error) throw v;
      return v;
    }
    if (next instanceof Error) throw next;
    return next;
  };
  return {
    fetch: mock as unknown as typeof fetch,
    calls,
    enqueueResponse: (r) => queue.push(r),
    enqueueError: (e) => queue.push(e),
    enqueueRaw: (item) => queue.push(item)
  };
}

function makeClient(overrides: Partial<ConstructorParameters<typeof DeepSeekClient>[0]> = {}) {
  const mock = createFetchMock();
  const client = new DeepSeekClient({
    apiKey: FAKE_KEY,
    fetch: mock.fetch,
    proTimeoutMs: 200,
    flashTimeoutMs: 200,
    maxRetries: 3,
    retryBaseDelayMs: 5,
    retryMaxDelayMs: 20,
    modelsCacheTtlMs: 60_000,
    ...overrides
  });
  return { client, mock };
}

describe("DeepSeekClient constructor", () => {
  it("throws DeepSeekError when API key is missing", () => {
    expect(() => new DeepSeekClient({ apiKey: "" })).toThrow(DeepSeekError);
    // @ts-expect-error - probing runtime guard
    expect(() => new DeepSeekClient(undefined)).toThrow(DeepSeekError);
  });

  it("getRedactedKey() never returns the literal key", () => {
    const { client } = makeClient();
    expect(client.getRedactedKey()).not.toContain(FAKE_KEY);
    expect(client.getRedactedKey()).toContain("[REDACTED]");
  });
});

describe("DeepSeekClient.validateKey", () => {
  it("returns 'valid' with resolved V4 models on success", async () => {
    const { client, mock } = makeClient();
    mock.enqueueResponse(modelsResponse());
    const r = await client.validateKey();
    expect(r.status).toBe("valid");
    expect(r.models?.pro).toBe(MODEL_MAP.pro);
    expect(r.models?.usedAlias).toBe(false);
  });

  it("returns 'valid' with usedAlias=true when only legacy aliases exist", async () => {
    const { client, mock } = makeClient();
    mock.enqueueResponse(
      modelsResponse([MODEL_MAP.aliasPro, MODEL_MAP.aliasFlash])
    );
    const r = await client.validateKey();
    expect(r.status).toBe("valid");
    expect(r.models?.usedAlias).toBe(true);
  });

  it("returns 'models-unavailable' when neither V4 nor aliases are present", async () => {
    const { client, mock } = makeClient();
    mock.enqueueResponse(modelsResponse(["random-other-model"]));
    const r = await client.validateKey();
    expect(r.status).toBe("models-unavailable");
  });

  it("returns 'invalid' on 401", async () => {
    const { client, mock } = makeClient();
    mock.enqueueResponse(
      errorResponse(401, { error: { message: "bad key", type: "auth" } })
    );
    const r = await client.validateKey();
    expect(r.status).toBe("invalid");
  });

  it("returns 'rate-limited' on 429", async () => {
    const { client, mock } = makeClient({ maxRetries: 1 });
    mock.enqueueResponse(
      errorResponse(429, { error: { message: "slow down" } })
    );
    const r = await client.validateKey();
    expect(r.status).toBe("rate-limited");
  });
});

describe("DeepSeekClient.chat happy path", () => {
  it("returns text, mode, modelLabel and usage", async () => {
    const { client, mock } = makeClient();
    mock.enqueueResponse(modelsResponse());
    mock.enqueueResponse(chatResponse("hello"));

    const r = await client.chat({
      task: "tab",
      build: {
        systemPrompt: "sys",
        userInput: "say hello"
      }
    });
    expect(r.text).toBe("hello");
    expect(r.mode).toBe("write");
    expect(r.modelLabel).toBe("flash");
    expect(r.modelId).toBe(MODEL_MAP.flash);
    expect(r.usedAlias).toBe(false);
    expect(r.usage?.totalTokens).toBe(15);
  });

  it("routes 'chat' tasks to Pro think", async () => {
    const { client, mock } = makeClient();
    mock.enqueueResponse(modelsResponse());
    mock.enqueueResponse(chatResponse("ok", MODEL_MAP.pro));
    const r = await client.chat({
      task: "chat",
      messages: [{ role: "user", content: "hi" }]
    });
    expect(r.mode).toBe("think");
    expect(r.modelLabel).toBe("pro");
    expect(r.modelId).toBe(MODEL_MAP.pro);
  });

  it("forwards messages verbatim when provided", async () => {
    const { client, mock } = makeClient();
    mock.enqueueResponse(modelsResponse());
    mock.enqueueResponse(chatResponse("ok"));
    await client.chat({
      task: "tab",
      messages: [
        { role: "system", content: "S" },
        { role: "user", content: "U" }
      ]
    });
    const chatCall = mock.calls.find((c) => c.url.includes("/chat/completions"));
    const body = chatCall?.body ? JSON.parse(chatCall.body) : undefined;
    expect(body?.messages).toEqual([
      { role: "system", content: "S" },
      { role: "user", content: "U" }
    ]);
    expect(body?.stream).toBe(false);
  });

  it("throws when neither messages nor build is provided", async () => {
    const { client, mock } = makeClient();
    mock.enqueueResponse(modelsResponse());
    await expect(client.chat({ task: "tab" })).rejects.toThrow(DeepSeekError);
  });
});

describe("DeepSeekClient /models caching", () => {
  it("calls /models exactly once across two chats", async () => {
    const { client, mock } = makeClient();
    mock.enqueueResponse(modelsResponse());
    mock.enqueueResponse(chatResponse("one"));
    mock.enqueueResponse(chatResponse("two"));

    await client.chat({
      task: "tab",
      build: { systemPrompt: "s", userInput: "1" }
    });
    await client.chat({
      task: "tab",
      build: { systemPrompt: "s", userInput: "2" }
    });

    const modelsHits = mock.calls.filter((c) => c.url.endsWith("/models")).length;
    expect(modelsHits).toBe(1);
  });

  it("resetModelsCache forces a refetch on the next request", async () => {
    const { client, mock } = makeClient();
    mock.enqueueResponse(modelsResponse());
    mock.enqueueResponse(chatResponse("one"));
    mock.enqueueResponse(modelsResponse());
    mock.enqueueResponse(chatResponse("two"));

    await client.chat({
      task: "tab",
      build: { systemPrompt: "s", userInput: "1" }
    });
    client.resetModelsCache();
    await client.chat({
      task: "tab",
      build: { systemPrompt: "s", userInput: "2" }
    });

    const modelsHits = mock.calls.filter((c) => c.url.endsWith("/models")).length;
    expect(modelsHits).toBe(2);
  });
});

describe("DeepSeekClient retry policy", () => {
  it("retries on 429 then succeeds", async () => {
    const { client, mock } = makeClient();
    mock.enqueueResponse(modelsResponse());
    mock.enqueueResponse(errorResponse(429, { error: { message: "ratelim" } }, { "retry-after": "0" }));
    mock.enqueueResponse(chatResponse("ok"));

    const r = await client.chat({
      task: "tab",
      build: { systemPrompt: "s", userInput: "hi" }
    });
    expect(r.text).toBe("ok");
    const chatHits = mock.calls.filter((c) => c.url.includes("/chat/completions")).length;
    expect(chatHits).toBe(2);
  });

  it("retries on 503 then succeeds", async () => {
    const { client, mock } = makeClient();
    mock.enqueueResponse(modelsResponse());
    mock.enqueueResponse(errorResponse(503, { error: { message: "unavailable" } }));
    mock.enqueueResponse(chatResponse("ok"));

    const r = await client.chat({
      task: "tab",
      build: { systemPrompt: "s", userInput: "hi" }
    });
    expect(r.text).toBe("ok");
  });

  it("gives up after maxRetries and throws DeepSeekServerError", async () => {
    const { client, mock } = makeClient({ maxRetries: 2 });
    mock.enqueueResponse(modelsResponse());
    mock.enqueueResponse(errorResponse(503, { error: { message: "down" } }));
    mock.enqueueResponse(errorResponse(503, { error: { message: "still down" } }));

    await expect(
      client.chat({
        task: "tab",
        build: { systemPrompt: "s", userInput: "hi" }
      })
    ).rejects.toBeInstanceOf(DeepSeekServerError);
  });

  it("never retries on 401 / auth", async () => {
    const { client, mock } = makeClient();
    mock.enqueueResponse(modelsResponse());
    mock.enqueueResponse(errorResponse(401, { error: { message: "bad key" } }));

    await expect(
      client.chat({
        task: "tab",
        build: { systemPrompt: "s", userInput: "hi" }
      })
    ).rejects.toBeInstanceOf(DeepSeekAuthError);
    const chatHits = mock.calls.filter((c) => c.url.includes("/chat/completions")).length;
    expect(chatHits).toBe(1);
  });
});

describe("DeepSeekClient redaction in errors", () => {
  it("never includes the literal API key in the thrown message, even when the server echoes it", async () => {
    const { client, mock } = makeClient({ maxRetries: 1 });
    mock.enqueueResponse(modelsResponse());
    mock.enqueueResponse(
      errorResponse(401, {
        error: { message: `Invalid token: ${FAKE_KEY}` }
      })
    );

    try {
      await client.chat({
        task: "tab",
        build: { systemPrompt: "s", userInput: "hi" }
      });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DeepSeekAuthError);
      const msg = (err as Error).message;
      expect(msg).not.toContain(FAKE_KEY);
    }
  });
});

describe("DeepSeekClient abort and timeout", () => {
  it("propagates a user AbortSignal as DeepSeekAbortError", async () => {
    const { client, mock } = makeClient();
    mock.enqueueResponse(modelsResponse());
    // Hang the chat response forever so abort wins.
    mock.enqueueRaw(
      () =>
        new Promise<Response>((_resolve, reject) => {
          // Never resolves on its own. We rely on the outer signal aborting
          // via the openai SDK forwarding it to the fake fetch.
          // openai SDK passes init.signal; once aborted, fetch should throw.
          // But our mock returns a Promise — we wire a handler below.
          setTimeout(() => reject(new DOMException("Aborted", "AbortError")), 50);
        })
    );

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 5);

    await expect(
      client.chat({
        task: "tab",
        build: { systemPrompt: "s", userInput: "hi" },
        signal: controller.signal
      })
    ).rejects.toBeInstanceOf(DeepSeekAbortError);
  });

  it("times out long requests as DeepSeekTimeoutError", async () => {
    const { client, mock } = makeClient({
      proTimeoutMs: 30,
      flashTimeoutMs: 30,
      maxRetries: 1
    });
    mock.enqueueResponse(modelsResponse());
    mock.enqueueRaw(
      () =>
        new Promise<Response>((_resolve, reject) => {
          setTimeout(() => reject(new DOMException("Aborted", "AbortError")), 80);
        })
    );

    await expect(
      client.chat({
        task: "tab",
        build: { systemPrompt: "s", userInput: "hi" }
      })
    ).rejects.toMatchObject({ name: "DeepSeekTimeoutError" });
  });
});

describe("DeepSeekClient rate-limit retry-after", () => {
  it("respects retry-after seconds from 429", async () => {
    const { client, mock } = makeClient({
      retryBaseDelayMs: 5,
      retryMaxDelayMs: 200,
      maxRetries: 2
    });
    mock.enqueueResponse(modelsResponse());
    mock.enqueueResponse(
      errorResponse(429, { error: { message: "rl" } }, { "retry-after": "1" })
    );
    mock.enqueueResponse(chatResponse("ok"));

    const t0 = Date.now();
    const r = await client.chat({
      task: "tab",
      build: { systemPrompt: "s", userInput: "hi" }
    });
    const elapsed = Date.now() - t0;
    expect(r.text).toBe("ok");
    // Retry-After 1 second => clamped by retryMaxDelayMs (200ms) in our test client.
    expect(elapsed).toBeGreaterThanOrEqual(150);
  });
});

describe("DeepSeekClient stream", () => {
  it("yields content deltas in order", async () => {
    const { client, mock } = makeClient();
    mock.enqueueResponse(modelsResponse());

    const chunks = [
      'data: {"id":"x","choices":[{"index":0,"delta":{"content":"Hello"}}]}\n\n',
      'data: {"id":"x","choices":[{"index":0,"delta":{"content":" world"}}]}\n\n',
      "data: [DONE]\n\n"
    ];
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) controller.enqueue(encoder.encode(c));
        controller.close();
      }
    });
    mock.enqueueResponse(
      new Response(body, {
        status: 200,
        headers: { "content-type": "text/event-stream" }
      })
    );

    const out: string[] = [];
    for await (const piece of client.chatStream({
      task: "tab",
      build: { systemPrompt: "s", userInput: "hi" }
    })) {
      out.push(piece);
    }
    expect(out.join("")).toBe("Hello world");
  });
});

describe("DeepSeekClient request shape", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("sends authorization header derived from the configured key", async () => {
    const { client, mock } = makeClient();
    mock.enqueueResponse(modelsResponse());
    mock.enqueueResponse(chatResponse("ok"));

    await client.chat({
      task: "tab",
      build: { systemPrompt: "s", userInput: "hi" }
    });

    const chatCall = mock.calls.find((c) => c.url.includes("/chat/completions"));
    expect(chatCall?.headers.authorization).toContain(FAKE_KEY);
  });

  it("does not point at the Anthropic-compat endpoint", async () => {
    const { client, mock } = makeClient();
    mock.enqueueResponse(modelsResponse());
    mock.enqueueResponse(chatResponse("ok"));

    await client.chat({
      task: "tab",
      build: { systemPrompt: "s", userInput: "hi" }
    });

    for (const c of mock.calls) {
      expect(c.url).not.toContain("/anthropic");
    }
  });
});
