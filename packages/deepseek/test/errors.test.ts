import { describe, expect, it } from "vitest";
import {
  DeepSeekAbortError,
  DeepSeekAuthError,
  DeepSeekError,
  DeepSeekModelsUnavailableError,
  DeepSeekNetworkError,
  DeepSeekRateLimitError,
  DeepSeekServerError,
  DeepSeekTimeoutError
} from "../src/errors.js";

describe("DeepSeekError hierarchy", () => {
  it("all subclasses are instanceof DeepSeekError and Error", () => {
    const errs: DeepSeekError[] = [
      new DeepSeekError("base"),
      new DeepSeekAuthError("auth"),
      new DeepSeekRateLimitError("rate", { retryAfterMs: 1000 }),
      new DeepSeekServerError("server", { status: 503 }),
      new DeepSeekTimeoutError("timeout"),
      new DeepSeekAbortError("abort"),
      new DeepSeekNetworkError("network"),
      new DeepSeekModelsUnavailableError("models", { available: ["x"] })
    ];
    for (const e of errs) {
      expect(e).toBeInstanceOf(DeepSeekError);
      expect(e).toBeInstanceOf(Error);
    }
  });

  it("preserves discriminating .name values", () => {
    expect(new DeepSeekError("x").name).toBe("DeepSeekError");
    expect(new DeepSeekAuthError("x").name).toBe("DeepSeekAuthError");
    expect(new DeepSeekRateLimitError("x").name).toBe("DeepSeekRateLimitError");
    expect(new DeepSeekServerError("x", { status: 500 }).name).toBe(
      "DeepSeekServerError"
    );
    expect(new DeepSeekTimeoutError("x").name).toBe("DeepSeekTimeoutError");
    expect(new DeepSeekAbortError("x").name).toBe("DeepSeekAbortError");
    expect(new DeepSeekNetworkError("x").name).toBe("DeepSeekNetworkError");
    expect(
      new DeepSeekModelsUnavailableError("x", { available: [] }).name
    ).toBe("DeepSeekModelsUnavailableError");
  });

  it("captures rate-limit retry hint and server status", () => {
    const rl = new DeepSeekRateLimitError("rate", { retryAfterMs: 1500 });
    expect(rl.retryAfterMs).toBe(1500);
    const srv = new DeepSeekServerError("oops", { status: 502 });
    expect(srv.status).toBe(502);
  });

  it("captures cause when provided", () => {
    const root = new Error("root cause");
    const err = new DeepSeekServerError("wrap", { status: 503, cause: root });
    expect((err as { cause?: unknown }).cause).toBe(root);
  });

  it("models-unavailable retains available ids snapshot", () => {
    const err = new DeepSeekModelsUnavailableError("nope", {
      available: ["deepseek-chat", "deepseek-reasoner"]
    });
    expect(err.available).toEqual(["deepseek-chat", "deepseek-reasoner"]);
  });
});
