# FUNCTIONAL VERIFICATION

This file records command-level evidence for the required v1 vertical slice.

## Status

- Automated pass with executable app bundle, release checks, native Tab completion tests, and core guardrails green.
- Live DeepSeek smoke remains environment-gated by user API key and in-app manual run.
- 2026-05-28 correction pass: the LemonWoo agent is now startup-activated and no longer requires the user to discover a command before seeing the primary v1 surface.
- 2026-05-28 preview/dev-server pass: local preview intent is now executed as a verified local action (server startup, URL detection, stop), not answered as tutorial text.

## v2.0 agent runtime real (development)

Automated coverage (`packages/agent-runtime/test/runAgentLoop.test.ts`, `tools.test.ts`):

- Bounded loop with `maxSteps` default 6 and warning on exhaustion.
- Internal `<lemonwoo_tool>` parsing for read_file / search / propose_diff / test_gate / summarize.
- Path safety: rejects `.git`, traversal, absolute paths.
- Runtime does not write to disk; apply remains extension-only.
- Extension wires `buildAgentAdapters` and summarizes tool events in the existing stream (no tool console UI).

## v2.0 functional dogfood gauntlet (2026-05-28)

Fixture:

- `fixtures/v2-multi-file-agent`

Command evidence:

```bash
pnpm -r build
pnpm v2:gauntlet
```

Result:

```text
V2 functional gauntlet passed.
First pass touched: src/invoice.js, src/tax.js
Repair pass touched: src/format.js
Final commands: test
```

What this proves:

- The seeded fixture starts red with `npm test`.
- The runtime performs a bounded multi-step pass using internal `search`, `read_file`, `test_gate`, and `propose_diff` tools.
- The runtime proposes but does not apply patches.
- The external apply path applies the first multi-file diff on a temp workspace.
- TestGate remains red after the first patch, so failure output is reinjected through the repair path.
- The repair pass proposes a second diff and final TestGate is green.
- The source fixture remains seeded red after the gauntlet, proving the automated run mutates only a temp copy.

Remaining manual confirmation:

- Copy `fixtures/v2-multi-file-agent` to `/tmp/lemonwoo-v2-manual` and open that copied folder in `LemonWoo.app` with the existing DeepSeek key in SecretStorage.
- Ask the same task from `/tmp/lemonwoo-v2-manual/TASK.md`.
- Apply diff, run **Verificar**, and use **Corregir con agente** if TestGate is red.
- Cross-check `/tmp/lemonwoo-v2-manual` from the terminal with `npm test`.

## v2.0 in-app dogfood hardening (2026-05-28)

Operator: Codex via Computer Use controlling the actual macOS `LemonWoo.app`.

Fixture copy:

```bash
rm -rf /tmp/lemonwoo-v2-manual
cp -R fixtures/v2-multi-file-agent /tmp/lemonwoo-v2-manual
cd /tmp/lemonwoo-v2-manual && npm test
```

Baseline result: `npm test` failed as expected before the agent patch.

In-app observations:

- `LemonWoo.app` opened `/tmp/lemonwoo-v2-manual` with `LemonWoo Agent` as the active surface.
- The DeepSeek key was already connected via app `SecretStorage`; no key was read from shell, logs, Keychain, or files.
- The agent used internal tool syntax and read `AGENTS.md`, `TASK.md`, `package.json`, source files, and the test file.
- The first response produced a plausible multi-file diff.
- Clicking **Aplicar diff** failed safely with `src/invoice.js: Contexto del hunk no coincide con el archivo actual`.

Code hardening added from this dogfood:

- `planMultiFileApply` now tolerates stale model-generated hunk line numbers only when the old hunk context matches exactly once after the current cursor.
- Ambiguous stale-context hunks continue to fail closed.

Command evidence after the fix:

```bash
pnpm --filter @lemonwoo/agent-runtime test
pnpm v2:gauntlet
pnpm -r test
pnpm verify:docs
pnpm check:secrets
```

Result:

- All commands above passed.
- Full in-app green pass remains pending: after rebuilding and rerunning `LemonWoo.app`, the live model run stayed in `Pensando` after file reads long enough to cancel instead of claiming a pass.

## v2.0 apply-to-disk hardening (2026-05-28)

Follow-up in-app observation:

- After a later run, LemonWoo showed changed editor buffers for `invoice.js`, `tax.js`, and `format.js`, but terminal `npm test` still read the original disk files.
- This exposed a critical gap: `workspace.applyEdit` can update editor buffers without persisting them before TestGate/terminal checks.

Fix:

- `applyMultiFileDiff` now saves each touched `TextDocument` after `vscode.workspace.applyEdit`.
- Save failure is surfaced as `No se pudo guardar <file>`.

Command evidence:

```bash
pnpm --filter lemonwoo-ai test
pnpm -r build
```

Result:

- Both commands passed.
- Full in-app cross-verified green pass is still pending; this section records the hardening needed before rerunning it.

## v1 final RC validation run (2026-05-28, main @ 7257be0)

| Check | Result |
| --- | --- |
| `pnpm -r build` / `pnpm -r test` | PASS |
| `pnpm rc:check` / `pnpm release:check` | PASS |
| `pnpm smoke:bundle` | PASS (`LemonWoo Agent` window) |
| `verify-release-artifacts` / `hdiutil verify` | PASS on `dist/LemonWoo-0.1.0-mac-arm64.dmg` |
| `pnpm smoke:agent:live` | **SKIP exit 78** — `DEEPSEEK_API_KEY` not set in validation environment |
| Manual dogfood in `LemonWoo.app` | **PASS** by operator attestation (2026-05-28, key in SecretStorage only); workspace path/file mutation not terminal-cross-verified |
| Git tag `v0.1.0-rc.1` | **Published** — see git tag `v0.1.0-rc.1` on `main` |

## In-app live dogfood (2026-05-28, main @ `1f864b4`)

DeepSeek key configured **only inside LemonWoo.app** (SecretStorage). No key was read from Keychain, logs, or the shell.

| Step | Operator result |
| --- | --- |
| LemonWoo Agent primary on launch | PASS |
| Key already connected (no re-prompt) | PASS |
| Agent prompt focused and usable | PASS |
| Opened fixture workspace in LemonWoo.app | PASS by operator attestation |
| Agent task + diff for `sum` fix | PASS by operator attestation |
| Apply diff | PASS by operator attestation |
| TestGate / verify after apply | PASS by operator attestation (in-app) |
| Corregir con agente (if needed) | N/A (TestGate passed) |
| Tab completion ghost text (`.ts`) | PASS |
| Local preview URL + stop server | PASS |
| Second task without stale diff | PASS |

CLI live smoke on the same machine without `DEEPSEEK_API_KEY` in the shell:

| Check | Result |
| --- | --- |
| `pnpm smoke:agent:live` | **SKIP exit 78** — expected; key lives in-app only |

Maintainer spot-check (this git clone, after dogfood): tracked `fixtures/agent-loop-ts/src/sum.ts` was still the seeded bug and `npm test` was red. Treat the table above as an in-app operator attestation, not as terminal-cross-verified evidence for this exact tracked fixture path. Tag **`v0.1.0-rc.1`** is already published; either accept that manual attestation explicitly or re-run the in-app flow while cross-verifying file mutation and tests from the terminal.

## v1 live beta closeout (2026-05-28)

`pnpm smoke:agent:live` (after `pnpm -r build`):

| Condition | Expected |
| --- | --- |
| `DEEPSEEK_API_KEY` unset | exit **78**, stderr contains `SKIP: falta DEEPSEEK_API_KEY` |
| Key set | Flash ping (`task: tab`, `modelLabel: flash`), Pro ping (`task: agent`, `modelLabel: pro`), then agent-loop fixture diff + green `npm test` in temp workspace |

Evidence rules:

- Logs must not contain the raw API key (`redactSecrets` in script).
- Do not document **PASS** for live smoke unless a real-key run succeeded in that environment.
- `runAgentTask` escalates write-routed tasks via `shouldEscalateToPro` (covered in `packages/agent-runtime/test/runAgentTask.test.ts`).

Manual operator checklist: `docs/QA-MANUAL-ES.md` §3b.

## Build-first evidence

```bash
pnpm build:mac
```

Result:

- `dist/LemonWoo.app` created.
- Bundle created from stable VSCodium archive and rebranded at product config layer.

## Bundle smoke

```bash
pnpm smoke:bundle
```

Result:

```text
Bundle smoke: LemonWoo launched with LemonWoo Agent window
```

## Branding check

```bash
pnpm check:branding
```

Result:

```text
Branding key fields verified
Branding check passed
```

Validated keys in packaged app product config:

- `nameShort = LemonWoo`
- `nameLong = LemonWoo`
- `applicationName = lemonwoo`
- `dataFolderName = .lemonwoo`
- `serverApplicationName = lemonwoo-server`

Runtime note:

- `Info.plist` bundle identifier is `dev.lemonwoo.ide`.
- `CFBundleName`, `CFBundleDisplayName`, and `CFBundleExecutable` are `LemonWoo`.
- Electron helper app bundles/executables are renamed to `LemonWoo Helper*`; helper bundle ids are `dev.lemonwoo.ide.helper`.
- The bundle is ad-hoc signed after patching so macOS can launch the modified app.

## Security checks

```bash
pnpm check:secrets
pnpm check:licenses
```

Result:

- Secret scan passed.
- License files present.

## Unit/integration tests

```bash
pnpm -r test
```

Result: all workspace test suites passed.

Covered contracts include:

- Pro/Flash router behavior.
- Escalation rules.
- V4 and alias model ID resolution.
- Missing API key behavior.
- Secret redaction.
- Context hooks for `AGENTS.md` and `.lemonwoo/rules`.
- Path safety guard checks in apply flow.
- Unified diff apply flow verifies hunk context before editing the active file.
- Startup activation for the single agent surface.
- Real Stop/AbortController wiring for active requests.
- TestGate script decision and redaction behavior.
- Runtime exclusion guard for Anthropic compatibility.
- Local preview intent detection.
- Script selection priority (`dev` -> `start` -> `serve` -> `preview`).
- Package manager selection by lockfile.
- Python static fallback with `index.html`.
- Localhost URL parsing from process output.
- Dangerous command rejection in preview startup scripts.
- Log redaction in local preview output.
- Spawn safety (`shell: false`) for preview process creation.
- Clear error when workspace is not servable.

## Correction pass evidence

```bash
pnpm -r build
pnpm check:branding
pnpm check:secrets
pnpm check:licenses
pnpm smoke:bundle
```

Result:

- `dist/LemonWoo.app` rebuilt successfully.
- Packaged builtin extension includes `onStartupFinished`.
- Branding, signature verification, secret scan, license presence, and bundle smoke checks passed.
- Manual AppleScript verification found process `LemonWoo` with front window `LemonWoo Agent`.

## OpenCode runtime spike

```bash
pnpm opencode:spike
```

Structured checks (see [UPSTREAMS.md](./UPSTREAMS.md), [HARNESS-EVALUATION.md](./HARNESS-EVALUATION.md)):

| Check | Typical result (no shell key) |
| --- | --- |
| `SDK_IMPORT` | PASS |
| `CLI_AVAILABLE` | PASS when `opencode-ai` devDependency installed or `opencode` on PATH |
| `DEEPSEEK_CONFIG` | SKIP — `DEEPSEEK_API_KEY` not in shell (expected when key is only in LemonWoo.app SecretStorage) |
| `SESSION_CREATE` | PASS when CLI available |
| `SIMPLE_PROMPT` | SKIP without shell key |
| `TOOL_LOOP_CAPABLE` | PASS when server starts |
| `FIXTURE_MULTI_FILE` | SKIP without live DeepSeek key |

Previous failure (`spawn opencode ENOENT`) is documented as a **binary resolution** issue, not an SDK compile failure. Do not claim live DeepSeek PASS without shell key evidence.

## Manual validation still required in LemonWoo UI

1. Open `LemonWoo.app`.
2. Confirm the LemonWoo Agent panel appears automatically.
3. Paste DeepSeek API key in onboarding input.
4. Open fixture TS repo.
5. Chat request -> diff preview -> Apply -> TestGate.
6. Press Stop during a long request and confirm it cancels.
7. If tests fail, run correction cycle.

These steps are implemented but require interactive IDE confirmation.

## Manual preview/dev-server verification

Fixture added:

- `fixtures/static-site/index.html`

Steps:

1. Open `LemonWoo.app`.
2. Open folder `fixtures/static-site` (or a workspace with `package.json` + `dev/start/serve/preview` script).
3. In LemonWoo Agent, ask: `quiero ver la página en una URL, levantá un servidor local`.
4. Confirm panel shows concrete local action with:
   - server started/reused message,
   - local URL,
   - recent logs,
   - `Detener servidor` button visible.
5. Open the shown URL and verify page responds.
6. Click `Detener servidor`.
7. Confirm the local URL/port no longer responds.

Command evidence for this stage:

```bash
pnpm -r test
pnpm build:mac
pnpm check:branding
pnpm check:secrets
pnpm smoke:bundle
```

Result:

- All commands passed after local action router implementation.

## Agent programming loop (2026-05-28)

Fixture:

- `fixtures/agent-loop-ts/` (`src/sum.ts` bug, `test/sum.test.ts` fails until fixed)

Automated coverage:

```bash
pnpm -r test
```

Includes:

- `runAgentTask` single-shot cycle with mocked DeepSeek client (not dynamic tool-calling).
- Editor snapshot / explicit editor for `gatherAgentContext`.
- Nested repo tree paths (`src/...`).
- `lastUserTask` for TestGate fix loop.
- Multi-file diff parse/apply safety (path traversal, `.git/`, new file, hunk mismatch without partial apply).
- Context exclusions and on-demand `rg` heuristics.
- Extension wiring for `Corregir con agente`, `runTestGate`, `planMultiFileApply`.

Manual vertical slice:

1. Open `LemonWoo.app` and folder `fixtures/agent-loop-ts`.
2. Ask: `Arreglá el test que falla en sum`.
3. Review proposed multi-file (or single-file) `diff` in panel.
4. Click **Aplicar diff**.
5. Click **Verificar** (TestGate).
6. If red, click **Corregir con agente** and repeat until green.

Command evidence:

```bash
pnpm -r test
pnpm -r build
pnpm check:branding
pnpm check:secrets
pnpm smoke:bundle
```

## Live DeepSeek Agent UX Pass

Commands for this pass:

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
pnpm smoke:agent:live
```

Live smoke gate behavior:

- If `DEEPSEEK_API_KEY` is missing, `pnpm smoke:agent:live` exits `78` with:
  - `SKIP: falta DEEPSEEK_API_KEY`
- This is documented as an external gating condition, not a pass.

Result in this run:

```text
$ pnpm smoke:agent:live
SKIP: falta DEEPSEEK_API_KEY
exit_code=78
```

Release pipeline:

```bash
pnpm release:check
```

Result:

- Completed successfully (tests, build, checks, bundle smoke, DMG packaging).

Manual LemonWoo.app vertical slice:

1. Abrir `LemonWoo.app`.
2. Pegar key DeepSeek y conectar (con validación real).
3. Abrir `fixtures/agent-loop-ts`.
4. Pedir: `Arreglá el test que falla en sum`.
5. Ver streaming incremental en el panel.
6. Aplicar diff.
7. Ejecutar Verificar.
8. Si falla, usar Corregir con agente.
9. Confirmar test verde.

## RC distribution hardening (2026-05-28)

Commands executed for this block:

```bash
bash -n scripts/package-dmg.sh scripts/release-check.sh scripts/verify-release-artifacts.sh
pnpm -r test
pnpm -r build
pnpm check:branding
pnpm check:secrets
pnpm check:licenses
pnpm smoke:bundle
bash scripts/verify-v1-scope.sh
bash scripts/verify-public-readiness.sh
bash scripts/verify-release-artifacts.sh
pnpm rc:check
pnpm rc:report
pnpm release:check
```

Evidence goals covered:

- Reproducible RC gate via `pnpm rc:check` with ordered checks.
- External-gated live smoke handling (`exit 78`) as expected skip when key is absent.
- DMG artifact naming hardened to `LemonWoo-<version>-mac-<arch>.dmg` with `.sha256`.
- Artifact verifier now checks app metadata, executable, prohibited references with allowlist, DMG integrity, and checksum consistency.
- RC report generated at `dist/RC-REPORT.md` with git/artifact/check status.

## Native Tab Completion (2026-05-28)

We verified the native Tab autocomplete functionality through automated testing and compliance runs.

### Automated Tests
The new tests in `extensions/lemonwoo-ai/test/inlineCompletion.test.ts` verify:
1. **API Key Checks**: Autocomplete is disabled if no DeepSeek API key is present in `SecretStorage`.
2. **Exclusion Boundaries**: Files inside `.git/`, `node_modules/`, `dist/`, `build/`, `out/`, sensitive credential paths, non-file schemes, non-code languages, or files larger than 1MB are ignored.
3. **Context Limits**: Text context is limited to the last 3000 characters before the cursor and the first 1500 characters after the cursor.
4. **Debounce & Cancellation**: Rapid typing waits 300ms before touching the network and aborts stale requests.
5. **Secret Redaction**: Errors redact the API key.
6. **Conversion**: Successful completions return a `vscode.InlineCompletionItem` with the expected ghost text.
7. **Disconnect safety**: Disconnecting the API key resets cached clients and aborts in-flight completion requests.

All workspace tests run and pass cleanly:
```bash
pnpm -r test
```
Latest hardening result: all tests in the extension suite passed cleanly.

## First-run agent surface polish (2026-05-28)

Scope:

- Keep LemonWoo Agent as the unequivocal first visible surface.
- Avoid Welcome taking over the primary editor surface.
- Improve first-focus behavior in the agent webview.

Behavior verification:

- Startup closes only Welcome-like tabs (safe filter: non-dirty + non-pinned + Welcome detection) before revealing LemonWoo Agent.
- With no stored key, webview autofocus targets `DeepSeek API key` input.
- With stored key, webview autofocus targets the agent prompt textarea.
- `smoke:bundle` remains strict on front window title (`LemonWoo Agent`), so Welcome is not accepted as primary.

## v1 functional dogfood hardening (2026-05-28)

Automated coverage added or tightened in this pass:

- `extensions/lemonwoo-ai/test/manifest.test.ts`: tab-change welcome guard; agent open error surfacing.
- `extensions/lemonwoo-ai/test/inlineCompletion.test.ts`: debounce uses the last in-flight call; markdown fence stripping.
- `extensions/lemonwoo-ai/test/local-actions.test.ts`: casual localhost mentions stay `none`; ANSI-colored stdout URL parsing.
- `packages/test-gate/test/test-gate.test.ts`: typecheck-before-lint order, destructive script rejection, empty-script failure.

Manual beta checklist: `docs/QA-MANUAL-ES.md`.

## Final RC Gauntlet & Public Beta Readiness Hardening (2026-05-28)

We executed the final double-block RC functional gauntlet and release packaging validation pass:
- **Welcome Tab Scheme Filter:** Refined `isWelcomeTab` to validate schemes like `vscode-remote` or `git`, avoiding closing workspace files in SSH/remote containers.
- **Agent Cycle State Reset:** Reset `lastRawDiff`, `lastAgentText`, and `lastTouchedFiles` at the start of `runAgentCycle` to prevent stale state retention.
- **Robust Abort Handling:** Added catches for standard `AbortError` / `DOMException` to prevent raw stack traces from leaking into the UI.
- **AppleScript Window Search:** Updated title assertion in `smoke-bundle.sh` to use `does not contain` to properly support prepended workspace folder prefixes.
- **Preview Intent Refinement:** Narrowed localhost regex trigger in `localActions.ts` to `/iniciar\s+localhost/i` to avoid false positives.
- **Local Server Lifecycle Safety:** Checked `exitCode == null && signalCode == null` for process state, registered the exit handler immediately, and cleaned up processes on startup failures to prevent process/port leaks.
- **ANSI Escape Code Filter:** Filtered ANSI color sequences from terminal stdout before parsing local URLs.
- **Path Resolution:** Fixed Vitest test resolution in `local-actions.test.ts` to resolve relative to `import.meta.url`.
- **Autocomplete Hardening:** Excluded `keys`, `certificates`, and `credentials` folders from inline completion and added unit tests validating the 1MB file size limit block.
- **Branding Plist Sanitization:** Added recursive python string rebranding scripts for `Info.plist` files inside `rebrand-macos.sh` to sanitize all leftover copyright, helpbook, descriptions, and type name fields.
- **Release Verification & Artifact QA:** Integrated `package:dmg` into the validation pipeline, resolved path space errors and version/host arch selection in `write-rc-report.mjs`, and added comprehensive Helper App plist and broad main plist scans to `verify-release-artifacts.sh`.

### Commands Executed & Results:

```bash
pnpm rc:check
pnpm rc:report
pnpm release:check
```

Results:
- **Workspace Build:** PASS (app bundle successfully rebuilt at `dist/LemonWoo.app` with all helper frameworks correctly rebranded).
- **Workspace Tests:** PASS (all workspace tests passed cleanly, including deepseek, test-gate, agent-runtime, and extension autocomplete and server suites).
- **Branding check:** PASS (Info.plist and product.json fields verified; no prohibited branding remains).
- **Secrets check:** PASS (Zero secrets found).
- **Licenses check:** PASS (All licenses compatible).
- **Bundle smoke:** PASS (AppleScript launcher successfully verified `LemonWoo Agent` window on launch).
- **V1 scope guard:** PASS (Confirmed no MCP, provider picker, Stripe, vector DB, persistent memory, or out-of-scope features).
- **Public readiness guard:** PASS (Zero local/developer/users paths leaked).
- **Document consistency guard:** PASS (Documentation aligned).
- **Release artifacts verification:** PASS (all release deliverables, helper app plist names, identifiers, DMG, and relative sha256 checksum match verified).
- **Live DeepSeek smoke:** SKIP (expected skip with exit 78 when `DEEPSEEK_API_KEY` is not defined).
- **DMG Packaging:** Successful packaging of `dist/LemonWoo-0.1.0-mac-arm64.dmg` with checksum `dist/LemonWoo-0.1.0-mac-arm64.dmg.sha256`.
