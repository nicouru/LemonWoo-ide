/** Terminal command safety classification for LemonWoo internal run_terminal tool. */

export type TerminalCommandPolicy = "allow" | "confirm" | "block";

export interface ParsedTerminalCommand {
  executable: string;
  args: string[];
}

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
  /\bfind\b[^\n]*\s-delete\b/i,
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
  /\bpnpm\s+dlx\b/i,
  /\bnpx\b/i,
  /^\s*find\s+/i,
  /^\s*cat\s+/i
];

const ALLOW_EXACT: readonly string[] = [
  "pwd",
  "npm test",
  "npm run test",
  "pnpm test",
  "pnpm run test",
  "npm run build",
  "pnpm run build",
  "npm run lint",
  "pnpm run lint",
  "node -v"
];

export function hasShellMetacharacters(command: string): boolean {
  return /&&|\|\||[;|`]|[<>]|\$\(|\$\{/.test(command);
}

function isAbsolutePathArg(arg: string): boolean {
  return arg.startsWith("/") || /^[A-Za-z]:[\\/]/.test(arg);
}

function pathSegments(arg: string): string[] {
  return arg.split(/[/\\]/).filter(Boolean);
}

export function classifyPathArguments(pathArgs: string[]): TerminalCommandPolicy | null {
  for (const arg of pathArgs) {
    if (!arg || arg.startsWith("-")) continue;
    if (arg.includes("..")) return "block";
    if (pathSegments(arg).includes(".git")) return "block";
    if (isAbsolutePathArg(arg)) return "confirm";
  }
  return null;
}

function lsPathArguments(parts: string[]): string[] {
  return parts.slice(1).filter((arg) => !arg.startsWith("-"));
}

function rgPathArguments(parts: string[]): string[] {
  let index = 1;
  while (index < parts.length && parts[index].startsWith("-") && parts[index] !== "--") {
    index += 1;
  }
  if (parts[index] === "--") index += 1;
  if (index >= parts.length) return [];
  return parts.slice(index + 1);
}

function matchesLsAllowPattern(trimmed: string): boolean {
  return /^ls(\s+-[\w-]+)*(\s+[\w./-]+)?$/.test(trimmed);
}

function matchesRgAllowPattern(trimmed: string): boolean {
  if (!/^rg\s/.test(trimmed)) return false;
  if (/^rg\s--\s/.test(trimmed)) return true;
  return !/\s--[^\s]/.test(trimmed);
}

export function classifyTerminalCommand(command: string): {
  policy: TerminalCommandPolicy;
  reason?: string;
} {
  const trimmed = command.trim();
  if (!trimmed) {
    return { policy: "block", reason: "Empty command." };
  }

  const parts = trimmed.split(/\s+/);

  for (const pattern of BLOCK_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { policy: "block", reason: "Command blocked by LemonWoo safety policy." };
    }
  }

  if (hasShellMetacharacters(trimmed)) {
    return {
      policy: "confirm",
      reason: "Shell composition/redirection requires explicit user confirmation."
    };
  }

  for (const pattern of CONFIRM_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        policy: "confirm",
        reason: "Command requires explicit user confirmation before execution."
      };
    }
  }

  if (/^rg\s/.test(trimmed) && /\s--[^\s]/.test(trimmed) && !/^rg\s--\s/.test(trimmed)) {
    return {
      policy: "confirm",
      reason: "rg flags require explicit user confirmation."
    };
  }

  if (ALLOW_EXACT.includes(trimmed)) {
    return { policy: "allow" };
  }

  if (matchesLsAllowPattern(trimmed)) {
    const pathPolicy = classifyPathArguments(lsPathArguments(parts));
    if (pathPolicy === "block") {
      return { policy: "block", reason: "Path argument blocked by LemonWoo safety policy." };
    }
    if (pathPolicy === "confirm") {
      return {
        policy: "confirm",
        reason: "Absolute path arguments require explicit user confirmation."
      };
    }
    return { policy: "allow" };
  }

  if (matchesRgAllowPattern(trimmed)) {
    const pathPolicy = classifyPathArguments(rgPathArguments(parts));
    if (pathPolicy === "block") {
      return { policy: "block", reason: "Path argument blocked by LemonWoo safety policy." };
    }
    if (pathPolicy === "confirm") {
      return {
        policy: "confirm",
        reason: "Absolute path arguments require explicit user confirmation."
      };
    }
    return { policy: "allow" };
  }

  if (/^python3\s+-m\s+http\.server\s+\d+$/.test(trimmed)) {
    return { policy: "allow" };
  }

  return {
    policy: "confirm",
    reason: "Unlisted command requires explicit user confirmation before execution."
  };
}

export function parseAllowedTerminalCommand(command: string): ParsedTerminalCommand | null {
  const trimmed = command.trim();
  if (hasShellMetacharacters(trimmed)) return null;
  if (classifyTerminalCommand(trimmed).policy !== "allow") return null;

  if (trimmed === "pwd") return { executable: "pwd", args: [] };

  if (/^ls/.test(trimmed)) {
    return { executable: "ls", args: trimmed.split(/\s+/).slice(1) };
  }

  if (trimmed === "npm test") return { executable: "npm", args: ["test"] };
  if (trimmed === "npm run test") return { executable: "npm", args: ["run", "test"] };
  if (trimmed === "pnpm test") return { executable: "pnpm", args: ["test"] };
  if (trimmed === "pnpm run test") return { executable: "pnpm", args: ["run", "test"] };
  if (trimmed === "npm run build") return { executable: "npm", args: ["run", "build"] };
  if (trimmed === "pnpm run build") return { executable: "pnpm", args: ["run", "build"] };
  if (trimmed === "npm run lint") return { executable: "npm", args: ["run", "lint"] };
  if (trimmed === "pnpm run lint") return { executable: "pnpm", args: ["run", "lint"] };
  if (trimmed === "node -v") return { executable: "node", args: ["-v"] };

  const py = trimmed.match(/^python3\s+-m\s+http\.server\s+(\d+)$/);
  if (py) return { executable: "python3", args: ["-m", "http.server", py[1]!] };

  if (/^rg\s/.test(trimmed)) {
    return { executable: "rg", args: trimmed.split(/\s+/).slice(1) };
  }

  return null;
}

export function parseTerminalTimeoutMs(raw: string | undefined, defaultMs = 30_000): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return defaultMs;
  return Math.min(n, 120_000);
}

/** Build child-process env without secrets (for tests and adapters). */
export function buildSanitizedTerminalEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const allow = new Set([
    "PATH",
    "HOME",
    "SHELL",
    "LANG",
    "LC_ALL",
    "TMPDIR",
    "TERM",
    "USER",
    "LOGNAME",
    "NODE_ENV",
    "SystemRoot",
    "ComSpec",
    "PWD"
  ]);
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(source)) {
    if (!value) continue;
    const upper = key.toUpperCase();
    if (upper.includes("SECRET") || upper.includes("TOKEN") || upper.includes("PASSWORD")) continue;
    if (upper.includes("API_KEY") || upper.endsWith("_KEY")) continue;
    if (allow.has(key)) env[key] = value;
  }
  return env;
}
