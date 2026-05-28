# UPSTREAMS

## v1 upstreams actually used

- Code-OSS / VSCodium as desktop base.
- DeepSeek API via OpenAI-compatible Chat Completions.
- Native VS Code extension APIs for agent panel, inline completion, workspace edits, diagnostics, and SecretStorage.
- Local Node.js packages in this monorepo for DeepSeek routing, agent runtime fallback, and TestGate.

## v2 runtime default (local fallback)

Status: **implemented and default** (PR #17+).

- `runAgentTask` → `runAgentLoop` bounded multi-step loop with internal tools (`read_file`, `search`, `propose_diff`, `test_gate`, `summarize`).
- Extension adapters wire real workspace I/O; runtime never auto-applies diffs.
- DeepSeek Pro/Flash routing via `@lemonwoo/deepseek`; no model picker.
- OpenCode is **not** wired into the live agent path; it remains an evaluation spike.

## Deferred upstreams

- **Continue** — not bundled; native Flash Tab completion in `lemonwoo-ai` is the v1/v2 path.
- **Cline / Aider / Goose / OpenHands** — comparison only; see [HARNESS-EVALUATION.md](./HARNESS-EVALUATION.md).
- **MCP, browser agents, semantic indexers, multi-agent UI** — v2.3+ / explicit deferrals per [V2-ROADMAP.md](./V2-ROADMAP.md).
- **Serena / semantic context** — v2.1 context intelligence, not primary runtime.

## OpenCode + DeepSeek re-evaluation (preferred upstream to re-assess)

Status: **re-evaluated** on branch `feature/v2-opencode-harness-reevaluation`.

Previous blocker:

```text
OpenCode spike failed: Error: spawn opencode ENOENT
```

Root cause: `@opencode-ai/sdk` `createOpencodeServer()` spawns the **`opencode` CLI binary** on PATH. The SDK compiles without the binary; ENOENT is an environment/runtime gap, not a TypeScript failure.

Current spike:

```bash
pnpm opencode:spike
# or
pnpm --filter @lemonwoo/agent-runtime build && node scripts/opencode-spike.mjs
```

Structured report fields: `SDK_IMPORT`, `CLI_AVAILABLE`, `DEEPSEEK_CONFIG`, `SESSION_CREATE`, `SIMPLE_PROMPT`, `TOOL_LOOP_CAPABLE`, `FIXTURE_MULTI_FILE`.

### Reproducible CLI without global install

1. **Monorepo devDependency (recommended for contributors):**

   ```bash
   pnpm install   # opencode-ai postinstall via pnpm.onlyBuiltDependencies
   pnpm opencode:spike
   ```

2. **Explicit binary override:**

   ```bash
   export OPENCODE_BIN="$HOME/.local/share/pnpm/global/5/node_modules/opencode-ai/bin/opencode.exe"
   pnpm opencode:spike
   ```

3. **Ephemeral (no lockfile change):**

   ```bash
   pnpm dlx opencode-ai@latest --version
   # ensure resulting bin dir is on PATH for the spike process
   ```

### DeepSeek compatibility (LemonWoo rules)

- Endpoint: `https://api.deepseek.com` via OpenAI-compatible provider config.
- **Product path**: key in LemonWoo.app `SecretStorage` (`deepseek.apiKey`) — used by chat, Tab, and `LemonWoo: Run Harness Diagnostic`.
- **CLI spike path**: `DEEPSEEK_API_KEY` in shell only for `pnpm opencode:spike` / CI — optional; SKIP when absent.
- LemonWoo.app SecretStorage key is **never read** by CLI scripts or written to docs/logs.
- `disabled_providers: ["opencode"]` hides OpenCode Zen; LemonWoo keeps automatic Pro/Flash routing in the product path.
- Live checks **SKIP** when the shell key is absent (expected when key lives only in LemonWoo.app).

### Decision (this evaluation)

- OpenCode remains the **primary candidate** if structured spike reaches PASS on CLI + session + tools + live DeepSeek.
- Until then, **`runAgentLoop` stays the default** reversible fallback.
- See [HARNESS-EVALUATION.md](./HARNESS-EVALUATION.md) for the full harness matrix.

Implementation files:

- `packages/agent-runtime/src/opencodeBinary.ts` — resolve CLI path
- `packages/agent-runtime/src/opencodeSpike.ts` — structured harness spike
- `scripts/opencode-spike.mjs` — CLI reporter
