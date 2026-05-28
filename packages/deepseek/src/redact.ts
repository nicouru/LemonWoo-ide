/**
 * Secret redaction for logs, error messages, transcripts.
 *
 * Catches well-known credential shapes (OpenAI/DeepSeek `sk-` keys, GitHub
 * tokens) plus any extra strings the caller passes — typically the actual API
 * key the client was constructed with, so the literal value cannot escape
 * even if upstream code includes it in an error message.
 */

const REDACTED = "[REDACTED]";

const STATIC_SECRET_PATTERNS: readonly RegExp[] = [
  /sk-[A-Za-z0-9_-]{6,}/g,
  /ghp_[A-Za-z0-9]{16,}/g,
  /gho_[A-Za-z0-9]{16,}/g,
  /ghs_[A-Za-z0-9]{16,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g
];

const REGEX_META = /[.*+?^${}()|[\]\\]/g;

export function redactSecrets(
  input: string,
  extraSecrets: readonly string[] = []
): string {
  if (!input) return input;
  let out = input;
  for (const pattern of STATIC_SECRET_PATTERNS) {
    out = out.replace(pattern, REDACTED);
  }
  for (const secret of extraSecrets) {
    if (!secret || secret.length < 4) continue;
    const escaped = secret.replace(REGEX_META, "\\$&");
    out = out.replace(new RegExp(escaped, "g"), REDACTED);
  }
  return out;
}
