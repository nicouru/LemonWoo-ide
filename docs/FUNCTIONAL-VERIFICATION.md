# FUNCTIONAL VERIFICATION

This file records command-level evidence for the required v1 vertical slice.

## Status

- Automated pass with executable app bundle, release checks, native Tab completion tests, and core guardrails green.
- Live DeepSeek smoke remains environment-gated by user API key and in-app manual run.
- 2026-05-28 correction pass: the LemonWoo agent is now startup-activated and no longer requires the user to discover a command before seeing the primary v1 surface.
- 2026-05-28 preview/dev-server pass: local preview intent is now executed as a verified local action (server startup, URL detection, stop), not answered as tutorial text.

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
pnpm --filter @lemonwoo/agent-runtime build && node scripts/opencode-spike.mjs
```

Result:

```text
OpenCode spike failed: Error: spawn opencode ENOENT
```

Documented as external environment blocker in `docs/UPSTREAMS.md`.

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
Latest hardening result: `Test Files  5 passed (5) | Tests  47 passed (47)` for the extension suite.

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

## First-run agent surface polish (2026-05-28)

Scope:

- Keep LemonWoo Agent as the unequivocal first visible surface.
- Avoid Welcome taking over the primary editor surface.
- Improve first-focus behavior in the agent webview.

Behavior verification:

- Startup calls now close only Welcome-like tabs (safe filter: non-dirty + non-pinned + Welcome detection) before revealing LemonWoo Agent.
- With no stored key, webview autofocus targets `DeepSeek API key` input.
- With stored key, webview autofocus targets the agent prompt textarea.
- `smoke:bundle` remains strict on front window title (`LemonWoo Agent`), so Welcome is not accepted as primary.
