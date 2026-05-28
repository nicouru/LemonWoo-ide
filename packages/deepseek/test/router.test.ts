import { describe, expect, it } from "vitest";
import {
  MODEL_MAP,
  resolveModelIds,
  routeTask,
  shouldEscalateToPro
} from "../src/router.js";

describe("routeTask", () => {
  it("routes write tasks to flash", () => {
    expect(routeTask("tab")).toBe("write");
    expect(routeTask("inline-edit")).toBe("write");
    expect(routeTask("small-write")).toBe("write");
  });

  it("routes all other tasks to think", () => {
    expect(routeTask("chat")).toBe("think");
    expect(routeTask("agent")).toBe("think");
    expect(routeTask("debug")).toBe("think");
    expect(routeTask("refactor")).toBe("think");
    expect(routeTask("verify")).toBe("think");
  });
});

describe("shouldEscalateToPro", () => {
  it("escalates intrinsic Pro tasks unconditionally", () => {
    for (const task of ["agent", "debug", "refactor", "verify"] as const) {
      expect(
        shouldEscalateToPro({ task, touchedFiles: 1, testsFailed: false })
      ).toBe(true);
    }
  });

  it("escalates when more than one file is touched", () => {
    expect(
      shouldEscalateToPro({ task: "chat", touchedFiles: 2, testsFailed: false })
    ).toBe(true);
  });

  it("escalates on failed tests", () => {
    expect(
      shouldEscalateToPro({ task: "chat", touchedFiles: 1, testsFailed: true })
    ).toBe(true);
  });

  it("escalates on user diff rejection or non-trivial errors", () => {
    expect(
      shouldEscalateToPro({
        task: "chat",
        touchedFiles: 1,
        userRejectedDiff: true
      })
    ).toBe(true);
    expect(
      shouldEscalateToPro({
        task: "chat",
        touchedFiles: 1,
        hasNonTrivialError: true
      })
    ).toBe(true);
  });

  it("does not escalate for simple, successful single-file write tasks", () => {
    expect(
      shouldEscalateToPro({
        task: "tab",
        touchedFiles: 1,
        testsFailed: false,
        userRejectedDiff: false,
        hasNonTrivialError: false
      })
    ).toBe(false);
    expect(
      shouldEscalateToPro({
        task: "inline-edit",
        touchedFiles: 1
      })
    ).toBe(false);
  });
});

describe("MODEL_MAP & resolveModelIds", () => {
  it("only references deepseek model ids", () => {
    for (const id of Object.values(MODEL_MAP)) {
      expect(id).toMatch(/^deepseek-/);
    }
  });

  it("resolves V4 ids when both are present", () => {
    const r = resolveModelIds([MODEL_MAP.pro, MODEL_MAP.flash, "extra-model"]);
    expect(r).toEqual({
      pro: MODEL_MAP.pro,
      flash: MODEL_MAP.flash,
      usedAlias: false
    });
  });

  it("falls back to legacy aliases when V4 ids are missing", () => {
    const r = resolveModelIds([MODEL_MAP.aliasPro, MODEL_MAP.aliasFlash]);
    expect(r).toEqual({
      pro: MODEL_MAP.aliasPro,
      flash: MODEL_MAP.aliasFlash,
      usedAlias: true
    });
  });

  it("prefers V4 over aliases when both sets are present", () => {
    const r = resolveModelIds([
      MODEL_MAP.pro,
      MODEL_MAP.flash,
      MODEL_MAP.aliasPro,
      MODEL_MAP.aliasFlash
    ]);
    expect(r.usedAlias).toBe(false);
  });

  it("returns V4 ids when nothing matches (caller can decide to throw)", () => {
    const r = resolveModelIds(["something-else"]);
    expect(r).toEqual({
      pro: MODEL_MAP.pro,
      flash: MODEL_MAP.flash,
      usedAlias: false
    });
  });
});
