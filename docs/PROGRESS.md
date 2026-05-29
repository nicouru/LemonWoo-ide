# PROGRESS

## Current stage — v2 system capability harness

LemonWoo **v1 RC** is tagged `v0.1.0-rc.1`. Branch `feature/v2-system-capability-harness` adds IDE-backed system tools to the bounded v2 runtime:

- **SecretStorage bridge** — product key from `deepseek.apiKey`; harness diagnostic uses transient env only; never logged.
- **Tools**: `run_terminal`, `verify_files_exist`, `start_preview_server`, `stop_preview_server` (plus existing read/search/diff/TestGate).
- **OpenCode** remains experimental/default off; `LemonWoo: Run Harness Diagnostic` uses SecretStorage when the dev module resolves; packaged app shows unavailable fallback (no crash).
- **Gauntlets**: `pnpm v2:gauntlet`, `pnpm v2:web-preview-gauntlet` (real verify/preview adapters only; not yet agent→diff→preview E2E).
- **Default runtime**: `runAgentLoop` (unchanged).

## 2026-05-28 — v2 preview UX closeout

Dogfood showed preview server startup worked on disk but the webview stayed ambiguous (`Sirviendo`, URL not prominent). Fix on `feature/v2-preview-ux-closeout`:

- Webview shows **`Preview listo: http://localhost:<port>/`** (or **`Preview ya estaba activo:`** when reused).
- Status returns to **`Listo`** after URL is known; **`Detener servidor`** stays visible while active.
- Stop shows **`Servidor detenido.`** and hides the button when no server is running.
- Real port fallback (e.g. 8001 when 8000 is occupied) is shown in the URL, not an inferred default.

## v1 RC — 2026-05-28

LemonWoo **v1 RC** is published as tag **`v0.1.0-rc.1`**; in-app live dogfood is **PASS** (operator attestation).

Automated matrix on `main` @ `1f864b4` (PR #15 merged): `pnpm -r test`, `pnpm rc:check`, `pnpm release:check`, `smoke:bundle`, and release artifacts are **PASS**.

Live proof split:

- **CLI** `pnpm smoke:agent:live`: **SKIP exit 78** when `DEEPSEEK_API_KEY` is not in the shell (key configured only in LemonWoo.app SecretStorage).
- **In-app dogfood** (2026-05-28): operator attestation **PASS** for agent loop, TestGate, Tab completion, preview, and second-task isolation; workspace path/file mutation was not terminal-cross-verified — see [FUNCTIONAL-VERIFICATION.md](./FUNCTIONAL-VERIFICATION.md).

Prepared release notes: [docs/RELEASE-NOTES-v0.1.0-rc.md](./RELEASE-NOTES-v0.1.0-rc.md). Tag **`v0.1.0-rc.1`** is published on the repository; CLI live smoke may still SKIP when `DEEPSEEK_API_KEY` is only in LemonWoo.app SecretStorage.

Repository state:

- `main` @ `81a9da5` includes PR #12–#18 (v1 RC through v2.0 bounded runtime and functional gauntlet), native Flash Tab completion, first-run agent surface polish, and internal v2 tools.
- Working tree cleanliness is checked per branch before merge; `.serena/` may exist as an intentionally untracked local tool directory.

Compared with the original LemonWoo specification:

| Original requirement | Current status | Notes |
| --- | --- | --- |
| Standalone macOS app, not VS Code extension | Done | `dist/LemonWoo.app` is generated from repacked VSCodium and smoke-tested. |
| LemonWoo branding and isolated app identity | Done | Bundle id, executable, app name, data folder, helpers, product metadata, and ad-hoc signing are patched. |
| Single agent window as primary surface | Done | Strict `smoke:bundle` now requires the front window to be `LemonWoo Agent`; `Welcome` is no longer accepted. |
| One DeepSeek API key, BYOK | Done | Key is validated before `SecretStorage` write; invalid/network/rate-limit states are surfaced without logging the key. |
| Automatic Pro/Flash routing, no model picker | Done | Router keeps `tab`/`inline-edit`/`small-write` on Flash and agent/refactor/debug/verify on Pro. UI does not expose model/provider selection. |
| Agent can program locally | Implemented as v1 fallback | `runAgentTask` is a single-shot DeepSeek call with preassembled local context, streaming, diff proposal, apply, TestGate, and fix loop. It is not dynamic tool-calling. |
| Safe diff preview/apply | Done | Multi-file unified diffs, new files, path traversal/.git guards, hunk-context validation, and multiple-diff rejection are covered. |
| TestGate verification/fix loop | Done | TestGate runs selected scripts; failed output can be reinjected through **Corregir con agente**. |
| Local preview/dev-server action | Done | Prompt intent can start/reuse/stop a local server and show a concrete URL. |
| Release packaging and public guardrails | Done | DMG packaging, release checks, scope guard, public readiness, QA and troubleshooting docs are present. |
| Live DeepSeek vertical slice | In-app PASS / CLI SKIP | Operator dogfood with key in SecretStorage (2026-05-28). CLI `smoke:agent:live` SKIP 78 without shell key is expected. Do not claim CLI PASS when SKIP. |
| Tab autocomplete as editor feature | Done | Registered as native VS Code inline completion provider (`vscode.languages.registerInlineCompletionItemProvider`) using DeepSeek Flash, with full context limit checks, debounce/cancellation, and error safety. |
| MCP, multi-agent, persistent memory, Stripe, OpenTelemetry, browser agents | Explicitly out of v1 | Guardrails enforce this scope. These remain v1.1+ roadmap only. |

Current stage summary:

- **Product shell:** ready.
- **Agent surface:** ready.
- **Agent programming loop:** implemented and tested with mocks/fixtures.
- **Live API proof:** in-app dogfood PASS by operator attestation; CLI smoke optional with shell key, or re-run manual dogfood with terminal cross-check before tag if stricter evidence is desired.
- **Public/release docs:** ready.
- **Next decision:** review and merge the in-app dogfood hardening branch, then rerun the copied-fixture dogfood in `LemonWoo.app` to get a terminal-cross-verified green pass.

## 2026-05-28 — v2.0 functional dogfood gauntlet

- Added `fixtures/v2-multi-file-agent`, a seeded-red multi-file invoice fixture with bugs split across calculation, tax rounding, and currency formatting.
- Added `scripts/v2-functional-gauntlet.mjs` and root command `pnpm v2:gauntlet`.
- The gauntlet copies the fixture to a temp workspace, runs the real `runAgentTask` v2 loop with deterministic mock DeepSeek responses, exercises internal `search`, `read_file`, `test_gate`, and `propose_diff`, applies the proposed diff outside the runtime, confirms TestGate remains red, reinjects failure output through the repair path, applies a second diff, and verifies final TestGate green.
- Evidence:
  - initial fixture `npm test`: red by design.
  - `pnpm v2:gauntlet`: PASS.
  - first pass touched `src/invoice.js` and `src/tax.js`.
  - repair pass touched `src/format.js`.
  - final TestGate command: `test`.

## 2026-05-28 — v2.0 in-app dogfood hardening

- A real `LemonWoo.app` dogfood run was executed on a copied fixture at `/tmp/lemonwoo-v2-manual`, with the DeepSeek key kept only in LemonWoo.app `SecretStorage`.
- Baseline terminal check on the copied fixture: `npm test` was red as expected.
- The agent inspected the fixture and produced a plausible multi-file diff, but **Apply diff** failed with `src/invoice.js: Contexto del hunk no coincide con el archivo actual`.
- Root cause: model-generated unified diffs can contain stale hunk line numbers even when the context is unique and safe to match.
- Fix in `packages/agent-runtime/src/multiDiff.ts`: if the preferred hunk line does not match, LemonWoo now searches for an exact, unique old-context match after the current cursor and applies there; ambiguous matches still fail closed.
- Added regression tests for unique stale-line application and ambiguous stale-line rejection.
- Verification:
  - `pnpm --filter @lemonwoo/agent-runtime test`: PASS.
  - `pnpm v2:gauntlet`: PASS.
  - `pnpm -r test`: PASS.
  - `pnpm verify:docs`: PASS.
  - `pnpm check:secrets`: PASS.
- The full in-app green pass is still pending because the post-fix live app retry remained long-running after file reads and was cancelled rather than reported as PASS.

## 2026-05-28 — v2.0 apply-to-disk hardening

- A follow-up in-app retry showed another product issue: `workspace.applyEdit` could leave changed files dirty in editor buffers while terminal/TestGate still saw old disk contents.
- `extensions/lemonwoo-ai/src/multiDiffApply.ts` now saves every touched document after `workspace.applyEdit`.
- If any document cannot be saved, LemonWoo returns a clear `No se pudo guardar <file>` error instead of silently leaving TestGate on stale disk state.
- Added a manifest-level regression check that apply flow calls `doc.save()`.
- Verification:
  - `pnpm --filter lemonwoo-ai test`: PASS.
  - `pnpm -r build`: PASS.

## 2026-05-28 — v1 live beta closeout (in progress)

- `scripts/live-agent-smoke.mjs` now pings Flash (`tab`) and Pro (`agent`) before the agent-loop fixture; redacts secrets; requires `pnpm -r build`; cleans temp dirs in `finally`.
- `runAgentTask` wires `shouldEscalateToPro` for write-routed tasks (multi-file / test failure) with a single Pro retry.
- `docs/QA-MANUAL-ES.md` adds a repeatable fixture-based programming loop checklist.
- Live smoke in CI/local without key: **SKIP exit 78** (documented; not RC failure).

## 2026-05-28 — Final RC Gauntlet & Public Beta Readiness Hardening

- Refined the Welcome tab closing filter in `isWelcomeTab` to support remote workspace schemes (e.g. `vscode-remote`, `git`), preventing accidental file closures.
- Fixed an agent state leak in `runAgentCycle` by resetting the proposed diff and touched files on loop startup.
- Handled standard DOM abort errors in `runAgentCycle` to prevent stack traces from surfacing in the UI.
- Updated `smoke-bundle.sh` to check for window title contains "LemonWoo Agent" instead of starts with, adapting to prepended workspace folders.
- Refined localhost preview intent matching to prevent greedy hijacking of standard localhost mentions.
- Secured the local server lifecycle process checks (via exitCode/signalCode), registered exit handlers immediately, and prevented process leaks.
- Stripped ANSI color sequences from preview logs and resolved Vitest relative test paths.
- Added `keys`, `certificates`, and `credentials` folder exclusions to native Tab autocomplete and added size limit validation tests.
- Rebranded remaining unbranded Info.plist fields (Icon, Copyright, Camera/Microphone descriptions, CFBundleTypeName) and helper sub-identifiers using Python recursive plist editing scripts.
- Hardened `rc-check.sh` to capture and log step errors into the JSON results file, and added `pnpm package:dmg` to the pipeline.
- Resolved space path parsing and target DMG host-architecture queries in `write-rc-report.mjs`.
- Passed the active API key to `redactSecrets` inside `live-agent-smoke.mjs`.
- Verified that all workspace tests, packaging runs, release audits, branding checks, and bundle launches pass cleanly.

## 2026-05-28 — Final RC validation and fix pass

- Resolved a critical Webview timing race where `ensureKey` was called synchronously on startup before the Webview HTML had fully loaded and set up its message listener. Registered `onDidReceiveMessage` before setting `webview.html = renderHtml()`, and added an `initialized` handshake message from the Webview script to the extension, triggering state setup only when the Webview is ready.
- Fixed an aggressive Welcome tab closing issue where `isWelcomeTab` closed normal workspace files containing `"welcome"` in their path or label. Added a scheme check to exclude local files (`scheme: 'file'`) from being auto-closed.
- Fixed Vitest path resolution in `manifest.test.ts` to resolve paths relative to `import.meta.url` rather than `process.cwd()`. Added a test in `manifest.test.ts` to enforce the order of `onDidReceiveMessage` registration and `webview.html` assignment.
- Hardened `build-mac.sh` to change directories to the repository root directory before executing `pnpm` builds, ensuring CWD independence.
- Corrected test count references in `docs/FUNCTIONAL-VERIFICATION.md` to reference general workspace tests passing cleanly.
- Verified that all unit tests, release checks (`pnpm release:check`), and quality checks (`pnpm rc:check`) pass cleanly.

## 2026-05-28 — First-run agent surface polish

- Startup prioritizes LemonWoo Agent as the primary surface and safely closes Welcome-only tabs (without closing dirty or pinned user tabs).
- Webview first-focus was polished:
  - no key -> autofocus on DeepSeek API key input,
  - key present -> autofocus on the agent prompt box.
- Added extension manifest tests to lock this behavior (startup surface and autofocus contracts).

Do not start v1.1 work yet. The next meaningful work is validation and stabilization of this v1 release candidate.

## 2026-05-28 — v1 functional dogfood hardening (in progress)

- Welcome tabs are re-closed when tab groups change while LemonWoo Agent is open (without stealing editor focus via `reveal` on every tab change).
- Agent panel open failures surface via `showErrorMessage` instead of silent `void`.
- TestGate runs `typecheck` before `lint`, blocks destructive script bodies, and fails clearly when no scripts match.
- Local preview intent no longer hijacks casual `localhost` mentions; preview logs with ANSI colors still parse URLs; failed starts SIGTERM then SIGKILL orphaned processes.
- Tab autocomplete strips markdown code fences from model output.
- `pickTaskKind` no longer routes normal agent prompts containing “inline” to Flash.
- Live smoke script requires `pnpm -r build` artifacts before importing packages.

## 2026-05-28 — Document consistency guardrail (v1 RC hardening)

- Added automated document consistency guardrail (`scripts/verify-docs-current.mjs`) to scan for obsolete references, outdated features, or local paths.
- Exposed check via npm script `verify:docs`.
- Integrated `verify:docs` into the release candidate validation pipeline (`scripts/rc-check.sh`) right after the public readiness check.
- Documented the verification command in `README.md` and updated pre-publication checklist in `docs/PUBLIC-RELEASE-CHECKLIST.md`.

## 2026-05-28 — RC distribution hardening

- Added reproducible RC validation entrypoint:
  - `scripts/rc-check.sh`
  - `pnpm rc:check`
  - Handles `pnpm smoke:agent:live` exit `78` as expected external skip (`DEEPSEEK_API_KEY` absent), not as RC failure.
- Added reproducible RC reporting:
  - `scripts/write-rc-report.mjs`
  - `pnpm rc:report`
  - Generates local `dist/RC-REPORT.md` with git metadata, version, artifact paths, DMG SHA256, and last RC-check summary.
  - Keeps `docs/RC-REPORT.md` as the stable public template.
- Hardened packaging:
  - `scripts/package-dmg.sh` now generates `dist/LemonWoo-<version>-mac-<arch>.dmg`.
  - Writes adjacent checksum `*.dmg.sha256`.
  - Verifies DMG via `hdiutil verify`.
  - Emits clear guidance when `dist/LemonWoo.app` is missing.
- Hardened artifact verification:
  - `scripts/verify-release-artifacts.sh` keeps explicit skip behavior when `dist/` is absent.
  - Validates app bundle id, executable, plist branding, visible prohibited references with allowlist, DMG verification, and checksum match.
- Documentation refreshed for RC/install flow:
  - `docs/RELEASE-MAC.md`
  - `docs/INSTALL-ES.md`
  - `docs/FUNCTIONAL-VERIFICATION.md`
  - `docs/PUBLIC-RELEASE-CHECKLIST.md`
  - `README.md`

Pending before public GA:

- Run one full `pnpm rc:check` with a real `DEEPSEEK_API_KEY` to convert live smoke from expected skip to pass evidence.
- Optional future hardening outside this block: Apple Developer ID signing + notarization.

## 2026-05-27

- Created LemonWoo v1 monorepo with required directory layout:
  - `apps/desktop`
  - `extensions/lemonwoo-ai`
  - `packages/deepseek`
  - `packages/agent-runtime`
  - `packages/test-gate`
  - `vendor/continue-config`
  - `scripts`
  - `docs`
  - `dist/LemonWoo.app`
- Implemented build-first desktop flow:
  - `apps/desktop/build-mac.sh`
  - `apps/desktop/rebrand-macos.sh`
  - product-level rebrand + `open dist/LemonWoo.app` smoke.
- Initial launch stability kept upstream Electron executable/helper names while applying product-level rebrand.
- Added LemonWoo branding keys in packaged `app/product.json` validation.
- Added builtin extension `lemonwoo-ai` with:
  - `LemonWoo: Open Agent` command
  - single webview panel
  - states (`Pensando`, `Escribiendo`, `Verificando`)
  - SecretStorage onboarding for DeepSeek key
  - diff preview/apply flow with workspace and `.git` guards
  - TestGate trigger.
- Added `packages/deepseek` with:
  - Pro/Flash router
  - redaction
  - timeout/retry scaffolding
  - `/models` alias fallback resolver.
- Added `packages/test-gate` with script detection and process execution.
- Added `packages/agent-runtime` OpenCode SDK spike path.

Executed checks and tests:

```bash
pnpm -r test
pnpm build:mac
pnpm smoke:bundle
pnpm check:branding
pnpm check:secrets
pnpm check:licenses
```

## 2026-05-28

- Reviewed the PR against the simplified LemonWoo v1 plan and found the main remaining gap: the agent was implemented, but it was still command-driven instead of being the primary visible surface at app startup.
- Updated `lemonwoo-ai` so the single agent webview opens automatically on `onStartupFinished` while keeping `LemonWoo: Open Agent` as a recovery command.
- Simplified the panel into the v1 surface:
  - DeepSeek API key connection box.
  - One agent text area.
  - Visible states: `Listo`, `Pensando`, `Escribiendo`, `Verificando`.
  - Diff apply and verification buttons only appear when relevant.
- Wired the Stop button to a real `AbortController`; it now cancels active DeepSeek requests instead of only changing text in the UI.
- Added live model resolution in the extension:
  - preferred internal IDs: `deepseek-v4-pro` / `deepseek-v4-flash`
  - alias fallback: `deepseek-reasoner` / `deepseek-chat`
  - non-blocking fallback to v4 constants if `/models` is unavailable.
- Added actual panel-level routing:
  - small write tasks route to Flash and show `Escribiendo`
  - agent/refactor/debug/test/analysis tasks route to Pro and show `Pensando`.
- Added git diff context and safer workspace path validation using `node:path.relative` instead of prefix matching.
- Replaced the unsafe "collect all added lines" apply behavior with a unified-diff applier that verifies hunk context against the active file before calling `WorkspaceEdit`.
- Updated tests to assert startup activation, safer path guarding, and real cancellation wiring.
- Updated `build-mac.sh` to build `@lemonwoo/agent-runtime` during macOS packaging.
- Fixed macOS identity isolation:
  - `Info.plist` now uses bundle id `dev.lemonwoo.ide`.
  - `CFBundleName`, `CFBundleDisplayName`, and `CFBundleExecutable` are `LemonWoo`.
  - Electron helper app bundles/executables are renamed to `LemonWoo Helper*`.
  - helper bundle ids use `dev.lemonwoo.ide.helper`.
  - build performs ad-hoc deep signing after patching.
- Strengthened `smoke-bundle.sh`; it now fails unless the LemonWoo process is running and the front window is `LemonWoo Agent`.
- Closed the v1 "chat suggests vs agent acts locally" gap for Preview/Dev Server:
  - Added `extensions/lemonwoo-ai/src/localActions.ts` as a minimal local action router layer.
  - Prompt intent detection now intercepts preview requests (`levantá servidor`, `quiero ver la página`, `localhost`, etc.) before DeepSeek calls.
  - Implemented one running server per workspace with reuse behavior and explicit stop support.
  - Implemented safe server startup planning:
    - `package.json` script selection priority: `dev` -> `start` -> `serve` -> `preview`.
    - package manager selection by lockfile (`pnpm-lock.yaml`/`yarn.lock`/fallback `npm`).
    - static fallback to `python3 -m http.server` when only `index.html` exists.
  - Added startup timeout (30s), URL parsing from stdout/stderr, recent log capture, and secret redaction in server logs.
  - Added explicit safety rejection for dangerous script commands (`install`, `npx`, `sudo`, `rm`, `curl | sh`, `git push`).
  - Updated webview UX:
    - Shows concrete server action output with URL.
    - Shows `Detener servidor` only while a server is active.
    - Keeps Stop/Retry/Apply/TestGate behavior intact.
  - Updated DeepSeek system prompt truthfulness rules so outputs do not claim execution unless verified.
  - Diff-containing responses are labeled as `Propuesta` until apply succeeds; after apply the panel shows `diff aplicado`.
- Added preview fixture at `fixtures/static-site/index.html` for manual verification flow.
- Added mandatory tests for local action routing in `extensions/lemonwoo-ai/test/local-actions.test.ts`.
- Updated bundle smoke script to require a real `LemonWoo Agent` front window and degrade gracefully only if macOS denies System Events permission.

Executed checks after corrections:

```bash
pnpm -r test
pnpm -r build
pnpm check:branding
pnpm check:secrets
pnpm check:licenses
pnpm smoke:bundle
```

Executed checks after local action router implementation:

```bash
pnpm -r test
pnpm build:mac
pnpm check:branding
pnpm check:secrets
pnpm smoke:bundle
```

Result:

- Workspace tests passed, including new local action router test coverage.
- `dist/LemonWoo.app` rebuilt successfully.
- Branding and secrets checks passed.
- Bundle smoke passed with LemonWoo Agent window detection.

Manual launch evidence:

```text
open dist/LemonWoo.app
process: dist/LemonWoo.app/Contents/MacOS/LemonWoo
user-data-dir: ~/Library/Application Support/LemonWoo
front window: LemonWoo Agent
```

## 2026-05-28 — Agent programming loop v1

- Implemented internal agent runtime fallback in `@lemonwoo/agent-runtime`:
  - `runAgentTask` / `runAgentTaskOnce` with phase events (`Pensando`, `Escribiendo`, `Verificando`).
  - Uses `@lemonwoo/deepseek` `DeepSeekClient` + `buildMessages` (Pro for agent/verify/debug/refactor).
  - OpenCode spike kept separate (`opencodeSpike.ts`); not required for the v1 loop.
- Added multi-file unified diff support:
  - `parseMultiFileDiff`, `planMultiFileApply`, safe path guards, all-or-nothing apply planning.
  - VS Code apply via `multiDiffApply.ts` (`WorkspaceEdit`, new file creation).
- Wired extension to workspace packages (esbuild bundle):
  - `agentContext.ts` gathers AGENTS.md, `.lemonwoo/rules`, git diff, diagnostics, repo tree, on-demand `rg`.
  - `handleRun` uses `runAgentTask` instead of inline fetch chat.
  - TestGate uses `@lemonwoo/test-gate` with touched files from last apply.
  - **Corregir con agente** appears when TestGate fails and re-runs agent with test output.
- Added fixture `fixtures/agent-loop-ts` (intentionally failing `sum` test).
- Tests added/updated in `packages/agent-runtime/test/*` and `extensions/lemonwoo-ai/test/agent-loop.test.ts`.

Executed checks:

```bash
pnpm -r test
pnpm -r build
pnpm check:branding
pnpm check:secrets
pnpm smoke:bundle
pnpm release:check
```

Result (2026-05-28):

- Workspace tests green via `pnpm -r test` (see CI/local logs for current counts).
- `dist/LemonWoo.app` rebuilt and smoke-launched with `LemonWoo Agent` window.
- `dist/LemonWoo-0.1.0-mac-arm64.dmg` packaged successfully.

## 2026-05-28 — Agent loop audit fixes

- Editor context: `editorTracking.ts` + explicit editor passed to `gatherAgentContext` (webview focus safe).
- Repo tree: `repoFiles.ts` keeps fixed workspace root for paths like `src/sum.ts`.
- Fix loop: `lastUserTask` preserved for **Corregir con agente**.
- Documented `runAgentTask` as v1 single-shot fallback (not dynamic tool-calling).

## 2026-05-28 — Live DeepSeek agent UX hardening

- Onboarding key path now validates against DeepSeek before storing in `SecretStorage`.
  - Success path: stores key only on `validateKey.status === valid`.
  - Failure path: `Key inválida.` / `Sin red o DeepSeek no disponible.` without storing.
- Added visible incremental agent streaming in single panel via `runAgentTask` `delta` events.
  - Falls back to buffered response if stream path fails.
  - Stop keeps real abort behavior with no further token updates.
- Improved UX messaging without adding UI complexity:
  - `Conectando DeepSeek...`
  - `Rate limit, reintentando.`
  - `Diff listo para revisar.`
  - `Tests fallaron, podés corregir con agente.`
- Diff/apply hardening:
  - Rejects multiple fenced diff blocks as unsafe ambiguity.
  - Keeps path traversal and `.git` protections intact.
  - Does not enable apply on empty/non-diff responses.
- Added live smoke script `scripts/live-agent-smoke.mjs` + root script `smoke:agent:live`.
  - Gate behavior: exits 78 with `SKIP: falta DEEPSEEK_API_KEY` if key is missing.
  - Uses temp copy of `fixtures/agent-loop-ts`; never mutates original fixture.
- Updated QA/Troubleshooting docs for real-world failure cases (invalid key, rate limit, streaming cut, stop behavior, diff mismatch, TestGate deps, live smoke skip).
- Fixed bundled extension activation in the packaged app:
  - `lemonwoo-ai` keeps `"type": "module"` but now points `"main"` to `./dist/extension.cjs`.
  - esbuild emits `dist/extension.cjs`, avoiding `module is not defined in ES module scope`.
  - `smoke-bundle.sh` now quits stale LemonWoo processes before launch, so it tests the freshly built app.
  - Strict smoke requires the front window to be `LemonWoo Agent`.

Executed checks for this block:

```bash
pnpm -r test
pnpm -r build
pnpm check:branding
pnpm check:secrets
pnpm check:licenses
pnpm smoke:bundle
bash scripts/verify-v1-scope.sh
bash scripts/verify-public-readiness.sh
bash scripts/verify-release-artifacts.sh
pnpm smoke:agent:live   # SKIP (exit 78) without DEEPSEEK_API_KEY
pnpm release:check
```

## 2026-05-28 — Native Tab Completion

- Implemented native `vscode.languages.registerInlineCompletionItemProvider` in `lemonwoo-ai` extension, registered on startup.
- Integrated with DeepSeek Flash for high-speed autocomplete ghost text.
- Reuses the validated API key stored in `SecretStorage`, with cached `DeepSeekClient` reuse per key.
- Slices context safely (prefix 3000 chars, suffix 1500 chars).
- Enforces size limit (< 1MB), folder exclusions (`.git`, `node_modules`, `dist`, `build`, `out`), and sensitive-file exclusions (`.env`, credentials, SSH/AWS/Docker/kubeconfig/service-account files, key/cert formats).
- Implemented real abort/debounce cancellation using `AbortController` and VS Code's `CancellationToken`.
- Resets inline completion state and aborts in-flight requests when the user disconnects the API key.
- Protects against key leakage by running `redactSecrets` on errors.
- Added comprehensive unit and integration tests covering context slice, debounce/abort, secret redaction, and error safety.

Executed checks:

```bash
pnpm -r test
pnpm -r build
pnpm check:branding
pnpm check:secrets
pnpm check:licenses
pnpm smoke:bundle
bash scripts/verify-v1-scope.sh
bash scripts/verify-public-readiness.sh
bash scripts/verify-release-artifacts.sh
pnpm smoke:agent:live   # SKIP (exit 78) without DEEPSEEK_API_KEY
```

Result:

- Native inline completion branch was merged to `main`.
- `lemonwoo-ai` extension suite: green via `pnpm --filter lemonwoo-ai test`.
