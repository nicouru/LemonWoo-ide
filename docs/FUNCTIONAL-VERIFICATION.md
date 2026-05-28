# FUNCTIONAL VERIFICATION

This file records command-level evidence for the required v1 vertical slice.

## Status

- Partial pass with executable app bundle and core checks green.
- Live DeepSeek smoke remains environment-gated by user API key and in-app manual run.
- 2026-05-28 correction pass: the LemonWoo agent is now startup-activated and no longer requires the user to discover a command before seeing the primary v1 surface.

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
