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
pnpm install
pnpm build:mac
pnpm smoke:bundle
```
