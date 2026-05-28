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
- v1 remains on OpenCode SDK path with this blocker documented, as required by spec.
