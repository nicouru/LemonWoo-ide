import { accessSync, constants, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

export interface OpencodeBinaryResolution {
  found: boolean;
  path?: string;
  source?: "env" | "path" | "local-bin" | "opencode-ai-package";
  hint?: string;
}

function isExecutable(filePath: string): boolean {
  try {
    accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return existsSync(filePath);
  }
}

function findLocalBin(): string | undefined {
  const candidates = [
    path.resolve(packageRoot, "../../node_modules/.bin/opencode"),
    path.resolve(packageRoot, "../../../node_modules/.bin/opencode"),
    path.resolve(process.cwd(), "node_modules/.bin/opencode")
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function findOpencodeAiNativeBin(): string | undefined {
  try {
    const require = createRequire(import.meta.url);
    const pkgJson = require.resolve("opencode-ai/package.json");
    const native = path.join(path.dirname(pkgJson), "bin", "opencode.exe");
    if (isExecutable(native)) return native;
  } catch {
    /* optional dependency not installed */
  }
  return undefined;
}

export function resolveOpencodeBinary(): OpencodeBinaryResolution {
  const fromEnv = process.env.OPENCODE_BIN?.trim();
  if (fromEnv && isExecutable(fromEnv)) {
    return { found: true, path: fromEnv, source: "env" };
  }

  try {
    const which = process.platform === "win32" ? "where" : "which";
    const out = execFileSync(which, ["opencode"], { encoding: "utf8" }).trim().split(/\r?\n/)[0];
    if (out && existsSync(out)) {
      return { found: true, path: out, source: "path" };
    }
  } catch {
    /* not on PATH */
  }

  const localBin = findLocalBin();
  if (localBin) {
    return { found: true, path: localBin, source: "local-bin" };
  }

  const native = findOpencodeAiNativeBin();
  if (native) {
    return { found: true, path: native, source: "opencode-ai-package" };
  }

  return {
    found: false,
    hint:
      "OpenCode CLI not found. Options: (1) pnpm add -D opencode-ai@latest in @lemonwoo/agent-runtime " +
      "(pnpm.onlyBuiltDependencies includes opencode-ai), (2) pnpm dlx opencode-ai@latest --version, " +
      "(3) curl -fsSL https://opencode.ai/install | bash, or (4) export OPENCODE_BIN=/path/to/opencode"
  };
}

export function prependOpencodeToPath(resolution: OpencodeBinaryResolution): void {
  if (!resolution.found || !resolution.path) return;
  const binDir = path.dirname(resolution.path);
  const pathKey = process.platform === "win32" ? "Path" : "PATH";
  const current = process.env[pathKey] ?? "";
  const parts = current.split(path.delimiter).filter(Boolean);
  if (!parts.includes(binDir)) {
    process.env[pathKey] = [binDir, ...parts].join(path.delimiter);
  }
}
