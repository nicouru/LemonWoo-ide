import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { PassThrough } from "node:stream";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  buildPreviewPlan,
  detectLocalActionIntent,
  detectPackageManager,
  ensurePreviewServer,
  parseUrlFromOutput,
  redactLogSecrets,
  selectDevScript,
  shouldUsePreviewFastPath,
  stopAllPreviewServers,
  stopPreviewServer
} from "../src/localActions.js";

function tmpWorkspace(name: string): string {
  return mkdtempSync(join(tmpdir(), `lemonwoo-${name}-`));
}

describe("local action intent", () => {
  it("detects preview/dev-server intent", () => {
    expect(detectLocalActionIntent("quiero ver la página en una URL local")).toBe("preview");
    expect(detectLocalActionIntent("levantá servidor local")).toBe("preview");
  });

  it("ignores unrelated prompts", () => {
    expect(detectLocalActionIntent("explicame este error de typescript")).toBe("none");
  });

  it("shouldUsePreviewFastPath blocks create-web prompts", () => {
    expect(shouldUsePreviewFastPath("haceme una pagina web y levantá localhost")).toBe(false);
    expect(shouldUsePreviewFastPath("creá index.html y mostrame url")).toBe(false);
    expect(shouldUsePreviewFastPath("levantá servidor local")).toBe(true);
    expect(shouldUsePreviewFastPath("quiero ver la página en localhost")).toBe(true);
  });

  it("does not hijack casual localhost mentions", () => {
    expect(detectLocalActionIntent("documentá que el API corre en http://localhost:3000")).toBe("none");
    expect(detectLocalActionIntent("mencioná localhost en el readme")).toBe("none");
  });
});

describe("script and package manager selection", () => {
  it("selects scripts by priority", () => {
    expect(selectDevScript({ preview: "vite preview", dev: "next dev" }).scriptName).toBe("dev");
    expect(selectDevScript({ start: "node server.js" }).scriptName).toBe("start");
  });

  it("selects package manager by lockfile", () => {
    const pnpmWs = tmpWorkspace("pnpm");
    writeFileSync(join(pnpmWs, "pnpm-lock.yaml"), "lockfileVersion: 9");
    expect(detectPackageManager(pnpmWs)).toBe("pnpm");
    rmSync(pnpmWs, { recursive: true, force: true });

    const yarnWs = tmpWorkspace("yarn");
    writeFileSync(join(yarnWs, "yarn.lock"), "yarn lock");
    expect(detectPackageManager(yarnWs)).toBe("yarn");
    rmSync(yarnWs, { recursive: true, force: true });
  });
});

describe("preview plan", () => {
  it("chooses dev script from package.json", async () => {
    const ws = tmpWorkspace("pkg");
    writeFileSync(
      join(ws, "package.json"),
      JSON.stringify({ scripts: { dev: "vite", test: "vitest" } }, null, 2)
    );
    writeFileSync(join(ws, "pnpm-lock.yaml"), "lockfileVersion: 9");
    const plan = await buildPreviewPlan(ws);
    expect(plan.command).toBe("pnpm");
    expect(plan.args).toEqual(["run", "dev"]);
    rmSync(ws, { recursive: true, force: true });
  });

  it("falls back to python static server", async () => {
    const ws = tmpWorkspace("static");
    writeFileSync(join(ws, "index.html"), "<h1>ok</h1>");
    const plan = await buildPreviewPlan(ws);
    expect(plan.command).toBe("python3");
    expect(plan.args[0]).toBe("-m");
    rmSync(ws, { recursive: true, force: true });
  });

  it("rejects dangerous scripts", async () => {
    const ws = tmpWorkspace("danger");
    writeFileSync(join(ws, "package.json"), JSON.stringify({ scripts: { dev: "npm install && next dev" } }));
    await expect(buildPreviewPlan(ws)).rejects.toThrow(/bloqueado por seguridad/i);
    rmSync(ws, { recursive: true, force: true });
  });

  it("shows clear error when no servable project", async () => {
    const ws = tmpWorkspace("empty");
    await expect(buildPreviewPlan(ws)).rejects.toThrow(/No encontré un proyecto servible/i);
    rmSync(ws, { recursive: true, force: true });
  });
});

describe("output parsing and redaction", () => {
  it("parses localhost URL from logs", () => {
    const line = "ready in 200ms: http://localhost:5173/";
    expect(parseUrlFromOutput(line)).toContain("http://localhost:5173");
  });

  it("parses localhost URL when stdout contains ANSI color codes", () => {
    const line = "\x1B[32mready\x1B[0m at \x1B[1mhttp://localhost:4173/\x1B[0m";
    expect(parseUrlFromOutput(line)).toBe("http://localhost:4173/");
  });

  it("redacts secrets in logs", () => {
    const line = "token sk-123456 and ghp_abcdefghijklmnopqrstuv";
    const out = redactLogSecrets(line);
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("sk-123456");
  });
});

import { fileURLToPath } from "node:url";

describe("spawn safety", () => {
  it("uses spawn without shell true in localActions", () => {
    const curFile = fileURLToPath(import.meta.url);
    const src = readFileSync(resolve(curFile, "../../src/localActions.ts"), "utf8");
    expect(src).toContain("shell: false");
  });
});

describe("server lifecycle", () => {
  it("reuses same workspace server and stops process", async () => {
    const ws = tmpWorkspace("lifecycle");
    writeFileSync(join(ws, "index.html"), "<h1>ok</h1>");
    const fakeSpawn = () => {
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      const handlers = new Map<string, ((...args: any[]) => void)[]>();
      const child: any = {
        pid: 1234,
        killed: false,
        stdout,
        stderr,
        on(event: string, cb: (...args: any[]) => void) {
          const list = handlers.get(event) ?? [];
          list.push(cb);
          handlers.set(event, list);
          return child;
        },
        kill() {
          child.killed = true;
          (handlers.get("exit") ?? []).forEach((h) => h(0));
          return true;
        }
      };
      queueMicrotask(() => stdout.write("Local: http://localhost:8000/\n"));
      return child;
    };
    const first = await ensurePreviewServer(ws, { spawnProcess: fakeSpawn as any, startupTimeoutMs: 200 });
    const second = await ensurePreviewServer(ws, { spawnProcess: fakeSpawn as any, startupTimeoutMs: 200 });
    expect(first.url).toContain("http://localhost:");
    expect(second.reused).toBe(true);
    expect(stopPreviewServer(ws)).toBe(true);
    expect(stopPreviewServer(ws)).toBe(false);
    rmSync(ws, { recursive: true, force: true });
    stopAllPreviewServers();
  });
});
