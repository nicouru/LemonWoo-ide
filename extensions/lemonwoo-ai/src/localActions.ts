import { ChildProcess, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createConnection } from "node:net";
import { join } from "node:path";

export type LocalActionIntent = "preview" | "none";
export type Pm = "pnpm" | "yarn" | "npm";

export interface PreviewPlan {
  command: string;
  args: string[];
  kind: "package-script" | "python-static";
  scriptName?: string;
  scriptBody?: string;
  portHint: number;
}

export interface RunningServer {
  workspace: string;
  process: ChildProcess;
  url?: string;
  logs: string[];
  commandPreview: string;
}

export type SpawnLike = (
  command: string,
  args: string[],
  options: { cwd: string; shell: false; env: NodeJS.ProcessEnv }
) => ChildProcess;

const runningServers = new Map<string, RunningServer>();

const PREVIEW_PATTERNS = [
  /levant[áa]\s+servidor/i,
  /servidor\s+local/i,
  /quiero\s+ver\s+la\s+p[aá]gina/i,
  /abr[ií]\s+preview/i,
  /iniciar\s+localhost/i,
  /abrila?\s+en\s+el\s+navegador/i,
  /quiero\s+ver\s+(la\s+)?(app|página|sitio|proyecto)/i
];

const DANGEROUS = /(npm\s+install|pnpm\s+install|yarn\s+install|npx\s+|sudo\s+|rm\s+-|curl\s+\S+\s*\|\s*sh|git\s+push)/i;
const URL_RE = /(https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/\S*)?)/i;

export function detectLocalActionIntent(prompt: string): LocalActionIntent {
  return PREVIEW_PATTERNS.some((p) => p.test(prompt)) ? "preview" : "none";
}

const PREVIEW_CREATE_PATTERNS = [
  /cre[aá](r|me|á|a)\s+(una\s+)?(p[aá]gina|web|app|sitio|proyecto)/i,
  /gener[aá]\s+index\.html/i,
  /hac[eé]me\s+una\s+(p[aá]gina|web|app)/i,
  /hac[eé]me\s+una\s+p[aá]gina\s+web/i,
  /modific[aá]|edit[aá]|actualiz[aá]/i,
  /cre[aá].*localhost/i,
  /localhost.*cre[aá]/i
];

/** Fast-path preview only when user wants to view an existing servable project. */
export function shouldUsePreviewFastPath(prompt: string): boolean {
  if (detectLocalActionIntent(prompt) !== "preview") return false;
  if (PREVIEW_CREATE_PATTERNS.some((p) => p.test(prompt))) return false;
  return true;
}

export function detectPackageManager(workspace: string): Pm {
  if (existsSync(join(workspace, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(workspace, "yarn.lock"))) return "yarn";
  return "npm";
}

export function selectDevScript(scripts: Record<string, string> | undefined): {
  scriptName?: string;
  scriptBody?: string;
} {
  if (!scripts) return {};
  for (const key of ["dev", "start", "serve", "preview"]) {
    if (typeof scripts[key] === "string") return { scriptName: key, scriptBody: scripts[key] };
  }
  return {};
}

export async function buildPreviewPlan(workspace: string): Promise<PreviewPlan> {
  const packageJsonPath = join(workspace, "package.json");
  if (existsSync(packageJsonPath)) {
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    const { scriptName, scriptBody } = selectDevScript(pkg.scripts);
    if (!scriptName || !scriptBody) {
      throw new Error("No encontré scripts dev/start/serve/preview en package.json");
    }
    if (DANGEROUS.test(scriptBody)) {
      throw new Error("Script bloqueado por seguridad (install/npx/sudo/rm/curl/git push).");
    }
    const pm = detectPackageManager(workspace);
    const baseArgs = pm === "yarn" ? [scriptName] : ["run", scriptName];
    return {
      command: pm,
      args: baseArgs,
      kind: "package-script",
      scriptName,
      scriptBody,
      portHint: inferPortHint(scriptName, scriptBody)
    };
  }

  if (existsSync(join(workspace, "index.html"))) {
    return {
      command: "python3",
      args: ["-m", "http.server", "8000"],
      kind: "python-static",
      portHint: 8000
    };
  }

  throw new Error("No encontré un proyecto servible (package.json con scripts o index.html).");
}

export function inferPortHint(scriptName: string, scriptBody: string): number {
  const lower = `${scriptName} ${scriptBody}`.toLowerCase();
  if (lower.includes("vite")) return 5173;
  if (lower.includes("next") || lower.includes("start")) return 3000;
  return 3000;
}

export async function ensurePreviewServer(
  workspace: string,
  opts?: { spawnProcess?: SpawnLike; startupTimeoutMs?: number }
): Promise<{
  reused: boolean;
  url: string;
  logs: string[];
}> {
  const existing = runningServers.get(workspace);
  if (
    existing &&
    existing.process.pid &&
    existing.process.exitCode == null &&
    existing.process.signalCode == null
  ) {
    return { reused: true, url: existing.url ?? "http://localhost:3000", logs: tail(existing.logs, 10) };
  }

  const plan = await buildPreviewPlan(workspace);
  const port = await findOpenPort(plan.portHint);
  const env = { ...process.env, PORT: String(port) };
  if (plan.kind === "python-static") {
    plan.args = ["-m", "http.server", String(port)];
  }
  const spawnProcess = opts?.spawnProcess ?? spawn;
  const child = spawnProcess(plan.command, plan.args, { cwd: workspace, shell: false, env });
  const logs: string[] = [];
  const commandPreview = `${plan.command} ${plan.args.join(" ")}`;
  const server: RunningServer = { workspace, process: child, logs, commandPreview };
  runningServers.set(workspace, server);

  child.on("exit", () => {
    runningServers.delete(workspace);
  });

  try {
    const url = await waitForServerUrl(child, logs, port, opts?.startupTimeoutMs ?? 30_000);
    server.url = url;
    return { reused: false, url, logs: tail(logs, 10) };
  } catch (error) {
    killPreviewProcess(child);
    runningServers.delete(workspace);
    throw error;
  }
}

function killPreviewProcess(proc: ChildProcess): void {
  if (!proc.pid) return;
  try {
    proc.kill("SIGTERM");
  } catch {
    // ignore
  }
  setTimeout(() => {
    if (proc.exitCode == null && proc.signalCode == null) {
      try {
        proc.kill("SIGKILL");
      } catch {
        // ignore
      }
    }
  }, 3000).unref();
}

export function stopPreviewServer(workspace: string): boolean {
  const existing = runningServers.get(workspace);
  if (!existing) return false;
  killPreviewProcess(existing.process);
  runningServers.delete(workspace);
  return true;
}

export function stopAllPreviewServers(): void {
  for (const s of runningServers.values()) killPreviewProcess(s.process);
  runningServers.clear();
}

export function parseUrlFromOutput(chunk: string): string | null {
  const clean = chunk.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");
  const m = clean.match(URL_RE);
  return m?.[1] ?? null;
}

export function redactLogSecrets(input: string): string {
  return input
    .replace(/sk-[A-Za-z0-9_-]{6,}/g, "[REDACTED]")
    .replace(/ghp_[A-Za-z0-9]{16,}/g, "[REDACTED]")
    .replace(/github_pat_[A-Za-z0-9_]{16,}/g, "[REDACTED]");
}

async function waitForServerUrl(
  child: ChildProcess,
  logs: string[],
  fallbackPort: number,
  timeoutMs: number
): Promise<string> {
  return await new Promise((resolve, reject) => {
    let done = false;
    const finish = (err?: Error, url?: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(url ?? `http://localhost:${fallbackPort}`);
    };
    const onChunk = (d: Buffer) => {
      const raw = d.toString();
      logs.push(redactLogSecrets(raw));
      const parsed = parseUrlFromOutput(raw);
      if (parsed) finish(undefined, parsed);
    };
    child.stdout?.on("data", onChunk);
    child.stderr?.on("data", onChunk);
    child.on("error", (e) => finish(new Error(String(e))));
    child.on("exit", (code) => {
      if (code !== 0 && !done) {
        finish(new Error(`Servidor terminó con código ${code}. Logs: ${tail(logs, 10).join("\n")}`));
      }
    });
    const timer = setTimeout(async () => {
      const maybeUp = await isPortOccupied(fallbackPort);
      if (maybeUp) return finish(undefined, `http://localhost:${fallbackPort}`);
      finish(new Error(`Timeout iniciando servidor (${Math.round(timeoutMs / 1000)}s). Logs: ${tail(logs, 10).join("\n")}`));
    }, timeoutMs);
  });
}

async function findOpenPort(start: number): Promise<number> {
  let port = start;
  for (let i = 0; i < 10; i += 1) {
    if (!(await isPortOccupied(port))) return port;
    port += 1;
  }
  return start;
}

async function isPortOccupied(port: number): Promise<boolean> {
  return await new Promise((resolve) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

function tail(lines: string[], n: number): string[] {
  return lines.slice(Math.max(0, lines.length - n));
}
