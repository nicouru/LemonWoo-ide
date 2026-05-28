# SECURITY

LemonWoo v1 security defaults:

- Secret redaction in logs and UI error output.
- No key persistence in plaintext files.
- Diff apply validates paths are inside workspace.
- `.git/` edits are blocked.
- Destructive shell commands require explicit confirmation in the agent flow.
