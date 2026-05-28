# macOS Release and Packaging Guide (v1)

This document describes the workflow for verifying, packaging, and distributing LemonWoo IDE on macOS.

## Quick Start: Release Verification

To run the standard local release pipeline (tests, build, checks, smoke, package), run:

```bash
pnpm release:check
```

To run the RC hardening gate (including scope/public checks and live smoke policy), run:

```bash
pnpm rc:check
```

To generate a reproducible RC report with git/artifact/check metadata, run:

```bash
pnpm rc:report
```

`pnpm rc:report` writes `dist/RC-REPORT.md` (local artifact).
`docs/RC-REPORT.md` remains a stable public template.

## Command behavior details

- `pnpm release:check`: product release flow with DMG packaging.
- `pnpm rc:check`: ordered RC checks:
  1. `pnpm -r test`
  2. `pnpm -r build`
  3. `pnpm check:branding`
  4. `pnpm check:secrets`
  5. `pnpm check:licenses`
  6. `pnpm smoke:bundle`
  7. `bash scripts/verify-v1-scope.sh`
  8. `bash scripts/verify-public-readiness.sh`
  9. `bash scripts/verify-release-artifacts.sh`
  10. `pnpm smoke:agent:live`
- If `smoke:agent:live` exits `78` because `DEEPSEEK_API_KEY` is missing, RC check records **SKIP externo esperado** and continues as successful.
- Any other non-zero exit in `smoke:agent:live` fails `pnpm rc:check`.

## Artifact Location

Once packaging completes, expected artifacts are:

```
dist/LemonWoo.app
dist/LemonWoo-<version>-mac-<arch>.dmg
dist/LemonWoo-<version>-mac-<arch>.dmg.sha256
```

## Security & Code Signing

- **Ad-hoc Signing**: In v1, the application is signed locally using ad-hoc signing (`codesign --sign -`).
- **No Apple Developer ID / Notarization**: The DMG is not signed with an Apple Developer ID certificate and is not notarized by Apple. This is planned for future versions.
- **BYOK (Bring Your Own Key)**: LemonWoo does not include any API keys or secrets. Users must provide their own DeepSeek API key upon first launch.
- **Secret hygiene**: RC tooling never prints `DEEPSEEK_API_KEY` values; it only reports key presence/absence via live-smoke outcome.

### Bypassing macOS Gatekeeper

Since the application is signed using an ad-hoc signature, macOS Gatekeeper will prevent it from running normally upon drag-and-drop installation.

If macOS blocks the app ("LemonWoo is damaged and can’t be opened" or "unidentified developer"):
1. **Using Finder (Recommended)**:
   - Open your `/Applications` folder in Finder.
   - Right-click (or Control-click) `LemonWoo.app` and choose **Open**.
   - A dialog will appear asking for confirmation. Click **Open**.

2. **Using Terminal**:
   If the app still refuses to open due to quarantine attributes, you can remove the quarantine flag using:
   ```bash
   xattr -cr /Applications/LemonWoo.app
   ```
