import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { withSecretBackedDeepSeekEnv, DEEPSEEK_SECRET_KEY } from "../src/deepSeekSecrets.js";

describe("deepSeekSecrets", () => {
  const prevEnv = process.env.DEEPSEEK_API_KEY;

  afterEach(() => {
    if (prevEnv === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = prevEnv;
  });

  it("uses DEEPSEEK_SECRET_KEY constant", () => {
    expect(DEEPSEEK_SECRET_KEY).toBe("deepseek.apiKey");
  });

  it("returns missing-key when SecretStorage empty", async () => {
    const context = {
      secrets: { get: vi.fn(async () => undefined) }
    } as any;
    const result = await withSecretBackedDeepSeekEnv(context, async () => "ok");
    expect(result.status).toBe("missing-key");
  });

  it("sets and restores env around fn", async () => {
    process.env.DEEPSEEK_API_KEY = "previous";
    const context = {
      secrets: { get: vi.fn(async () => "sk-test-secret-value") }
    } as any;
    const result = await withSecretBackedDeepSeekEnv(context, async () => {
      expect(process.env.DEEPSEEK_API_KEY).toBe("sk-test-secret-value");
      return 42;
    });
    expect(result).toEqual({ status: "ok", value: 42 });
    expect(process.env.DEEPSEEK_API_KEY).toBe("previous");
  });

  it("redacts key from error messages", async () => {
    const context = {
      secrets: { get: vi.fn(async () => "sk-test-secret-value") }
    } as any;
    const result = await withSecretBackedDeepSeekEnv(context, async () => {
      throw new Error("failed sk-test-secret-value");
    });
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).not.toContain("sk-test-secret-value");
      expect(result.message).toContain("[REDACTED]");
    }
  });
});
