# RC Report Template

This file is a public, stable template for GitHub.

Generated local RC evidence is written by `pnpm rc:report` to:

- `dist/RC-REPORT.md`

The generated artifact includes:

- local date/time
- current branch and commit
- git clean/dirty status (ignoring local RC report artifacts)
- `package.json` version
- relative artifact paths under `dist/`
- DMG SHA256 and `.sha256` status
- last `pnpm rc:check` summary from `dist/rc-check-last.json`
- live smoke note (`PASS` or expected external `SKIP` when `DEEPSEEK_API_KEY` is missing)

Security note:

- RC reporting never prints the `DEEPSEEK_API_KEY` value.
