import { describe, expect, it } from "vitest";
import {
  MODEL_MAP,
  redactSecrets,
  resolveModelIds,
  routeTask,
  shouldEscalateToPro
} from "../src/index.js";

describe("routeTask", () => {
  it("routes write tasks to flash", () => {
    expect(routeTask("tab")).toBe("write");
    expect(routeTask("inline-edit")).toBe("write");
    expect(routeTask("small-write")).toBe("write");
  });

  it("routes all other tasks to pro think", () => {
    expect(routeTask("chat")).toBe("think");
    expect(routeTask("agent")).toBe("think");
    expect(routeTask("debug")).toBe("think");
  });
});

describe("escalation", () => {
  it("escalates for multi-file and failed tests", () => {
    expect(
      shouldEscalateToPro({ task: "chat", touchedFiles: 2, testsFailed: false })
    ).toBe(true);
    expect(
      shouldEscalateToPro({ task: "chat", touchedFiles: 1, testsFailed: true })
    ).toBe(true);
  });

  it("defaults to pro for architecture-grade tasks", () => {
    expect(
      shouldEscalateToPro({ task: "refactor", touchedFiles: 1, testsFailed: false })
    ).toBe(true);
  });
});

describe("constants", () => {
  it("keeps only deepseek models", () => {
    expect(MODEL_MAP.pro).toContain("deepseek");
    expect(MODEL_MAP.flash).toContain("deepseek");
  });

  it("resolves v4 models when present", () => {
    const r = resolveModelIds([MODEL_MAP.pro, MODEL_MAP.flash]);
    expect(r.usedAlias).toBe(false);
    expect(r.pro).toBe(MODEL_MAP.pro);
  });

  it("falls back to aliases when only legacy ids are present", () => {
    const r = resolveModelIds([MODEL_MAP.aliasPro, MODEL_MAP.aliasFlash]);
    expect(r.usedAlias).toBe(true);
    expect(r.pro).toBe(MODEL_MAP.aliasPro);
  });
});

describe("redaction", () => {
  it("redacts known secret formats", () => {
    const text = "sk-abc123 ghp_01234567890123456789 github_pat_xxxxxxxxxxxxxxxxxxxx";
    const out = redactSecrets(text);
    expect(out).not.toContain("sk-abc123");
    expect(out).not.toContain("ghp_01234567890123456789");
    expect(out).toContain("[REDACTED]");
  });
});

describe("key validation", () => {
  it("documents missing key behavior", async () => {
    const { DeepSeekClient } = await import("../src/index.js");
    expect(() => new DeepSeekClient("")).toThrowError(/Missing DeepSeek API key/);
  });
});

describe("v1 exclusions", () => {
  it("does not mention anthropic or fim beta", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(resolve(process.cwd(), "src/index.ts"), "utf8").toLowerCase();
    expect(src).not.toContain("anthropic");
    expect(src).not.toContain("fim");
  });
});
