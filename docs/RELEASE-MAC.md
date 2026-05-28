# macOS Release and Packaging Guide (v1)

This document describes the workflow for verifying, packaging, and distributing LemonWoo IDE on macOS.

## Quick Start: Release Verification

To run all tests, build the production macOS application, run validation checks (branding, secrets, licenses, signatures), run a bundle smoke test, and package it into a distributable DMG, run:

```bash
pnpm release:check
```

This single command coordinates:
1. Workspace unit tests (`pnpm -r test`)
2. macOS bundle creation (`pnpm build:mac`)
3. Branding conformance verification (`pnpm check:branding`)
4. Code signature verification (`codesign --verify`)
5. Pre-release secret scanning (`pnpm check:secrets`)
6. Compliance/license checking (`pnpm check:licenses`)
7. Real UI bundle smoke test (`pnpm smoke:bundle`)
8. DMG packaging and validation (`pnpm package:dmg`)

## Artifact Location

Once packaging completes, the final distributable DMG will be placed in:

```
dist/LemonWoo-<version>-mac-arm64.dmg
```

## Security & Code Signing

- **Ad-hoc Signing**: In v1, the application is signed locally using ad-hoc signing (`codesign --sign -`).
- **No Apple Developer ID / Notarization**: The DMG is not signed with an Apple Developer ID certificate and is not notarized by Apple. This is planned for future versions.
- **BYOK (Bring Your Own Key)**: LemonWoo does not include any API keys or secrets. Users must provide their own DeepSeek API key upon first launch.

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
