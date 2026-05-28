# PRIVACY

LemonWoo v1 is BYOK (Bring Your Own Key) for DeepSeek.

- The API key is stored only in VS Code SecretStorage.
- LemonWoo sends request context only when the user uses the Agent panel.
- Ignored content (`.gitignore`), `.git`, `node_modules`, `dist`, build outputs, and oversized files are excluded from context.
- v1 does not implement persistent semantic memory storage outside local runtime state.
