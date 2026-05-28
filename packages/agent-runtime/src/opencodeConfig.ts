export function buildLemonwooDeepSeekConfig(): Record<string, unknown> | null {
  if (!process.env.DEEPSEEK_API_KEY?.trim()) return null;
  return {
    model: "deepseek/deepseek-chat",
    disabled_providers: ["opencode"],
    provider: {
      deepseek: {
        npm: "@ai-sdk/openai-compatible",
        name: "DeepSeek",
        options: {
          baseURL: "https://api.deepseek.com",
          apiKey: "{env:DEEPSEEK_API_KEY}"
        },
        models: {
          "deepseek-chat": { name: "DeepSeek Chat" },
          "deepseek-reasoner": { name: "DeepSeek Reasoner" }
        }
      }
    }
  };
}
