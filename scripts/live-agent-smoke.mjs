#!/usr/bin/env node
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
if (!apiKey) {
  console.error("SKIP: falta DEEPSEEK_API_KEY");
  process.exit(78);
}

const root = process.cwd();
const distDeepseek = join(root, "packages/deepseek/dist/index.js");
if (!existsSync(distDeepseek)) {
  console.error("Build packages first: pnpm -r build");
  process.exit(1);
}
const fixture = join(root, "fixtures", "agent-loop-ts");
if (!existsSync(fixture)) {
  console.error("Fixture missing: fixtures/agent-loop-ts");
  process.exit(1);
}

const deepseekMod = await import("../packages/deepseek/dist/index.js");
const runtimeMod = await import("../packages/agent-runtime/dist/index.js");
const DeepSeekClient = deepseekMod.DeepSeekClient;
const redactSecrets = deepseekMod.redactSecrets;
const runAgentTaskOnce = runtimeMod.runAgentTaskOnce;
const planMultiFileApply = runtimeMod.planMultiFileApply;
const countDiffBlocks = runtimeMod.countDiffBlocks;

let tmp;
let exitCode = 0;
try {
  tmp = mkdtempSync(join(tmpdir(), "lemonwoo-live-smoke-"));
  const workspace = join(tmp, "agent-loop-ts");
  cpSync(fixture, workspace, { recursive: true });

  const client = new DeepSeekClient({ apiKey });
  const result = await runAgentTaskOnce({
    client,
    context: {
      userTask: "Arreglá el test que falla en sum con un patch mínimo.",
      agentsMd: readFileSync(join(workspace, "AGENTS.md"), "utf8"),
      stableContext: "Repo de fixture TypeScript. Cambios mínimos.",
      volatileContext: `Archivo src/sum.ts:\n${readFileSync(join(workspace, "src/sum.ts"), "utf8")}`
    }
  });

  if (!result.rawDiff || !result.hasDiff) {
    console.error("Live smoke failed: agent did not return a single valid diff");
    exitCode = 1;
    process.exitCode = exitCode;
  } else if (countDiffBlocks(result.message) > 1) {
    console.error("Live smoke failed: multiple diff blocks returned; expected exactly one");
    exitCode = 1;
    process.exitCode = exitCode;
  } else {
    const plan = planMultiFileApply(result.rawDiff, (relPath) => {
      const abs = join(workspace, relPath);
      return existsSync(abs) ? readFileSync(abs, "utf8") : null;
    });
    if (!plan.ok) {
      console.error(`Live smoke failed: invalid diff plan (${redactSecrets(plan.error ?? "", [apiKey])})`);
      exitCode = 1;
      process.exitCode = exitCode;
    } else {
      for (const patch of plan.patches) {
        if (!patch.ok || patch.content === undefined) {
          console.error(`Live smoke failed: patch error (${redactSecrets(patch.error ?? "", [apiKey])})`);
          exitCode = 1;
          process.exitCode = exitCode;
          break;
        }
        writeFileSync(join(workspace, patch.relPath), patch.content);
      }
      if (exitCode === 0) {
        const testRun = spawnSync("npm", ["test"], { cwd: workspace, encoding: "utf8" });
        const output = redactSecrets(`${testRun.stdout ?? ""}\n${testRun.stderr ?? ""}`.trim(), [apiKey]).slice(0, 1000);
        if (testRun.status !== 0) {
          console.error("Live smoke failed: tests remain red");
          console.error(output);
          exitCode = 1;
          process.exitCode = exitCode;
        } else {
          console.log("Live smoke passed: agent proposed diff and tests are green.");
          console.log(output);
        }
      }
    }
  }
} finally {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
}
