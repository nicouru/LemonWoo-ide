# PROGRESS

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
- Updated bundle smoke script to accept real front window title variants (`LemonWoo Agent ...`) and degrade gracefully if macOS denies System Events permission.

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
