# BUILD-MAC

## v1 Strategy

v1 prefers stable VSCodium repack/patch to reduce risk and get a working app first.

The build repacks a stable VSCodium binary, renames the macOS app executable
and Electron helper bundles to LemonWoo, patches the bundle identity to
`dev.lemonwoo.ide`, then ad-hoc signs the result for local execution.

## Tooling

- macOS: 13+
- Node.js: 22+
- pnpm: 11+
- Xcode CLI tools for native modules if needed

## Commands

```bash
# Clean install dependencies
pnpm install

# Build macOS app bundle (dist/LemonWoo.app)
pnpm build:mac

# Verify and package the bundle into a DMG
pnpm package:dmg

# Run all checks, tests, build, and package the DMG in sequence
pnpm release:check

# Run the release-candidate validation gate
pnpm rc:check

# Write local release-candidate evidence to dist/RC-REPORT.md
pnpm rc:report
```

## Notes

- `pnpm rc:check` treats `pnpm smoke:agent:live` exit `78` as an expected external skip when `DEEPSEEK_API_KEY` is absent.
- `pnpm rc:report` writes local evidence under `dist/`; `docs/RC-REPORT.md` is only the public template.
