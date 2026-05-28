#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const reportPath = join(root, "dist", "RC-REPORT.md");
const pkgPath = join(root, "package.json");
const distDir = join(root, "dist");
const appPath = join(distDir, "LemonWoo.app");
const rcCheckResultsPath = join(distDir, "rc-check-last.json");

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
const statusRaw = safeRun("git status --porcelain")
  .split("\n")
  .filter(Boolean)
  .filter((line) => {
    const normalized = line.replace(/^[ MADRCU?!]{2}\s+/, "");
    return normalized !== "docs/RC-REPORT.md" && normalized !== "dist/rc-check-last.json" && normalized !== "dist/RC-REPORT.md";
  })
  .join("\n");
const gitState = statusRaw ? "dirty" : "clean";
const localDate = new Date().toLocaleString();

const archRaw = process.arch;
const arch = archRaw === "arm64" || archRaw === "aarch64" ? "arm64" : archRaw === "x64" ? "x64" : archRaw;
const targetDmgName = `dist/LemonWoo-${pkg.version}-mac-${arch}.dmg`;

const dmgCandidates = safeRun("ls -1 dist/LemonWoo-*-mac-*.dmg 2>/dev/null || true")
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

let dmgPath = "";
if (existsSync(join(root, targetDmgName))) {
  dmgPath = targetDmgName;
} else if (dmgCandidates.length > 0) {
  dmgPath = dmgCandidates[dmgCandidates.length - 1];
}

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
    rcSummary = ["- Error leyendo `dist/rc-check-last.json`."];
  }
}

const rel = (absolutePath) => relative(root, absolutePath).replaceAll("\\", "/");
const appPathDisplay = existsSync(appPath) ? `\`${rel(appPath)}\`` : "_No existe (`dist/LemonWoo.app`)_";
const dmgPathDisplay = dmgPath ? `\`${dmgPath}\`` : "_No existe DMG versionado_";

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
  `- App bundle: ${appPathDisplay}`,
  `- DMG: ${dmgPathDisplay}`,
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

if (!existsSync(distDir)) {
  execSync("mkdir -p dist", { cwd: root });
}

writeFileSync(reportPath, lines.join("\n"), "utf8");
console.log(`RC report written: ${reportPath}`);
