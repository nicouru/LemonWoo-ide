#!/usr/bin/env node
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const fixture = join(root, "fixtures", "v2-web-preview-agent");

if (!existsSync(fixture)) {
  console.error("Missing fixture: fixtures/v2-web-preview-agent");
  process.exit(1);
}

const workspace = mkdtempSync(join(tmpdir(), "lemonwoo-web-preview-"));
cpSync(fixture, workspace, { recursive: true });

writeFileSync(join(workspace, "index.html"), "<!doctype html><html><head><link rel='stylesheet' href='style.css'></head><body><script src='script.js'></script></body></html>");
writeFileSync(join(workspace, "style.css"), "body { font-family: sans-serif; }");
writeFileSync(join(workspace, "script.js"), "console.log('lemonwoo-web-preview');");

const required = ["index.html", "style.css", "script.js"];
const missing = required.filter((p) => !existsSync(join(workspace, p)));
if (missing.length) {
  console.error("verify files failed:", missing.join(", "));
  process.exit(1);
}

const port = await findOpenPort(8765);
const child = spawn("python3", ["-m", "http.server", String(port)], {
  cwd: workspace,
  shell: false
});

let logs = "";
child.stdout?.on("data", (d) => (logs += d.toString()));
child.stderr?.on("data", (d) => (logs += d.toString()));

await waitForPort(port, 15_000);
const up = await isPortOccupied(port);
if (!up) {
  child.kill("SIGTERM");
  rmSync(workspace, { recursive: true, force: true });
  console.error("Preview server did not bind port", port, logs);
  process.exit(1);
}

const url = `http://localhost:${port}`;
child.kill("SIGTERM");
await new Promise((r) => setTimeout(r, 500));
const stillUp = await isPortOccupied(port);

rmSync(workspace, { recursive: true, force: true });

if (stillUp) {
  console.error("Preview process still holding port after stop");
  process.exit(1);
}

console.log("V2 web preview gauntlet passed.");
console.log("URL verified:", url);
console.log("Files verified:", required.join(", "));

async function waitForPort(port, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isPortOccupied(port)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function isPortOccupied(port) {
  return await new Promise((resolve) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

async function findOpenPort(start) {
  for (let p = start; p < start + 10; p += 1) {
    if (!(await isPortOccupied(p))) return p;
  }
  return start;
}
