# ANTIGRAVITY AUDIT (v1 scope)

This checklist tracks explicit exclusions:

- No MCP Hub / Registry / Inspector.
- No multi-agent orchestration.
- No persistent semantic memory engine.
- No Anthropic compatibility endpoint.
- No OpenTelemetry.
- No Stripe / licensing flow in v1 runtime.

Current v1 inclusions after the final hardening pass:

- Single LemonWoo Agent panel.
- DeepSeek BYOK onboarding.
- Safe diff/apply + TestGate/fix loop.
- Local preview action.
- Native DeepSeek Flash Tab completion with sensitive-file exclusions.
