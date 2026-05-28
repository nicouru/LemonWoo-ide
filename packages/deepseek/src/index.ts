/**
 * `@lemonwoo/deepseek` public surface.
 *
 * Consumers (the LemonWoo extension, agent-runtime) should import only from
 * this module. Internal modules (`./client`, `./router`, `./redact`, etc.)
 * are subject to change without notice.
 */

export {
  DeepSeekAbortError,
  DeepSeekAuthError,
  DeepSeekError,
  DeepSeekModelsUnavailableError,
  DeepSeekNetworkError,
  DeepSeekRateLimitError,
  DeepSeekServerError,
  DeepSeekTimeoutError
} from "./errors.js";

export { redactSecrets } from "./redact.js";

export {
  MODEL_MAP,
  resolveModelIds,
  routeTask,
  shouldEscalateToPro,
  type EscalationContext,
  type LemonWooTaskKind,
  type ResolvedModels,
  type RouteMode
} from "./router.js";

export {
  buildMessages,
  type MessageBuildOptions
} from "./messages.js";

export {
  DeepSeekClient,
  type ChatArgs,
  type ChatResult,
  type DeepSeekClientOptions,
  type ValidateKeyResult
} from "./client.js";
