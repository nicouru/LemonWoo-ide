/** Terminal command safety classification for LemonWoo internal run_terminal tool. */

export type TerminalCommandPolicy = "allow" | "confirm" | "block";

const BLOCK_PATTERNS: readonly RegExp[] = [
  /\brm\s+-[a-zA-Z]*f/i,
  /\bsudo\b/i,
  /\bchmod\s+-R\b/i,
  /\bchown\b/i,
  /\bgit\s+push\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\b/i,
  /\bcurl\s+\S+\s*\|\s*sh\b/i,
  /\bcurl\s+\S+\s*\|\s*bash\b/i,
  /(^|[\s;&|])(\.git\/|\/\.git\b)/i,
  /\.\.\//
];

const CONFIRM_PATTERNS: readonly RegExp[] = [
  /\bnpm\s+install\b/i,
  /\bpnpm\s+install\b/i,
  /\byarn\s+install\b/i,
  /\bnpm\s+create\b/i,
  /\bpnpm\s+create\b/i,
  /\bnpx\s+create-/i,
  /\bpnpm\s+dlx\s+create-/i
];

const ALLOW_PATTERNS: readonly RegExp[] = [
  /^\s*pwd\s*$/,
  /^\s*ls(\s|$)/i,
  /^\s*find\s+/i,
  /^\s*rg\s+/i,
  /^\s*cat\s+/i,
  /^\s*npm\s+test\s*$/,
  /^\s*npm\s+run\s+test(\s|$)/i,
  /^\s*pnpm\s+test\s*$/,
  /^\s*pnpm\s+run\s+test(\s|$)/i,
  /^\s*npm\s+run\s+build\s*$/,
  /^\s*pnpm\s+run\s+build\s*$/,
  /^\s*npm\s+run\s+lint\s*$/,
  /^\s*pnpm\s+run\s+lint\s*$/,
  /^\s*node\s+-v\s*$/,
  /^\s*python3\s+-m\s+http\.server\s+\d+\s*$/
];

export function classifyTerminalCommand(command: string): {
  policy: TerminalCommandPolicy;
  reason?: string;
} {
  const trimmed = command.trim();
  if (!trimmed) {
    return { policy: "block", reason: "Empty command." };
  }

  for (const pattern of BLOCK_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { policy: "block", reason: "Command blocked by LemonWoo safety policy." };
    }
  }

  for (const pattern of CONFIRM_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        policy: "confirm",
        reason: "Command requires explicit user confirmation before execution."
      };
    }
  }

  for (const pattern of ALLOW_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { policy: "allow" };
    }
  }

  return {
    policy: "confirm",
    reason: "Unlisted command requires explicit user confirmation before execution."
  };
}

export function parseTerminalTimeoutMs(raw: string | undefined, defaultMs = 30_000): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return defaultMs;
  return Math.min(n, 120_000);
}
