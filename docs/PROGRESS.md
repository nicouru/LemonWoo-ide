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
- Fixed launch crash on macOS 26 by preserving upstream Electron helper identity chain:
  - no Info.plist executable/bundle mutation in v1
  - no ad-hoc deep re-signing
  - rebrand applied in `Contents/Resources/app/product.json` only.
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
