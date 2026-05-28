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

- `runAgentTask` orchestrates DeepSeek Pro/Flash via `@lemonwoo/deepseek`.
- Local tools are deterministic (context gather, multi-file diff plan/apply, TestGate, preview router).
- No MCP, no multi-agent orchestration, no persistent memory.
