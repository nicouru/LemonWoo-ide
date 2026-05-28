# LemonWoo v0.1.0-rc.1 (release candidate)

Public beta release candidate for macOS (Apple Silicon). Bring your own DeepSeek API key.

## What is included

- **LemonWoo.app** — standalone IDE shell (Code-OSS/VSCodium-based), LemonWoo branding, ad-hoc signed.
- **Single agent surface** — LemonWoo Agent opens on startup; no model or provider picker.
- **DeepSeek BYOK** — one API key, validated before storage; Pro/Flash routing is automatic.
- **Agent programming loop** — local context, streaming, unified diff preview/apply, TestGate, **Corregir con agente** on failure.
- **Native Tab completion** — DeepSeek Flash inline suggestions with debounce, abort, and sensitive-path exclusions.
- **Local preview** — explicit intent to start/reuse/stop a dev server and surface a localhost URL.
- **Reproducible RC tooling** — `pnpm rc:check`, `pnpm release:check`, DMG + SHA256, `dist/RC-REPORT.md`.

## Install

1. Download `LemonWoo-0.1.0-mac-arm64.dmg` from the GitHub release (when tagged).
2. Open the DMG and drag **LemonWoo** to **Applications**.
3. First launch: if Gatekeeper blocks the app, right-click **LemonWoo.app** → **Open** → confirm once (ad-hoc build, not notarized).
4. Paste your [DeepSeek API key](https://platform.deepseek.com) in the agent panel and connect.
5. **File → Open Folder** and start working.

See also: [docs/QA-MANUAL-ES.md](./QA-MANUAL-ES.md), [docs/INSTALL-ES.md](./INSTALL-ES.md), [docs/TROUBLESHOOTING-ES.md](./TROUBLESHOOTING-ES.md).

## Requirements

- macOS on **Apple Silicon (arm64)** for the prebuilt DMG.
- Active **DeepSeek API key** with sufficient balance.
- Network access to `https://api.deepseek.com`.

## Known limitations (v1)

- **Not Apple-notarized** — ad-hoc signature only; first-open Gatekeeper workaround may be required.
- **Live API proof** — maintainers must run `pnpm smoke:agent:live` with `DEEPSEEK_API_KEY` before tagging; CI without a key records exit **78 SKIP** (not a product failure).
- **Single-shot agent** — not MCP, not multi-agent UI, not persistent memory, not browser automation.
- **arm64 DMG only** in this RC; building for other arches requires local `pnpm build:mac`.

## Verify locally (maintainers)

```bash
git checkout main && git pull --ff-only origin main
pnpm -r build
export DEEPSEEK_API_KEY=sk-...   # required for live PASS
pnpm smoke:agent:live
pnpm rc:check
pnpm release:check
```

## Tag (only after live PASS + manual dogfood)

```bash
git tag -a v0.1.0-rc.1 -m "LemonWoo v0.1.0 RC1"
git push origin v0.1.0-rc.1
```

Do **not** push the tag until `pnpm smoke:agent:live` passes with a real key and manual QA in `LemonWoo.app` is recorded in `docs/FUNCTIONAL-VERIFICATION.md`.

## Out of scope (v1.1+)

MCP Hub, multi-agent orchestration, Stripe/billing, vector memory, browser agents, Open VSX marketplace, telemetry product analytics.
