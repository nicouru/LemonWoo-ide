# Harness Evaluation — LemonWoo v2

Date: 2026-05-28
Branch: `feature/v2-opencode-harness-reevaluation`
Decision lens: single LemonWoo Agent surface, one DeepSeek BYOK key, no model/provider picker, no visible MCP, no persistent memory product, no auto-apply, user never sees upstream branding.

## Summary

| Harness | Ideal role | Integration cost | DeepSeek fit | Tool/test loop | MCP exposure risk | Recommendation |
| --- | --- | --- | --- | --- | --- | --- |
| **OpenCode** | Primary upstream agent runtime to re-evaluate | Medium — SDK + `opencode` binary + config bridge | **Good** — native DeepSeek + OpenAI-compatible `{env:DEEPSEEK_API_KEY}` | **Strong** — built-in tools, shell, session API | Medium — MCP exists upstream but can stay disabled/hidden | **v2 candidate (primary)** — spike first, adopt only if CLI+DeepSeek+tools pass |
| **Cline SDK** | Benchmark / backup headless loop | Medium-high — VS Code extension assumptions | Good via OpenAI-compatible providers | Strong editing + terminal patterns | High if full extension UI leaks | **v2.1+ backup** — compare patterns, do not replace OpenCode evaluation yet |
| **Aider** | Patch/git discipline reference | Low for CLI, high to embed in IDE | Good (OpenAI-compatible) | Strong git-centric loop | Low | **Deferred** — borrow diff/git ideas, not a runtime dependency |
| **Continue** | Tab/write assistant (already deferred in v1) | High — separate UI/config surface | Good | Weaker as hidden single-panel runtime | Medium | **Deferred** — Tab is native Flash; only revisit if clearly beats native Tab with zero visible UI |
| **Goose** | Research / heavy local agent | High — Block-style stack | Variable | Strong but heavy | Medium-high | **v2.3+ or research** — too heavy for v2.0 swap |
| **OpenHands** | Sandboxed multi-step research agent | Very high — Docker/sandbox assumptions | Good | Strong verification loops | High | **v2.3+ or research** — ops weight misaligned with LemonWoo macOS app |
| **Serena / semantic context** | Context intelligence, not runtime | Medium — indexing/LSP hooks | N/A (uses host LLM) | Read/search only | Low | **v2.1 Lightweight Context Intelligence** — not primary harness |

## OpenCode spike results (this branch)

Run from terminal (optional shell key):

```bash
pnpm opencode:spike
```

Run from LemonWoo.app (uses SecretStorage — no shell export):

- Command palette → **LemonWoo: Run Harness Diagnostic**
- Output channel: `LemonWoo Harness`

Do not claim live DeepSeek PASS from CLI alone when the product key exists only in SecretStorage.

Structured checks:

| Check | Meaning |
| --- | --- |
| `SDK_IMPORT` | `@opencode-ai/sdk` compiles and loads |
| `CLI_AVAILABLE` | `opencode` binary resolved (PATH, local `opencode-ai`, or `OPENCODE_BIN`) |
| `DEEPSEEK_CONFIG` | DeepSeek provider registered via LemonWoo-compatible config (SKIP without shell key) |
| `SESSION_CREATE` | HTTP server + session API |
| `SIMPLE_PROMPT` | Live DeepSeek round-trip (SKIP without shell key) |
| `TOOL_LOOP_CAPABLE` | OpenCode exposes tool ids for agent loop |
| `FIXTURE_MULTI_FILE` | Read-only analysis on copied `fixtures/v2-multi-file-agent` (SKIP without live key) |

Known blockers resolved in this re-evaluation:

- Previous `spawn opencode ENOENT` was an **environment/binary** issue, not an SDK compile failure.
- Fix path: optional devDependency `opencode-ai` + `pnpm.onlyBuiltDependencies`, or `OPENCODE_BIN`, or host install — documented in `docs/UPSTREAMS.md`.

## Adoption criteria for OpenCode as primary harness

Adopt only if **all** are true in CI/dev reproducibly:

1. `CLI_AVAILABLE`, `SESSION_CREATE`, `TOOL_LOOP_CAPABLE` = PASS without manual global install beyond documented pnpm path.
2. `DEEPSEEK_CONFIG` + `SIMPLE_PROMPT` = PASS with shell `DEEPSEEK_API_KEY` (LemonWoo app key remains separate; never read from SecretStorage).
3. Fixture spike shows inspect/read/analysis without auto-apply to real workspace.
4. LemonWoo can wrap OpenCode behind the existing single panel event stream with no model picker and no OpenCode branding.
5. Fallback `runAgentLoop` stays default until parity is proven in-app.

If any criterion fails: **keep local fallback**, document blocker, re-spike later.

## Explicit non-goals (unchanged)

- No MCP UI or registry in LemonWoo.
- No provider/model picker.
- No persistent memory product in v2.0.
- No silent auto-apply.
- No Cline/Continue/Aider as active dependencies in this evaluation block.

## Recommended next block

1. If OpenCode live spike PASS with shell key: prototype a **hidden adapter** behind `runAgentTask` feature flag (default off), mapping LemonWoo events only.
2. If live spike SKIP/FAIL: continue v2.0 on **`runAgentLoop` fallback** + v2.1 context intelligence.
3. Revisit Cline SDK only as a **secondary benchmark** if OpenCode fails on DeepSeek tool loop or macOS packaging constraints.
