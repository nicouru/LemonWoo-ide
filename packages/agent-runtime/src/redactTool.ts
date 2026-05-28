const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{8,}/g,
  /ghp_[A-Za-z0-9]{16,}/g,
  /github_pat_[A-Za-z0-9_]{16,}/g
];

export function redactToolOutput(text: string, extraSecrets: string[] = []): string {
  let out = SECRET_PATTERNS.reduce((acc, pattern) => acc.replace(pattern, "[REDACTED]"), text);
  for (const secret of extraSecrets) {
    if (secret && secret.length > 4) {
      const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      out = out.replace(new RegExp(escaped, "g"), "[REDACTED]");
    }
  }
  return out;
}

export function boundOutput(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return {
    text: `${text.slice(0, maxChars)}\n...[truncated]`,
    truncated: true
  };
}
