#!/usr/bin/env node
// Standalone live smoke for @lemonwoo/deepseek.
//
// Exit codes:
//   0   all checks passed
//   1   one or more checks failed
//   78  skipped (no DEEPSEEK_API_KEY set; treat as "no signal" in CI)
//
// Prints only structural info: which model was used, latency, character
// counts. Never prints prompts or full responses; the user's repo content
// is private.
//
// Pre-requisite:
//   pnpm --filter @lemonwoo/deepseek run build
//
// Usage:
//   DEEPSEEK_API_KEY=sk-... node packages/deepseek/scripts/live-smoke.mjs
// or from the package:
//   pnpm --filter @lemonwoo/deepseek run smoke:live

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const distEntry = resolve(here, "..", "dist", "index.js");

if (!existsSync(distEntry)) {
  console.error(
    `[fail] build artifact not found at ${distEntry}. Run 'pnpm --filter @lemonwoo/deepseek run build' first.`
  );
  process.exit(1);
}

const KEY = process.env.DEEPSEEK_API_KEY;
if (!KEY) {
  console.log(
    "[skip] DEEPSEEK_API_KEY not set; skipping live DeepSeek smoke (exit 78)."
  );
  process.exit(78);
}

const { DeepSeekClient } = await import(distEntry);
const client = new DeepSeekClient({
  apiKey: KEY,
  // Keep timeouts modest so the smoke is bounded.
  flashTimeoutMs: 20_000,
  proTimeoutMs: 60_000
});

async function timed(label, fn) {
  const t0 = Date.now();
  try {
    const result = await fn();
    return { ok: true, label, ms: Date.now() - t0, result };
  } catch (err) {
    return {
      ok: false,
      label,
      ms: Date.now() - t0,
      err
    };
  }
}

let failures = 0;
const report = (entry, extra = "") => {
  const tag = entry.ok ? "[pass]" : "[fail]";
  const tail = extra ? ` ${extra}` : "";
  // Client errors are already redacted by classifyError + safeMessage.
  const errInfo = entry.ok
    ? ""
    : ` ${entry.err?.name ?? "Error"}: ${entry.err?.message ?? String(entry.err)}`;
  console.log(`${tag} ${entry.label} (${entry.ms}ms)${tail}${errInfo}`);
  if (!entry.ok) failures += 1;
};

// 1. validateKey + /models resolution.
const v = await timed("validateKey + /models", () => client.validateKey());
if (v.ok) {
  if (v.result.status !== "valid") {
    console.log(
      `[fail] validateKey returned status=${v.result.status} (expected 'valid')`
    );
    failures += 1;
  } else {
    report(
      v,
      `pro=${v.result.models?.pro} flash=${v.result.models?.flash} usedAlias=${v.result.models?.usedAlias}`
    );
  }
} else {
  report(v);
}

// 2. Flash (write) round-trip.
const flash = await timed("chat.flash (write)", () =>
  client.chat({
    task: "tab",
    build: {
      systemPrompt:
        "You are a one-word reply bot. Reply with exactly one English word.",
      userInput: "Reply with the single word PONG and nothing else."
    },
    maxTokens: 16
  })
);
if (flash.ok) {
  const len = flash.result.text?.length ?? 0;
  if (len === 0) {
    console.log("[fail] chat.flash returned empty text");
    failures += 1;
  } else {
    report(flash, `model=${flash.result.modelId} chars=${len}`);
  }
} else {
  report(flash);
}

// 3. Pro (think) round-trip.
const pro = await timed("chat.pro (think)", () =>
  client.chat({
    task: "chat",
    build: {
      systemPrompt:
        "You are a one-word reply bot. Reply with exactly one English word.",
      userInput: "Reply with the single word READY and nothing else."
    },
    maxTokens: 64
  })
);
if (pro.ok) {
  const len = pro.result.text?.length ?? 0;
  if (len === 0) {
    console.log("[fail] chat.pro returned empty text");
    failures += 1;
  } else {
    report(pro, `model=${pro.result.modelId} chars=${len}`);
  }
} else {
  report(pro);
}

if (failures > 0) {
  console.error(`[result] live smoke FAILED (${failures} check(s) failed)`);
  process.exit(1);
}
console.log("[result] live smoke OK");
process.exit(0);
