import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatAgentWarning,
  toolDoneLine,
  toolStartStatus
} from "../src/toolEventLines.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensionSrc = readFileSync(resolve(__dirname, "../src/extension.ts"), "utf8");

describe("toolEventLines", () => {
  it("maps tool start to concise Spanish status labels", () => {
    expect(toolStartStatus({ tool: "read_file", phase: "start", args: { path: "src/a.ts" } })).toBe(
      "Leyendo archivo"
    );
    expect(toolStartStatus({ tool: "search", phase: "start", args: { query: "foo" } })).toBe("Buscando");
    expect(toolStartStatus({ tool: "test_gate", phase: "start" })).toBe("Verificando");
    expect(toolStartStatus({ tool: "run_terminal", phase: "start" })).toBe("Ejecutando comando");
    expect(toolStartStatus({ tool: "start_preview_server", phase: "start" })).toBe("Levantando servidor");
  });

  it("formats done lines without internal tool names or raw output", () => {
    const readLine = toolDoneLine({
      tool: "read_file",
      phase: "done",
      args: { path: "src/invoice.ts" },
      summary: "export function invoice() {}"
    });
    expect(readLine).toContain("Leyó");
    expect(readLine).not.toContain("read_file");
    expect(readLine).not.toContain("export function");

    const searchLine = toolDoneLine({
      tool: "search",
      phase: "done",
      args: { query: "tax rate" },
      summary: "src/tax.js:10:const rate\nsrc/invoice.js:2:rate"
    });
    expect(searchLine).toMatch(/Buscó/);
    expect(searchLine).not.toContain("search");
    expect(searchLine).not.toContain("src/tax.js");

    const testLine = toolDoneLine({
      tool: "test_gate",
      phase: "done",
      summary: "TestGate PASS (120ms)\nCommands: npm test"
    });
    expect(testLine).toBe("↳ Tests pasaron");
    expect(testLine).not.toMatch(/TestGate|test_gate/i);
  });

  it("skips preview tool done lines (previewBox handles preview)", () => {
    expect(
      toolDoneLine({
        tool: "start_preview_server",
        phase: "done",
        summary: "Preview server ready.\nURL: http://127.0.0.1:4173"
      })
    ).toBeNull();
    expect(toolDoneLine({ tool: "stop_preview_server", phase: "done", summary: "stopped" })).toBeNull();
  });

  it("formats confirmation warnings without duplicate jargon", () => {
    expect(formatAgentWarning("Comando requiere confirmación: npm install foo")).toContain(
      "no se ejecutó automáticamente"
    );
  });
});

describe("extension tool event wiring", () => {
  it("uses toolEventLines instead of raw tool names in the stream", () => {
    expect(extensionSrc).toContain("toolDoneLine");
    expect(extensionSrc).toContain("toolStartStatus");
    expect(extensionSrc).not.toMatch(/lastStreamed \+= `\\n• \$\{event\.tool\}/);
    expect(extensionSrc).not.toMatch(/event\.tool\}: \$\{event\.summary/);
  });

  it("routes warnings through formatAgentWarning once", () => {
    expect(extensionSrc).toContain("formatAgentWarning(event.text)");
    expect(extensionSrc).not.toMatch(
      /formatAgentWarning[\s\S]{0,400}requiere confirmación[\s\S]{0,200}formatAgentWarning/
    );
  });

  it("tool activity posts stream messages without touching previewBox", () => {
    expect(extensionSrc).toContain('type: "stream"');
    expect(extensionSrc).toContain("toolDoneLine(event)");
    expect(extensionSrc).not.toMatch(/toolDoneLine[\s\S]{0,500}previewBox/);
    expect(extensionSrc).toMatch(/if \(m\.type === 'stream'\)[\s\S]{0,200}getElementById\('out'\)/);
  });

  it("status and stream handlers stay separate from previewBox", () => {
    expect(extensionSrc).toMatch(/if \(m\.type === 'stream'\)[\s\S]{0,200}getElementById\('out'\)/);
    expect(extensionSrc).toMatch(/if \(m\.type === 'info'\)[\s\S]{0,200}getElementById\('out'\)/);
    expect(extensionSrc).not.toMatch(/if \(m\.type === 'stream'\)[\s\S]{0,200}previewBox/);
    expect(extensionSrc).not.toMatch(/if \(m\.type === 'info'\)[\s\S]{0,200}previewBox/);
    expect(extensionSrc).toMatch(/if \(m\.type === 'serverReady'\)[\s\S]{0,200}showPreviewBox/);
  });

  it("exposes busy stop button for all in-flight agent states", () => {
    expect(extensionSrc).toContain("AGENT_BUSY_STATES");
    expect(extensionSrc).toMatch(/busyStates\.includes\(m\.state\)/);
  });
});
