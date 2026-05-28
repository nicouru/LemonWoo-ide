# PRIVACY

LemonWoo v1 is BYOK (Bring Your Own Key) for DeepSeek.

- The API key is stored only in VS Code SecretStorage.
- LemonWoo sends request context only when the user uses the Agent panel or the editor's native inline completion path.
- Ignored content (`.gitignore`), `.git`, `node_modules`, `dist`, build outputs, and oversized files are excluded from context.
- Native Tab completion sends only a small prefix/suffix window from the active file, requires a workspace-backed `file:` URI, and excludes sensitive files such as `.env`, credentials, SSH/AWS/Docker/kubeconfig/service-account files, keys, and certificates.
- Disconnecting the DeepSeek key clears the inline completion client cache and aborts pending completion requests.
- v1 does not implement persistent semantic memory storage outside local runtime state.
