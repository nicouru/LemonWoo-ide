import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensionSrc = readFileSync(resolve(__dirname, "../src/extension.ts"), "utf8");

describe("preview UX closeout", () => {
  it("notifyPreviewReady posts serverReady and final Listo state", () => {
    expect(extensionSrc).toContain("function notifyPreviewReady");
    expect(extensionSrc).toContain('type: "serverReady"');
    expect(extensionSrc).toMatch(/notifyPreviewReady[\s\S]{0,400}state: "Listo"/);
  });

  it("webview serverReady renders Preview listo URL and shows Detener servidor", () => {
    expect(extensionSrc).toContain("Preview listo:");
    expect(extensionSrc).toContain("Preview ya estaba activo:");
    expect(extensionSrc).toContain("renderPreviewBlock");
    expect(extensionSrc).toMatch(/serverReady[\s\S]{0,500}stopServer[\s\S]{0,120}inline-block/);
    expect(extensionSrc).toMatch(/serverReady[\s\S]{0,300}textContent = 'Listo'/);
  });

  it("webview preserves preview block when agent result arrives", () => {
    expect(extensionSrc).toContain("let previewActive = false");
    expect(extensionSrc).toContain("if (m.type === 'result')");
    expect(extensionSrc).toContain("if (previewActive)");
    expect(extensionSrc).toMatch(/if \(previewActive\) return/);
  });

  it("stopServer posts Servidor detenido and returns to Listo", () => {
    expect(extensionSrc).toContain('"Servidor detenido."');
    expect(extensionSrc).toContain('if (msg.type === "stopServer")');
    expect(extensionSrc).toMatch(/stopServer[\s\S]{0,600}satisfies AgentState/);
    expect(extensionSrc).toMatch(/serverStopped[\s\S]{0,300}previewActive = false/);
    expect(extensionSrc).toMatch(/serverStopped[\s\S]{0,300}textContent = 'Listo'/);
  });

  it("preview startup failure returns to Listo without leaving Sirviendo", () => {
    expect(extensionSrc).toMatch(/ensurePreviewServer[\s\S]{0,400}catch[\s\S]{0,200}state: "Listo"/);
  });
});
