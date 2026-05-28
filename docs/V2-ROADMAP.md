# LemonWoo v2 Roadmap

LemonWoo v1 proved the product shape: a standalone macOS IDE, one DeepSeek key, one agent surface, automatic Pro/Flash routing, safe diff apply, TestGate, native Tab completion, local preview, and reproducible RC packaging.

v2 must preserve that simplicity while making the agent substantially more capable. The user-facing promise stays the same:

> Open LemonWoo, use one agent box, and let the system decide the fast or deep path automatically.

## Non-negotiables

- Keep a single LemonWoo Agent surface.
- Keep DeepSeek BYOK as the only visible provider path.
- Keep Pro/Flash routing automatic and hidden from the user.
- Keep startup and editor typing fast.
- Keep secrets out of logs, docs, and generated artifacts.
- Keep destructive terminal actions behind explicit user confirmation.
- Do not add a model picker, provider picker, telemetry product analytics, billing, or marketplace UI in v2.

## v2.0 — Agent Runtime Real

Goal: move from the v1 single-shot runtime to a real multi-step programming loop.

Scope:

- Plan -> inspect -> edit -> verify -> repair loop.
- Internal tool steps for file reads, targeted search, diff generation, TestGate, and retry.
- DeepSeek Pro for planning, debugging, verification, and repair.
- DeepSeek Flash for bounded writing paths and Tab.
- Cancellation propagated through the whole loop.
- Structured event stream back to the existing single agent panel.
- Human confirmation for destructive commands.

OpenCode remains the preferred upstream to re-evaluate, but not a blocker if the local runtime can provide the loop with less risk.

Definition of done:

- A real multi-file fixture is fixed through multiple internal steps.
- TestGate failure is reinjected and repaired automatically.
- The agent never silently edits files outside the workspace or `.git`.
- The UI remains the same single panel.

## v2.1 — Lightweight Context Intelligence

Goal: improve code quality without adding startup-heavy indexing.

Scope:

- Token-budgeted context packing.
- Better ranking of open file, selection, diagnostics, git diff, `AGENTS.md`, `.lemonwoo/rules/`, and targeted `rg` results.
- Optional LSP symbol summaries when cheaply available.
- Respect `.gitignore` and existing sensitive-file exclusions.
- No embeddings, vector database, or full-repo index at startup.

Definition of done:

- Medium repos receive smaller, more relevant prompts.
- Large files are summarized or sliced predictably.
- Context decisions are testable and logged only with secrets redacted.

## v2.2 — Minimal Local Memory

Goal: remember useful repo/user facts without building a heavy memory product.

Scope:

- Session memory in runtime.
- Repo-local `.lemonwoo/memory.jsonl` for approved facts only.
- Read `AGENTS.md` and `.lemonwoo/rules/` as the stable rule layer.
- Commands to show and clear memory.
- Automatic secret redaction before any memory write.

Out of scope:

- SQLite memory.
- Embeddings.
- Vector search.
- Cloud sync.

Definition of done:

- The agent remembers approved repo preferences across sessions.
- The user can inspect and delete memory.
- Secret-looking values are refused or redacted.

## v2.3 — Internal MCP Bridge

Goal: add MCP power without exposing MCP complexity.

Scope:

- Local stdio-only MCP client.
- Static allowlist of trusted local servers/tools.
- No registry browser, no install UI, no OAuth flow.
- Convert allowed MCP tools into internal agent tool calls.
- Human confirmation for any action with side effects.
- Clear timeout and cancellation behavior.

First useful tool classes:

- Filesystem read/search constrained to workspace.
- Git inspection.
- Test and shell wrappers that reuse existing safety gates.

Definition of done:

- One allowlisted local MCP server can be called safely from the agent runtime.
- No MCP process starts during IDE startup.
- No MCP capability is visible as a settings-heavy user surface.

## v2.4 — Public Beta Distribution

Goal: reduce install friction for public users.

Scope:

- Apple Developer ID signing.
- Notarization.
- Release checklist for DMG upload.
- GitHub Release notes and checksum publishing.
- Keep ad-hoc local build flow for contributors.

Definition of done:

- A user can download the DMG and launch with minimal Gatekeeper friction.
- Release artifacts are reproducible and documented.

## Explicitly Deferred Beyond v2

- Stripe/licensing.
- Product telemetry.
- Browser agents.
- PR review bots.
- Open VSX marketplace UI.
- Vector databases or semantic full-repo indexing.
- Visible multi-agent UI.

## Recommended First v2 Sprint

Start with **v2.0 Agent Runtime Real**.

Suggested implementation order:

1. Define a small internal tool contract for read/search/patch/TestGate.
2. Implement a bounded multi-step loop in `packages/agent-runtime`.
3. Add fixtures for multi-file repair and TestGate repair.
4. Wire progress events into the existing LemonWoo Agent panel.
5. Keep all v1 guardrails green.

Success metric:

> LemonWoo fixes a real multi-file TypeScript fixture through inspect/edit/test/repair without adding any new visible configuration.
