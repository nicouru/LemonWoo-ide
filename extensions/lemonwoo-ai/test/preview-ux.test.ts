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

  it("uses dedicated previewBox separate from agent output", () => {
    expect(extensionSrc).toContain('id="previewBox"');
    expect(extensionSrc).toContain("function showPreviewBox");
    expect(extensionSrc).toMatch(/showPreviewBox[\s\S]{0,300}getElementById\('previewBox'\)/);
    expect(extensionSrc).not.toContain("previewActive");
  });

  it("serverReady writes preview link to previewBox only", () => {
    expect(extensionSrc).toContain("Preview listo:");
    expect(extensionSrc).toContain("Preview ya estaba activo:");
    expect(extensionSrc).toMatch(/if \(m\.type === 'serverReady'\) {\s*\n\s*showPreviewBox/);
    expect(extensionSrc).toMatch(/function showPreviewBox[\s\S]{0,350}getElementById\('previewBox'\)/);
    expect(extensionSrc).not.toMatch(/function showPreviewBox[\s\S]{0,350}getElementById\('out'\)/);
  });

  it("stream and result always write to #out even with preview visible", () => {
    expect(extensionSrc).toMatch(/if \(m\.type === 'stream'\)[\s\S]{0,200}getElementById\('out'\)/);
    expect(extensionSrc).toMatch(/if \(m\.type === 'result'\)[\s\S]{0,200}getElementById\('out'\)/);
    expect(extensionSrc).not.toMatch(/if \(previewActive\) return/);
    expect(extensionSrc).not.toMatch(/if \(previewActive\)[\s\S]{0,120}getElementById\('out'\)/);
  });

  it("info updates #out only and does not touch previewBox", () => {
    expect(extensionSrc).toMatch(/if \(m\.type === 'info'\)[\s\S]{0,200}getElementById\('out'\)/);
    expect(extensionSrc).not.toMatch(/if \(m\.type === 'info'\)[\s\S]{0,200}previewBox/);
  });

  it("serverStopped updates previewBox and hides Detener servidor", () => {
    expect(extensionSrc).toContain('"Servidor detenido."');
    expect(extensionSrc).toContain('if (msg.type === "stopServer")');
    expect(extensionSrc).toMatch(/stopServer[\s\S]{0,600}satisfies AgentState/);
    expect(extensionSrc).toMatch(/serverStopped[\s\S]{0,300}getElementById\('previewBox'\)/);
    expect(extensionSrc).toMatch(/serverStopped[\s\S]{0,300}stopServer[\s\S]{0,120}none/);
    expect(extensionSrc).toMatch(/serverStopped[\s\S]{0,300}textContent = 'Listo'/);
  });

  it("preview startup failure returns to Listo without leaving Sirviendo", () => {
    expect(extensionSrc).toMatch(/ensurePreviewServer[\s\S]{0,400}catch[\s\S]{0,200}state: "Listo"/);
  });
});
