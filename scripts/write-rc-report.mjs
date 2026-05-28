#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const root = resolve(new URL("..", import.meta.url).pathname);
const docsDir = join(root, "docs");
const reportPath = join(docsDir, "RC-REPORT.md");
const pkgPath = join(root, "package.json");
const distDir = join(root, "dist");
const appPath = join(distDir, "LemonWoo.app");
const rcCheckResultsPath = join(docsDir, ".rc-check-last.json");

const run = (command) => execSync(command, { cwd: root, encoding: "utf8" }).trim();
const safeRun = (command) => {
  try {
    return run(command);
  } catch {
    return "";
  }
};

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const branch = safeRun("git rev-parse --abbrev-ref HEAD") || "unknown";
const commit = safeRun("git rev-parse HEAD") || "unknown";
const statusRaw = safeRun("git status --porcelain");
const gitState = statusRaw ? "dirty" : "clean";
const localDate = new Date().toLocaleString();

const dmgCandidates = safeRun("ls -1 dist/LemonWoo-*-mac-*.dmg 2>/dev/null || true")
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);
const dmgPath = dmgCandidates.length > 0 ? dmgCandidates[dmgCandidates.length - 1] : "";

let dmgSha256 = "";
let dmgSha256File = "";
if (dmgPath && existsSync(join(root, dmgPath))) {
  const dmgBuffer = readFileSync(join(root, dmgPath));
  dmgSha256 = createHash("sha256").update(dmgBuffer).digest("hex");
  const shaFile = `${dmgPath}.sha256`;
  if (existsSync(join(root, shaFile))) {
    dmgSha256File = readFileSync(join(root, shaFile), "utf8").trim();
  }
}

let rcSummary = ["- No hay resultado previo de `pnpm rc:check`."];
let liveSmokeNote = "- `DEEPSEEK_API_KEY`: estado desconocido (no hay run de `rc:check` registrado).";

if (existsSync(rcCheckResultsPath)) {
  try {
    const rc = JSON.parse(readFileSync(rcCheckResultsPath, "utf8"));
    const steps = Array.isArray(rc.steps) ? rc.steps : [];
    rcSummary = steps.map((step) => {
      const suffix = step.exitCode !== undefined ? ` (exit ${step.exitCode})` : "";
      return `- ${step.name}: ${step.status}${suffix}`;
    });
    const live = steps.find((s) => s.command === "pnpm smoke:agent:live");
    if (live?.status === "PASS") {
      liveSmokeNote = "- `DEEPSEEK_API_KEY`: presente y `smoke:agent:live` pasó.";
    } else if (live?.status === "SKIP_EXPECTED_EXTERNAL" && live?.exitCode === 78) {
      liveSmokeNote = "- `DEEPSEEK_API_KEY`: ausente; `smoke:agent:live` marcado como SKIP externo esperado (exit 78).";
    } else if (live) {
      liveSmokeNote = `- \`DEEPSEEK_API_KEY\`: run ejecutado con fallo en live smoke (estado ${live.status}, exit ${live.exitCode}).`;
    }
  } catch {
    rcSummary = ["- Error leyendo `docs/.rc-check-last.json`."];
  }
}

const lines = [
  "# RC Report",
  "",
  "## Metadata",
  `- Fecha local: ${localDate}`,
  `- Rama: \`${branch}\``,
  `- Commit: \`${commit}\``,
  `- Estado git: **${gitState}**`,
  `- Version (\`package.json\`): \`${pkg.version}\``,
  "",
  "## Artifact Paths",
  `- App bundle: ${existsSync(appPath) ? `\`${appPath}\`` : "_No existe (`dist/LemonWoo.app`)_"} `,
  `- DMG: ${dmgPath ? `\`${join(root, dmgPath)}\`` : "_No existe DMG versionado_"} `,
  "",
  "## DMG SHA256",
  dmgSha256 ? `- Calculado: \`${dmgSha256}\`` : "- Calculado: _N/A_",
  dmgSha256File ? `- Archivo .sha256: \`${dmgSha256File}\`` : "- Archivo .sha256: _No encontrado_",
  "",
  "## RC Check Summary",
  ...rcSummary,
  "",
  "## Live Smoke / API Key",
  liveSmokeNote,
  "",
  "> Nota: este reporte nunca imprime el valor de `DEEPSEEK_API_KEY`, solo su estado operativo.",
  "",
];

writeFileSync(reportPath, lines.join("\n"), "utf8");
console.log(`RC report written: ${reportPath}`);
