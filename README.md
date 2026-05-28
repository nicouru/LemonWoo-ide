# LemonWoo IDE

LemonWoo v1 is a packaged macOS app based on Code-OSS/VSCodium.

Primary v1 goal:

1. Open `LemonWoo.app`.
2. Paste a single DeepSeek API key.
3. Open a repo.
4. Work in a single LemonWoo Agent panel.

This repository intentionally excludes v1.1 features (MCP Hub, multi-agent orchestration, Stripe, persistent semantic memory, browser agents, etc.).

## Release commands (v1 RC)

- `pnpm release:check`: tests + build + checks + bundle smoke + DMG packaging.
- `pnpm rc:check`: reproducible RC validation gate (includes scope/public guardrails and live smoke policy).
- `pnpm rc:report`: writes local report `dist/RC-REPORT.md` with git/artifact/check metadata.

Artifacts are expected under `dist/`:

- `dist/LemonWoo.app`
- `dist/LemonWoo-<version>-mac-<arch>.dmg`
- `dist/LemonWoo-<version>-mac-<arch>.dmg.sha256`
