#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const steps = [
  {
    label: "terminal tool gauntlet (executeTool + extension terminal adapter)",
    args: ["--filter", "lemonwoo-ai", "exec", "vitest", "run", "test/terminal-gauntlet.test.ts"]
  }
];

for (const step of steps) {
  console.log(`\n=== ${step.label} ===`);
  const result = spawnSync("pnpm", step.args, { stdio: "inherit", cwd: process.cwd() });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("\nV2 terminal tool gauntlet passed.");
console.log("- Temp workspace with offline npm test (no network/install).");
console.log("- executeTool(run_terminal) through runTerminalInWorkspace with shell:false.");
console.log("- Install/create/npx-like commands require confirmation and do not spawn.");
console.log("- Traversal, .git, and destructive commands blocked before spawn.");
console.log("- Child env excludes DEEPSEEK_API_KEY, TOKEN, SECRET, PASSWORD, and *_KEY values.");
console.log("- Output bounded and redacted; no API key, MCP, or auto-apply.");
