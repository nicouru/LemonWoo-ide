#!/usr/bin/env node
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const fixture = join(root, "fixtures", "v2-multi-file-agent");
const distRuntime = join(root, "packages", "agent-runtime", "dist", "index.js");
const distTestGate = join(root, "packages", "test-gate", "dist", "index.js");

if (!existsSync(fixture)) {
  console.error("Missing fixture: fixtures/v2-multi-file-agent");
  process.exit(1);
}
if (!existsSync(distRuntime) || !existsSync(distTestGate)) {
  console.error("Build packages first: pnpm -r build");
  process.exit(1);
}

const runtime = await import("../packages/agent-runtime/dist/index.js");
const testGate = await import("../packages/test-gate/dist/index.js");
const {
  isSafeRelPath,
  planMultiFileApply,
  runAgentTaskOnce
} = runtime;
const { runTestGateStructured } = testGate;

const firstDiff = [
  "--- a/src/invoice.js",
  "+++ b/src/invoice.js",
  "@@ -6,7 +6,7 @@ export function buildInvoice(items, taxBasisPoints = 750) {",
  "   const lines = items.map(({ sku, quantity }) => {",
  "     const product = findProduct(sku);",
  "     if (!product) throw new Error(`Unknown sku: ${sku}`);",
  "-    const lineTotalCents = product.cents + quantity;",
  "+    const lineTotalCents = product.cents * quantity;",
  "     return {",
  "       sku,",
  "       label: product.label,",
  "@@ -20,3 +20,3 @@ export function buildInvoice(items, taxBasisPoints = 750) {",
  "   const subtotalCents = lines.reduce((total, line) => total + line.lineTotalCents, 0);",
  "   const taxCents = taxForSubtotal(subtotalCents, taxBasisPoints);",
  "-  const totalCents = subtotalCents;",
  "+  const totalCents = subtotalCents + taxCents;",
  "--- a/src/tax.js",
  "+++ b/src/tax.js",
  "@@ -1,3 +1,3 @@",
  " export function taxForSubtotal(subtotalCents, rateBasisPoints) {",
  "-  return Math.floor((subtotalCents * rateBasisPoints) / 10000);",
  "+  return Math.round((subtotalCents * rateBasisPoints) / 10000);",
  " }"
].join("\n");

const repairDiff = [
  "--- a/src/format.js",
  "+++ b/src/format.js",
  "@@ -1,3 +1,3 @@",
  " export function formatUsd(cents) {",
  "-  return `$${(cents / 10).toFixed(2)}`;",
  "+  return `$${(cents / 100).toFixed(2)}`;",
  " }"
].join("\n");

function toolBlock(tool, args) {
  return `<lemonwoo_tool>${JSON.stringify({ tool, args })}</lemonwoo_tool>`;
}

function makeClient(responses, label) {
  let index = 0;
  return {
    chatStream: async function* () {
      if (index >= responses.length) {
        throw new Error(`${label}: unexpected extra model call ${index + 1}`);
      }
      yield responses[index++];
    },
    chat: async () => {
      throw new Error(`${label}: buffered fallback should not be used in gauntlet`);
    }
  };
}

function runNpmTest(workspace) {
  return spawnSync("npm", ["test"], {
    cwd: workspace,
    encoding: "utf8"
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`V2 gauntlet failed: ${message}`);
    process.exit(1);
  }
}

function readWorkspaceFile(workspace, relPath) {
  if (!isSafeRelPath(relPath)) return null;
  const abs = join(workspace, relPath);
  return existsSync(abs) ? readFileSync(abs, "utf8") : null;
}

function applyResult(workspace, result, label) {
  assert(result.hasDiff && result.rawDiff, `${label} did not produce an apply-ready diff`);
  const plan = planMultiFileApply(result.rawDiff, (relPath) => readWorkspaceFile(workspace, relPath));
  assert(plan.ok, `${label} produced invalid diff plan: ${plan.error ?? "unknown"}`);
  for (const patch of plan.patches) {
    assert(patch.ok && patch.content !== undefined, `${label} patch failed for ${patch.relPath}`);
    writeFileSync(join(workspace, patch.relPath), patch.content);
  }
  return plan.patches.map((patch) => patch.relPath);
}

function buildAdapters(workspace) {
  return {
    readFile: async (relPath) => readWorkspaceFile(workspace, relPath),
    searchWorkspace: async (query) => {
      const res = spawnSync("rg", [
        "-n",
        "--glob",
        "!.git/**",
        "--glob",
        "!node_modules/**",
        "--glob",
        "!dist/**",
        "--",
        query,
        "."
      ], {
        cwd: workspace,
        encoding: "utf8"
      });
      const raw = `${res.stdout ?? ""}${res.stderr ?? ""}`.trim();
      return raw ? raw.split("\n").slice(0, 20) : [];
    },
    runTestGate: async (changedFiles) => await runTestGateStructured(workspace, changedFiles)
  };
}

async function runRuntime(workspace, client, userTask, fixTestOutput) {
  const events = [];
  const result = await runAgentTaskOnce({
    client,
    context: {
      userTask,
      agentsMd: readFileSync(join(workspace, "AGENTS.md"), "utf8"),
      stableContext: "Fixture v2 multi-file: invoice, tax, formatting, and node:test.",
      volatileContext: [
        `package.json:\n${readFileSync(join(workspace, "package.json"), "utf8")}`,
        `test/invoice.test.js:\n${readFileSync(join(workspace, "test", "invoice.test.js"), "utf8")}`
      ].join("\n\n")
    },
    fixTestOutput,
    adapters: buildAdapters(workspace),
    limits: {
      maxSteps: 6,
      maxRepairAttempts: 2,
      maxToolOutputChars: 12000,
      maxSearchResults: 20,
      maxFileReadChars: 20000
    }
  });
  return { result, events };
}

let tmp;
try {
  tmp = mkdtempSync(join(tmpdir(), "lemonwoo-v2-gauntlet-"));
  const workspace = join(tmp, "v2-multi-file-agent");
  cpSync(fixture, workspace, { recursive: true });

  const initial = runNpmTest(workspace);
  assert(initial.status !== 0, "fixture must start red");

  const first = await runRuntime(
    workspace,
    makeClient([
      toolBlock("search", { query: "buildInvoice" }),
      toolBlock("read_file", { path: "src/invoice.js" }),
      toolBlock("read_file", { path: "src/tax.js" }),
      toolBlock("test_gate", { files: "src/invoice.js,src/tax.js,test/invoice.test.js" }),
      toolBlock("propose_diff", { diff: `\`\`\`diff\n${firstDiff}\n\`\`\`` })
    ], "first-pass"),
    "Arreglá los tests de este repo con el menor patch posible."
  );
  const firstTouched = applyResult(workspace, first.result, "first pass");
  assert(firstTouched.includes("src/invoice.js"), "first pass should touch invoice.js");
  assert(firstTouched.includes("src/tax.js"), "first pass should touch tax.js");

  const afterFirst = await runTestGateStructured(workspace, firstTouched);
  assert(!afterFirst.ok, "first patch should still leave a repairable failure");

  const repair = await runRuntime(
    workspace,
    makeClient([
      toolBlock("read_file", { path: "src/format.js" }),
      toolBlock("propose_diff", { diff: `\`\`\`diff\n${repairDiff}\n\`\`\`` })
    ], "repair-pass"),
    "Corregí los tests que siguen fallando.",
    afterFirst.output
  );
  const repairTouched = applyResult(workspace, repair.result, "repair pass");
  assert(repairTouched.includes("src/format.js"), "repair pass should touch format.js");

  const finalGate = await runTestGateStructured(workspace, [...firstTouched, ...repairTouched]);
  assert(finalGate.ok, `final TestGate should pass:\n${finalGate.output}`);

  const originalStillRed = runNpmTest(fixture);
  assert(originalStillRed.status !== 0, "source fixture should remain seeded red");

  console.log("V2 functional gauntlet passed.");
  console.log(`First pass touched: ${firstTouched.join(", ")}`);
  console.log(`Repair pass touched: ${repairTouched.join(", ")}`);
  console.log(`Final commands: ${finalGate.commands.join(", ")}`);
} finally {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
}
