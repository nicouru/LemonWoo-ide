import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { redactSecrets } from "@lemonwoo/deepseek";
import { createOpencodeClient, createOpencodeServer } from "@opencode-ai/sdk";
import { prependOpencodeToPath, resolveOpencodeBinary } from "./opencodeBinary.js";

export type SpikeCheckStatus = "PASS" | "FAIL" | "SKIP" | "UNKNOWN";

export interface OpenCodeHarnessReport {
  checks: {
    SDK_IMPORT: SpikeCheckStatus;
    CLI_AVAILABLE: SpikeCheckStatus;
    DEEPSEEK_CONFIG: SpikeCheckStatus;
    SESSION_CREATE: SpikeCheckStatus;
    SIMPLE_PROMPT: SpikeCheckStatus;
    TOOL_LOOP_CAPABLE: SpikeCheckStatus;
    FIXTURE_MULTI_FILE: SpikeCheckStatus;
  };
  cliPath?: string;
  cliSource?: string;
  blocker?: string;
  details: string[];
}

export interface RuntimeSpikeResult {
  ok: boolean;
  detail: string;
  report?: OpenCodeHarnessReport;
}

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(packageRoot, "../../..");
const fixtureRoot = path.join(repoRoot, "fixtures/v2-multi-file-agent");

function sanitize(text: string): string {
  const key = process.env.DEEPSEEK_API_KEY;
  return redactSecrets(text, key ? [key] : []);
}

import { buildLemonwooDeepSeekConfig } from "./opencodeConfig.js";

export { buildLemonwooDeepSeekConfig } from "./opencodeConfig.js";

export function formatHarnessReport(report: OpenCodeHarnessReport): string {
  const lines = [
    "OpenCode Harness Spike Report",
    `SDK_IMPORT: ${report.checks.SDK_IMPORT}`,
    `CLI_AVAILABLE: ${report.checks.CLI_AVAILABLE}${report.cliPath ? ` (${report.cliSource}: ${report.cliPath})` : ""}`,
    `DEEPSEEK_CONFIG: ${report.checks.DEEPSEEK_CONFIG}`,
    `SESSION_CREATE: ${report.checks.SESSION_CREATE}`,
    `SIMPLE_PROMPT: ${report.checks.SIMPLE_PROMPT}`,
    `TOOL_LOOP_CAPABLE: ${report.checks.TOOL_LOOP_CAPABLE}`,
    `FIXTURE_MULTI_FILE: ${report.checks.FIXTURE_MULTI_FILE}`
  ];
  if (report.blocker) lines.push(`BLOCKER: ${report.blocker}`);
  for (const detail of report.details) lines.push(`- ${detail}`);
  return lines.join("\n");
}

function hasAssistantText(messages: unknown): boolean {
  if (!Array.isArray(messages) || messages.length < 2) return false;
  return messages.some((message) => {
    const role = (message as { role?: string }).role;
    if (role !== "assistant") return false;
    const parts = (message as { parts?: { type?: string; text?: string }[] }).parts ?? [];
    return parts.some((part) => part.type === "text" && Boolean(part.text?.trim()));
  });
}

export async function runOpenCodeHarnessSpike(timeoutMs = 90_000): Promise<OpenCodeHarnessReport> {
  const report: OpenCodeHarnessReport = {
    checks: {
      SDK_IMPORT: "PASS",
      CLI_AVAILABLE: "FAIL",
      DEEPSEEK_CONFIG: "SKIP",
      SESSION_CREATE: "FAIL",
      SIMPLE_PROMPT: "SKIP",
      TOOL_LOOP_CAPABLE: "UNKNOWN",
      FIXTURE_MULTI_FILE: "SKIP"
    },
    details: []
  };

  const binary = resolveOpencodeBinary();
  if (!binary.found) {
    report.blocker = binary.hint;
    report.details.push(sanitize(binary.hint ?? "OpenCode binary missing"));
    return report;
  }

  report.checks.CLI_AVAILABLE = "PASS";
  report.cliPath = binary.path;
  report.cliSource = binary.source;
  prependOpencodeToPath(binary);

  const deepseekConfig = buildLemonwooDeepSeekConfig();
  if (deepseekConfig) {
    report.checks.DEEPSEEK_CONFIG = "UNKNOWN";
  } else {
    report.details.push("DEEPSEEK_API_KEY not in shell; live DeepSeek checks SKIP (expected for LemonWoo.app-only key).");
  }

  let server: Awaited<ReturnType<typeof createOpencodeServer>> | undefined;
  let fixtureDir: string | undefined;
  const started = Date.now();

  try {
    server = await createOpencodeServer({
      hostname: "127.0.0.1",
      port: 4096,
      timeout: 15_000,
      config: deepseekConfig ?? {}
    });
    const client = createOpencodeClient({ baseUrl: server.url });

    const session = await client.session.create({ body: { title: "LemonWoo Harness Spike" } });
    if (session.error || !session.data?.id) {
      report.checks.SESSION_CREATE = "FAIL";
      report.blocker = sanitize(`Session create failed: ${JSON.stringify(session.error ?? session)}`);
      report.details.push(report.blocker);
      return report;
    }
    report.checks.SESSION_CREATE = "PASS";
    report.details.push(`Session ${session.data.id} created`);

    const providers = await client.config.providers();
    const providerIds = (providers.data?.providers ?? []).map((p) => p.id);
    if (deepseekConfig) {
      report.checks.DEEPSEEK_CONFIG = providerIds.includes("deepseek") ? "PASS" : "FAIL";
      if (report.checks.DEEPSEEK_CONFIG === "FAIL") {
        report.details.push(`DeepSeek provider missing; saw: ${providerIds.join(", ") || "(none)"}`);
      } else {
        report.details.push("DeepSeek provider registered via OpenAI-compatible config (no model picker).");
      }
    }

    const tools = await client.tool.ids();
    const toolCount = Array.isArray(tools.data) ? tools.data.length : 0;
    report.checks.TOOL_LOOP_CAPABLE = toolCount > 0 ? "PASS" : "UNKNOWN";
    report.details.push(`OpenCode exposed ${toolCount} tool ids`);

    if (deepseekConfig && Date.now() - started < timeoutMs) {
      report.checks.SIMPLE_PROMPT = "UNKNOWN";
      const prompt = await client.session.prompt({
        path: { id: session.data.id },
        body: { parts: [{ type: "text", text: "Reply with exactly: LEMONWOO_OK" }] }
      });
      if (prompt.error) {
        report.checks.SIMPLE_PROMPT = "FAIL";
        report.details.push(sanitize(`Prompt error: ${JSON.stringify(prompt.error).slice(0, 240)}`));
      } else {
        await new Promise((r) => setTimeout(r, 12_000));
        const messages = await client.session.messages({ path: { id: session.data.id } });
        const assistantSeen = hasAssistantText(messages.data);
        report.checks.SIMPLE_PROMPT = assistantSeen ? "PASS" : "FAIL";
        report.details.push(
          assistantSeen
            ? "DeepSeek prompt returned assistant text"
            : "Prompt accepted but no assistant text yet (invalid key or provider error)"
        );
      }
    }

    if (deepseekConfig && report.checks.SIMPLE_PROMPT === "PASS" && existsFixture()) {
      report.checks.FIXTURE_MULTI_FILE = "UNKNOWN";
      fixtureDir = mkdtempSync(path.join(tmpdir(), "lemonwoo-opencode-fixture-"));
      cpSync(fixtureRoot, fixtureDir, { recursive: true });
      const prevCwd = process.cwd();
      process.chdir(fixtureDir);
      try {
        server.close();
        server = await createOpencodeServer({
          hostname: "127.0.0.1",
          port: 4096,
          timeout: 15_000,
          config: deepseekConfig
        });
        const fixtureClient = createOpencodeClient({ baseUrl: server.url });
        const fixtureSession = await fixtureClient.session.create({
          body: { title: "LemonWoo Fixture Spike" }
        });
        if (fixtureSession.data?.id) {
          await fixtureClient.session.prompt({
            path: { id: fixtureSession.data.id },
            body: {
              parts: [
                {
                  type: "text",
                  text:
                    "Inspect src/invoice.js and src/tax.js. Reply with a one-sentence summary of why npm test fails. Do not edit files."
                }
              ]
            }
          });
          await new Promise((r) => setTimeout(r, 20_000));
          const msgs = await fixtureClient.session.messages({ path: { id: fixtureSession.data.id } });
          report.checks.FIXTURE_MULTI_FILE = hasAssistantText(msgs.data) ? "PASS" : "FAIL";
          report.details.push(
            report.checks.FIXTURE_MULTI_FILE === "PASS"
              ? "Fixture spike produced assistant analysis (read-only, no auto-apply)"
              : "Fixture spike did not produce assistant analysis"
          );
        } else {
          report.checks.FIXTURE_MULTI_FILE = "FAIL";
        }
      } finally {
        process.chdir(prevCwd);
      }
    } else if (!deepseekConfig) {
      report.details.push("Fixture multi-file spike SKIP without shell DEEPSEEK_API_KEY");
    }

    return report;
  } catch (error) {
    const msg = sanitize(String(error));
    if (report.checks.CLI_AVAILABLE === "PASS" && report.checks.SESSION_CREATE === "FAIL") {
      report.blocker = msg;
    } else if (report.checks.SESSION_CREATE === "PASS") {
      report.details.push(`Late spike error: ${msg}`);
    } else {
      report.blocker = msg;
    }
    return report;
  } finally {
    server?.close();
    if (fixtureDir) {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  }
}

function existsFixture(): boolean {
  return existsSync(fixtureRoot);
}

/** @deprecated Use runOpenCodeHarnessSpike for structured diagnostics. */
export async function runOpenCodeSpike(timeoutMs = 60_000): Promise<RuntimeSpikeResult> {
  const report = await runOpenCodeHarnessSpike(timeoutMs);
  const ok =
    report.checks.SDK_IMPORT === "PASS" &&
    report.checks.CLI_AVAILABLE === "PASS" &&
    report.checks.SESSION_CREATE === "PASS";
  return {
    ok,
    detail: formatHarnessReport(report),
    report
  };
}
