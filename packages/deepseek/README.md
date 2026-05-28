# `@lemonwoo/deepseek`

The DeepSeek adapter that powers LemonWoo's agent / Tab / chat.

Scope: **v1 only**. No Anthropic compatibility, no FIM beta, no MCP plumbing,
no persistent state. All choices are opinionated and invisible to the end user.

## Public surface

```ts
import {
  DeepSeekClient,
  buildMessages,
  routeTask,
  shouldEscalateToPro,
  redactSecrets,
  MODEL_MAP,
  // typed errors:
  DeepSeekError,
  DeepSeekAuthError,
  DeepSeekRateLimitError,
  DeepSeekServerError,
  DeepSeekTimeoutError,
  DeepSeekAbortError,
  DeepSeekNetworkError,
  DeepSeekModelsUnavailableError
} from "@lemonwoo/deepseek";
```

### Client

```ts
const client = new DeepSeekClient({ apiKey });
const v = await client.validateKey();          // 'valid' | 'invalid' | ...
const r = await client.chat({                  // buffered
  task: "chat",                                // routeTask decides Pro/Flash
  build: {
    systemPrompt: "...",
    repoRules: "...",
    stableContext: "...",
    volatileContext: "...",                    // optional, last
    userInput: "Refactor the router."
  },
  signal: controller.signal                    // AbortSignal, propagated to fetch
});
for await (const piece of client.chatStream({ task: "tab", build: { ... } })) {
  // incremental tokens
}
```

### Routing

Two rules, no flags:

| Task                                          | Mode  | Model           |
| --------------------------------------------- | ----- | --------------- |
| `tab`, `inline-edit`, `small-write`           | write | Flash (non-thinking) |
| `chat`, `agent`, `verify`, `refactor`, `debug` | think | Pro (thinking)  |

Escalation (caller-driven) is decided via `shouldEscalateToPro`.

### Endpoint

Only `https://api.deepseek.com` via OpenAI Chat Completions. The client
validates `/models` and resolves to V4 ids (`deepseek-v4-pro`,
`deepseek-v4-flash`); falls back to legacy aliases (`deepseek-reasoner`,
`deepseek-chat`) if V4 ids are absent; surfaces
`DeepSeekModelsUnavailableError` if neither pair is present.

### Cache-friendly prompts

`buildMessages` packs stable bytes (`systemPrompt + repoRules +
stableContext`) into a single leading system message so DeepSeek context
caching can hit across turns. Volatile context lives in its own trailing
system message; user input is always last.

### Error policy

| Error                              | Retried? | Notes                                  |
| ---------------------------------- | -------- | -------------------------------------- |
| `DeepSeekAuthError` (401/403)      | no       | configuration issue                    |
| `DeepSeekRateLimitError` (429)     | yes      | honors `Retry-After`, bounded backoff  |
| `DeepSeekServerError` (5xx)        | yes      | exponential backoff with jitter        |
| `DeepSeekNetworkError`             | yes      | underlying fetch error                 |
| `DeepSeekTimeoutError`             | no       | user/operator must decide              |
| `DeepSeekAbortError`               | no       | caller-driven                          |
| `DeepSeekModelsUnavailableError`   | no       | upstream contract broken               |

Every `.message` runs through `redactSecrets` with the configured API key as
an extra secret, so the literal key cannot leak even if upstream echoes it.

## Scripts

```bash
pnpm --filter @lemonwoo/deepseek run build
pnpm --filter @lemonwoo/deepseek run test
pnpm --filter @lemonwoo/deepseek run typecheck
# Live smoke against api.deepseek.com (gated by env var):
DEEPSEEK_API_KEY=sk-... pnpm --filter @lemonwoo/deepseek run smoke:live
```

The live smoke exits `78` when no key is set (treat as "no signal"), `0` on
success, `1` on any check failure. It never prints prompts or response bodies.
