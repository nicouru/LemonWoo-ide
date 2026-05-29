# PRIVACY

LemonWoo v1 is BYOK (Bring Your Own Key) for DeepSeek.

- The API key is stored only in VS Code SecretStorage.
- LemonWoo sends request context only when the user uses the Agent panel or the editor's native inline completion path.
- Ignored content (`.gitignore`), `.git`, `node_modules`, `dist`, build outputs, and oversized files are excluded from context.
- Native Tab completion sends only a small prefix/suffix window from the active file, requires a workspace-backed `file:` URI, and excludes sensitive files such as `.env`, credentials, SSH/AWS/Docker/kubeconfig/service-account files, keys, and certificates.
- Disconnecting the DeepSeek key clears the inline completion client cache and aborts pending completion requests.
- v1 does not implement persistent semantic memory storage outside local runtime state.
- v2.2 adds optional repo-local approved memory at `.lemonwoo/memory.jsonl` only when the user explicitly asks to record a fact (for example `recordá esto: …` or `remember this: …`). Normal agent chat does not auto-write memory. List/clear use explicit panel messages. Secret-looking values are refused or redacted before write; no embeddings, SQLite, or cloud sync.
