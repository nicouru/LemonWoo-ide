# LemonWoo IDE

LemonWoo v1 is a packaged macOS app based on Code-OSS/VSCodium.

Primary v1 goal:

1. Open `LemonWoo.app`.
2. Paste a single DeepSeek API key.
3. Open a repo.
4. Work in a single LemonWoo Agent panel.

This repository intentionally excludes v1.1 features (MCP Hub, multi-agent orchestration, Stripe, persistent semantic memory, browser agents, etc.).

## Current v1 status

`main` contains the v1 release-candidate implementation:

- Standalone `LemonWoo.app` build and DMG packaging.
- Single LemonWoo Agent panel opened on startup.
- DeepSeek BYOK onboarding with key validation and SecretStorage persistence.
- Automatic Pro/Flash routing with no model/provider picker.
- Agent programming loop with context gather, streaming, safe diff preview/apply, TestGate, and fix loop.
- Local preview server action for servable workspaces.
- Native inline Tab completion using DeepSeek Flash with debounce, cancellation, sensitive-file exclusions, and cache reset on key disconnect.
- RC/public release guardrails and reproducible local reports.

Still externally gated before calling v1 fully proven:

- One live `pnpm rc:check` or `pnpm smoke:agent:live` run with a real `DEEPSEEK_API_KEY`.
- Apple Developer ID signing/notarization remains future work; v1 uses ad-hoc signing.

## Release commands (v1 RC)

- `pnpm release:check`: tests + build + checks + bundle smoke + DMG packaging.
- `pnpm verify:docs`: documentation consistency guardrail check (verifies no obsolete references, local user paths, or outdated features exist).
- `pnpm rc:check`: reproducible RC validation gate (includes scope/public guardrails, doc consistency, and live smoke policy).
- `pnpm rc:report`: writes local report `dist/RC-REPORT.md` with git/artifact/check metadata.

Artifacts are expected under `dist/`:

- `dist/LemonWoo.app`
- `dist/LemonWoo-<version>-mac-<arch>.dmg`
- `dist/LemonWoo-<version>-mac-<arch>.dmg.sha256`
