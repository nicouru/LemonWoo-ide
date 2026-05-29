#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const result = spawnSync(
  "pnpm",
  ["--filter", "lemonwoo-ai", "exec", "vitest", "run", "test/web-preview-harness.test.ts"],
  { stdio: "inherit", cwd: process.cwd() }
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log("V2 web preview gauntlet passed (real verify/preview adapters; not agent→diff→preview E2E).");
