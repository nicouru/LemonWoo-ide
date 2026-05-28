import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildLemonwooDeepSeekConfig } from "../src/opencodeConfig.js";
import { resolveOpencodeBinary } from "../src/opencodeBinary.js";

describe("opencodeBinary", () => {
  it("resolveOpencodeBinary returns actionable hint when missing", () => {
    const resolution = resolveOpencodeBinary();
    if (!resolution.found) {
      expect(resolution.hint).toMatch(/opencode-ai|OPENCODE_BIN|pnpm dlx/i);
    }
  });

  it("exposes prependOpencodeToPath for SDK spawn resolution", () => {
    const src = readFileSync(resolve(process.cwd(), "src/opencodeBinary.ts"), "utf8");
    expect(src).toContain("resolveOpencodeBinary");
    expect(src).toContain("prependOpencodeToPath");
  });

  it("prefers an opencode command shim because the SDK spawns by command name", () => {
    const src = readFileSync(resolve(process.cwd(), "src/opencodeBinary.ts"), "utf8");
    expect(src).toContain('const shimName = process.platform === "win32" ? "opencode.cmd" : "opencode"');
    expect(src.indexOf("node_modules\", \".bin\", shimName")).toBeLessThan(src.indexOf("\"bin\", \"opencode.exe\""));
  });
});

describe("opencodeConfig", () => {
  it("buildLemonwooDeepSeekConfig uses env template and hides OpenCode Zen", () => {
    const prev = process.env.DEEPSEEK_API_KEY;
    process.env.DEEPSEEK_API_KEY = "sk-test";
    const config = buildLemonwooDeepSeekConfig();
    process.env.DEEPSEEK_API_KEY = prev;
    expect(config).toMatchObject({
      model: "deepseek/deepseek-chat",
      disabled_providers: ["opencode"]
    });
    expect(JSON.stringify(config)).toContain("{env:DEEPSEEK_API_KEY}");
    expect(JSON.stringify(config)).not.toContain("sk-test");
  });
});

describe("opencodeSpike source", () => {
  it("formatHarnessReport lists structured checks", () => {
    const src = readFileSync(resolve(process.cwd(), "src/opencodeSpike.ts"), "utf8");
    expect(src).toContain("SDK_IMPORT:");
    expect(src).toContain("CLI_AVAILABLE:");
    expect(src).toContain("FIXTURE_MULTI_FILE:");
  });
});

describe("runtime harness independence", () => {
  it("runAgentTask does not import external harness spike", () => {
    const src = readFileSync(resolve(process.cwd(), "src/runAgentTask.ts"), "utf8");
    expect(src).not.toMatch(/from\s+["'].*opencode/i);
    expect(src).toContain("runAgentLoop");
  });

  it("index.ts default exports omit external harness wiring", () => {
    const src = readFileSync(resolve(process.cwd(), "src/index.ts"), "utf8");
    expect(src).not.toMatch(/from\s+["'].*opencode/i);
  });
});
