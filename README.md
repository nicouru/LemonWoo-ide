# LemonWoo IDE

LemonWoo v1 is a packaged macOS app based on Code-OSS/VSCodium.

Primary v1 goal:

1. Open `LemonWoo.app`.
2. Paste a single DeepSeek API key.
3. Open a repo.
4. Work in a single LemonWoo Agent panel.

This repository intentionally excludes v1.1 features (MCP Hub, multi-agent orchestration, Stripe, persistent semantic memory, browser agents, etc.).

## Current status

**v1 RC** is published as tag **`v0.1.0-rc.1`**. Release notes: [docs/RELEASE-NOTES-v0.1.0-rc.md](docs/RELEASE-NOTES-v0.1.0-rc.md).

`main` also includes the bounded **v2** runtime and deterministic harnesses:

- Multi-step `runAgentLoop` with internal tools (read/search/diff/TestGate/terminal/preview/verify).
- System capability harness and `LemonWoo: Run Harness Diagnostic` (in-app key from SecretStorage).
- Empty-workspace routing so creation prompts do not hit preview fast-path before a servable project exists.
- Deterministic gauntlets: `pnpm v2:check` runs functional, web-preview, and terminal harnesses (no live model).

**v1 product surface** (unchanged promise):

- Standalone `LemonWoo.app` build and DMG packaging.
- Single LemonWoo Agent panel opened on startup.
- DeepSeek BYOK onboarding with key validation and SecretStorage persistence.
- Automatic Pro/Flash routing with no model/provider picker.
- Agent programming loop with context gather, streaming, safe diff preview/apply, TestGate, and fix loop.
- Local preview server action for servable workspaces.
- Native inline Tab completion using DeepSeek Flash with debounce, cancellation, sensitive-file exclusions, and cache reset on key disconnect.
- RC/public release guardrails and reproducible local reports.

**Live proof split:**

- CLI `pnpm smoke:agent:live` may **SKIP exit 78** when `DEEPSEEK_API_KEY` is not in the shell (expected when the key lives only in LemonWoo.app SecretStorage).
- In-app dogfood is recorded in [docs/FUNCTIONAL-VERIFICATION.md](docs/FUNCTIONAL-VERIFICATION.md) (operator attestation 2026-05-28).
- Apple Developer ID signing/notarization remains future work; v1 uses ad-hoc signing.

## Verification commands

- `pnpm v2:check`: deterministic v2 gauntlets (functional, web preview, terminal when present).
- `pnpm release:check`: tests + build + checks + bundle smoke + DMG packaging.
- `pnpm verify:docs`: documentation consistency guardrail check (verifies no obsolete references, local user paths, or outdated features exist).
- `pnpm rc:check`: reproducible RC validation gate (includes scope/public guardrails, doc consistency, and live smoke policy).
- `pnpm rc:report`: writes local report `dist/RC-REPORT.md` with git/artifact/check metadata.

Artifacts are expected under `dist/`:

- `dist/LemonWoo.app`
- `dist/LemonWoo-<version>-mac-<arch>.dmg`
- `dist/LemonWoo-<version>-mac-<arch>.dmg.sha256`
