# FUNCTIONAL VERIFICATION

This file records command-level evidence for the required v1 vertical slice.

## Status

- Partial pass with executable app bundle and core checks green.
- Live DeepSeek smoke remains environment-gated by user API key and in-app manual run.

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
Bundle smoke: open command issued
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

- `Info.plist` bundle identifier remains upstream (`com.vscodium`) in v1 to keep Electron helper launch stable on macOS 26.
- LemonWoo identity is applied through app name/path and `app/product.json` branding keys.

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
- TestGate script decision and redaction behavior.
- Runtime exclusion guard for Anthropic compatibility.

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
2. Run `LemonWoo: Open Agent`.
3. Paste DeepSeek API key in onboarding input.
4. Open fixture TS repo.
5. Chat request -> diff preview -> Apply -> TestGate.
6. If tests fail, run correction cycle.

These steps are implemented but require interactive IDE confirmation.
