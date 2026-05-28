#!/usr/bin/env node
import { runOpenCodeHarnessSpike, formatHarnessReport } from "../packages/agent-runtime/dist/opencodeSpike.js";

const report = await runOpenCodeHarnessSpike();
console.log(formatHarnessReport(report));

const criticalFail =
  report.checks.SDK_IMPORT === "FAIL" ||
  report.checks.CLI_AVAILABLE === "FAIL" ||
  report.checks.SESSION_CREATE === "FAIL";

if (criticalFail) {
  process.exit(1);
}
