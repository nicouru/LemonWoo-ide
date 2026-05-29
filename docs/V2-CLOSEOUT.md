# LemonWoo v2 Closeout Report

Automation-lane closeout for the bounded v2 slice merged on `main` (2026-05-29). This document is hygiene only: it records what landed, what stays deferred, and how to re-verify without opening `LemonWoo.app`.

## Verification command

Run the full deterministic v2 gate from the repository root:

```bash
pnpm v2:check
```

This runs, in order:

1. **Functional gauntlet** — multi-file fixture repair via `runAgentLoop` with mocked DeepSeek responses (`scripts/v2-functional-gauntlet.mjs`).
2. **Web preview gauntlet** — empty-workspace routing, scaffold diff apply, localhost preview start/stop (`scripts/v2-web-preview-gauntlet.mjs`).
3. **Terminal gauntlet** — `run_terminal` safety through the extension adapter (`scripts/v2-terminal-gauntlet.mjs`).

Individual harnesses remain available as `pnpm v2:gauntlet`, `pnpm v2:web-preview-gauntlet`, and `pnpm v2:terminal-gauntlet`.

Supporting automation-lane checks (no GUI):

```bash
git diff --check origin/main...HEAD
pnpm -r build
pnpm -r test
pnpm verify:docs
pnpm check:secrets
bash scripts/verify-v1-scope.sh
```

Do **not** run `pnpm smoke:bundle` or open `LemonWoo.app` in this lane.

## Merged on main

### Bounded runtime (v2.0)

- `runAgentLoop` is the default multi-step programming path (`runAgentTask` → bounded loop, `maxSteps` default 6).
- Internal `<lemonwoo_tool>` contract: `read_file`, `search`, `propose_diff`, `test_gate`, `summarize`.
- Runtime proposes diffs only; apply stays extension-side with workspace and `.git` guards.
- Functional gauntlet proves inspect → edit → TestGate red → repair → green on `fixtures/v2-multi-file-agent`.

### Internal tools (not MCP)

- System capability harness adds IDE-backed tools: `run_terminal`, `verify_files_exist`, `start_preview_server`, `stop_preview_server`.
- SecretStorage bridge for product DeepSeek key; harness diagnostic uses transient env only.
- `LemonWoo: Run Harness Diagnostic` is experimental and does not replace the default loop.

### Preview and terminal gauntlets

- **Web preview gauntlet** — creation-intent routing on empty workspaces, apply-ready scaffold diff, real HTTP preview on temp workspace, no API key.
- **Terminal gauntlet** — offline `fixtures/terminal-gauntlet`; allowed `npm test` spawns with `shell: false`; install/create/npx blocked or require confirmation; env secrets stripped; output bounded and redacted.

### Tool event polish

- `toolEventLines` maps internal tool phases to readable status (`Leyendo archivo`, `Buscando`, `Verificando`, etc.) and one-line stream notes instead of raw tool names or verbose output.

### Context budgets (v2.1)

- `packAgentContext` / `packVolatileContext` in `@lemonwoo/agent-runtime` with explicit character caps, priority-preserving truncation, selection-aware file slicing, and secret redaction before assembly.
- Wired into `gatherAgentContext` in `lemonwoo-ai`; no embeddings, vector DB, or repo-wide indexing daemon.

### Terminal confirmation (when present)

- Confirm-policy `run_terminal` commands store one pending command in extension state.
- Agent webview shows compact **Ejecutar** / **Cancelar** (`#terminalConfirm`); confirmed spawn uses `shell: false` and sanitized env.
- Blocked commands never become confirmable; output appends to `#out` via `info` without auto-resuming the model loop.

### Minimal approved memory (v2.2, when present)

- Repo-local `.lemonwoo/memory.jsonl` for **approved facts only** (explicit user record/list/clear; no auto-capture from chat).
- `@lemonwoo/agent-runtime` memory helper with workspace path safety, line/file caps, and secret refusal/redaction.
- Read-only injection into stable context via `gatherAgentContext`; panel commands through existing webview (`recordá esto` / `remember this`, `list memory`, `clear memory`).

## Explicitly deferred

These remain out of scope for the merged v2 automation lane:

| Item | Status |
| --- | --- |
| **OpenCode default adapter** | Spike only (`pnpm opencode:spike`); local `runAgentLoop` stays default until live adoption criteria pass with a reversible, default-off adapter. |
| **Visible MCP** | v2.3 roadmap; no MCP registry, install UI, or settings-heavy surface. |
| **Browser agents** | Explicitly beyond v2. |
| **Vector DB / embeddings** | No semantic full-repo indexing or startup-heavy memory product. |
| **Public notarization / signing** | v2.4 distribution work; v1/v2 builds remain ad-hoc signed for contributors. |

Also unchanged: Stripe/licensing, product telemetry, multi-agent UI, Open VSX marketplace.

## Evidence pointers

- Roadmap and deferrals: [V2-ROADMAP.md](./V2-ROADMAP.md)
- Command-level harness detail: [FUNCTIONAL-VERIFICATION.md](./FUNCTIONAL-VERIFICATION.md)
- Upstream evaluation (OpenCode): [UPSTREAMS.md](./UPSTREAMS.md), [HARNESS-EVALUATION.md](./HARNESS-EVALUATION.md)
- v1 scope guardrails (still enforced): [V1-SCOPE-GUARDS.md](./V1-SCOPE-GUARDS.md)

## Automation-lane attestation

- No new product features in this closeout branch beyond documentation.
- No release tag changes.
- No GUI smoke (`pnpm smoke:bundle`) or app launch in this lane.
- Single deterministic re-check: `pnpm v2:check`.
