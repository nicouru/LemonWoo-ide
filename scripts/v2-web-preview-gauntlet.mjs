#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const steps = [
  {
    label: "preview dogfood harness (create/apply/verify/preview/stop)",
    args: ["--filter", "lemonwoo-ai", "exec", "vitest", "run", "test/web-preview-harness.test.ts"]
  }
];

for (const step of steps) {
  console.log(`\n=== ${step.label} ===`);
  const result = spawnSync("pnpm", step.args, { stdio: "inherit", cwd: process.cwd() });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("\nV2 web preview dogfood gauntlet passed.");
console.log("- Empty workspace: no servable project; create-web skips preview fast-path.");
console.log("- Apply-ready diff for index.html, style.css, script.js (harness temp dir only).");
console.log("- verify_files_exist + real preview start/stop; localhost HTTP 200 then port down.");
console.log("- No API key, MCP, browser agent, model picker, or auto-apply.");
