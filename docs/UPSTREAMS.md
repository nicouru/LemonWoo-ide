# UPSTREAMS

## Planned v1 upstreams

- Code-OSS / VSCodium as desktop base.
- OpenCode SDK for agent runtime integration.
- Continue integration for optional write/tab path.

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
