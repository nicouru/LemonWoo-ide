import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { PassThrough } from "node:stream";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  buildPreviewPlan,
  detectCreationIntent,
  detectLocalActionIntent,
  detectPackageManager,
  ensurePreviewServer,
  hasServableProject,
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

  it("detects creation intents (ES/EN)", () => {
    expect(detectCreationIntent("creá una web")).toBe(true);
    expect(detectCreationIntent("haceme una página")).toBe(true);
    expect(detectCreationIntent("create a web page")).toBe(true);
    expect(detectCreationIntent("make a site")).toBe(true);
    expect(detectCreationIntent("levantá servidor local")).toBe(false);
  });

  it("empty workspace creation prompts do not use preview fast-path", () => {
    const empty = tmpWorkspace("empty-create");
    expect(hasServableProject(empty)).toBe(false);
    expect(shouldUsePreviewFastPath("creá una web", empty)).toBe(false);
    expect(shouldUsePreviewFastPath("haceme una pagina web", empty)).toBe(false);
    expect(shouldUsePreviewFastPath("create a web page", empty)).toBe(false);
    expect(shouldUsePreviewFastPath("make an app for my shop", empty)).toBe(false);
    rmSync(empty, { recursive: true, force: true });
  });

  it("preview fast-path requires servable project on disk", () => {
    const empty = tmpWorkspace("empty-preview");
    expect(shouldUsePreviewFastPath("levantá servidor local", empty)).toBe(false);
    expect(shouldUsePreviewFastPath("quiero ver la página en localhost", empty)).toBe(false);

    writeFileSync(join(empty, "index.html"), "<h1>ok</h1>");
    expect(shouldUsePreviewFastPath("levantá servidor local", empty)).toBe(true);
    expect(shouldUsePreviewFastPath("quiero ver la página en localhost", empty)).toBe(true);
    rmSync(empty, { recursive: true, force: true });
  });

  it("shouldUsePreviewFastPath blocks mixed create-and-preview prompts", () => {
    const ws = tmpWorkspace("mixed");
    writeFileSync(join(ws, "index.html"), "<h1>ok</h1>");
    expect(shouldUsePreviewFastPath("haceme una pagina web y levantá localhost", ws)).toBe(false);
    expect(shouldUsePreviewFastPath("creá index.html y mostrame url", ws)).toBe(false);
    expect(shouldUsePreviewFastPath("creá una web", ws)).toBe(false);
    rmSync(ws, { recursive: true, force: true });
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

  it("returns real URL on next port when default 8000 is occupied", async () => {
    const ws = tmpWorkspace("port8001");
    writeFileSync(join(ws, "index.html"), "<h1>ok</h1>");

    const blocker = createServer((_req, res) => {
      res.end("blocked");
    });
    await new Promise<void>((resolvePromise) => blocker.listen(8000, "127.0.0.1", resolvePromise));

    let chosenPort = 0;
    const fakeSpawn = (_command: string, args: string[]) => {
      chosenPort = Number(args[args.length - 1]);
      expect(chosenPort).toBeGreaterThan(8000);
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      const handlers = new Map<string, ((...args: any[]) => void)[]>();
      const listener = createServer((_req, res) => res.end("ok"));
      listener.listen(chosenPort, "127.0.0.1");
      const child: any = {
        pid: 4321,
        exitCode: null,
        signalCode: null,
        stdout,
        stderr,
        on(event: string, cb: (...args: any[]) => void) {
          const list = handlers.get(event) ?? [];
          list.push(cb);
          handlers.set(event, list);
          return child;
        },
        kill() {
          listener.close();
          (handlers.get("exit") ?? []).forEach((h) => h(0));
          return true;
        }
      };
      queueMicrotask(() => stdout.write(`Serving HTTP on http://localhost:${chosenPort}/\n`));
      return child;
    };

    try {
      const preview = await ensurePreviewServer(ws, {
        spawnProcess: fakeSpawn as any,
        startupTimeoutMs: 2000
      });
      expect(preview.url).toBe(`http://localhost:${chosenPort}/`);
      expect(preview.reused).toBe(false);
    } finally {
      blocker.close();
      stopAllPreviewServers();
      rmSync(ws, { recursive: true, force: true });
    }
  });
});
