# SECURITY

LemonWoo v1 security defaults:

- Secret redaction in logs and UI error output.
- No key persistence in plaintext files.
- Diff apply validates paths are inside workspace.
- `.git/` edits are blocked.
- Local preview startup rejects dangerous script commands.
- TestGate runs project test scripts as explicit verification actions.
- Native Tab completion excludes credential-like files and non-workspace/non-file documents before any DeepSeek request.
