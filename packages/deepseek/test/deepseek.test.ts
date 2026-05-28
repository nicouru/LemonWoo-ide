import { describe, expect, it } from "vitest";
import * as api from "../src/index.js";

/**
 * Stability test: pins the public surface of `@lemonwoo/deepseek`.
 *
 * Detailed behavior lives in the dedicated `router.test.ts`, `redact.test.ts`,
 * `messages.test.ts`, `errors.test.ts`, `client.test.ts` and
 * `exclusions.test.ts` files. This file only protects the exports.
 */

describe("public surface", () => {
  it("exports the documented runtime values", () => {
    expect(typeof api.DeepSeekClient).toBe("function");
    expect(typeof api.routeTask).toBe("function");
    expect(typeof api.shouldEscalateToPro).toBe("function");
    expect(typeof api.resolveModelIds).toBe("function");
    expect(typeof api.redactSecrets).toBe("function");
    expect(typeof api.buildMessages).toBe("function");
    expect(typeof api.MODEL_MAP).toBe("object");
  });

  it("exports the documented error classes", () => {
    expect(typeof api.DeepSeekError).toBe("function");
    expect(typeof api.DeepSeekAuthError).toBe("function");
    expect(typeof api.DeepSeekRateLimitError).toBe("function");
    expect(typeof api.DeepSeekServerError).toBe("function");
    expect(typeof api.DeepSeekTimeoutError).toBe("function");
    expect(typeof api.DeepSeekAbortError).toBe("function");
    expect(typeof api.DeepSeekNetworkError).toBe("function");
    expect(typeof api.DeepSeekModelsUnavailableError).toBe("function");
  });

  it("error subclasses inherit from DeepSeekError", () => {
    expect(api.DeepSeekAuthError.prototype).toBeInstanceOf(api.DeepSeekError);
    expect(api.DeepSeekRateLimitError.prototype).toBeInstanceOf(
      api.DeepSeekError
    );
  });
});
