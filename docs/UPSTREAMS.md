# UPSTREAMS

## v1 upstreams actually used

- Code-OSS / VSCodium as desktop base.
- DeepSeek API via OpenAI-compatible Chat Completions.
- Native VS Code extension APIs for agent panel, inline completion, workspace edits, diagnostics, and SecretStorage.
- Local Node.js packages in this monorepo for DeepSeek routing, agent runtime fallback, and TestGate.

## Deferred upstreams

- OpenCode SDK remains a documented spike path, not the default v1 runtime.
- Continue is not bundled in v1; Tab completion is implemented natively in `lemonwoo-ai` using DeepSeek Flash.
- MCP, browser agents, semantic indexers, and multi-agent harnesses remain v1.1+ research only.

## OpenCode + DeepSeek spike

Status: executed (initial spike), blocked by missing `opencode` binary in local environment.

Evidence:

```bash
pnpm --filter @lemonwoo/agent-runtime build && node scripts/opencode-spike.mjs
```

Output:

```text
OpenCode spike failed: Error: spawn opencode ENOENT
```

Interpretation:

- `@opencode-ai/sdk` is wired and compiles.
- Runtime start currently requires `opencode` runtime binary installed on host PATH.
- v1 agent programming loop uses an internal fallback runtime (`@lemonwoo/agent-runtime` `runAgentTask`) instead of waiting on OpenCode.
- OpenCode integration remains available via `packages/agent-runtime/src/opencodeSpike.ts` and `scripts/opencode-spike.mjs` for future wiring once `opencode` is on PATH.

## Agent runtime fallback (v1 default)

Status: implemented.

- `runAgentTask` is **single-shot**: one DeepSeek call per user action (or TestGate fix retry) with preassembled local context.
- It does **not** perform dynamic tool-calling, MCP routing, or an internal agent framework loop.
- Local steps are deterministic in the extension: context gather, multi-file diff plan/apply, TestGate, preview router.
- DeepSeek Pro/Flash routing via `@lemonwoo/deepseek`.
- No MCP, no multi-agent orchestration, no persistent memory.
