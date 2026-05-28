import * as vscode from "vscode";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { spawn } from "node:child_process";
import {
  detectLocalActionIntent,
  ensurePreviewServer,
  stopAllPreviewServers,
  stopPreviewServer
} from "./localActions.js";

const KEY_NAME = "deepseek.apiKey";
const VIEW_TYPE = "lemonwoo.agentView";
const BASE_URL = "https://api.deepseek.com";
const MODEL_PRO = "deepseek-v4-pro";
const MODEL_FLASH = "deepseek-v4-flash";
const ALIAS_PRO = "deepseek-reasoner";
const ALIAS_FLASH = "deepseek-chat";

type AgentState = "Pensando" | "Escribiendo" | "Verificando" | "Listo";
type AgentRoute = { modelKey: "pro" | "flash"; state: AgentState };

let activePanel: vscode.WebviewPanel | undefined;
let activeAbort: AbortController | undefined;
let cachedModels: { pro: string; flash: string } | undefined;

export function activate(context: vscode.ExtensionContext) {
  const openAgent = vscode.commands.registerCommand("lemonwoo.openAgent", async () => {
    await openAgentPanel(context);
  });
  context.subscriptions.push(openAgent);

  // LemonWoo's primary surface is the agent. Open it automatically on startup.
  void openAgentPanel(context);
}

async function openAgentPanel(context: vscode.ExtensionContext) {
  if (activePanel) {
    activePanel.reveal(vscode.ViewColumn.One);
    await ensureKey(context, activePanel);
    return;
  }

  const panel = vscode.window.createWebviewPanel(VIEW_TYPE, "LemonWoo Agent", vscode.ViewColumn.One, {
    enableScripts: true,
    retainContextWhenHidden: true
  });
  activePanel = panel;
  panel.onDidDispose(() => {
    if (activePanel === panel) activePanel = undefined;
    activeAbort?.abort();
    activeAbort = undefined;
    stopAllPreviewServers();
  });
  panel.webview.html = renderHtml();
  panel.webview.onDidReceiveMessage(async (msg) => {
    if (msg.type === "run") {
      await handleRun(context, panel, String(msg.text ?? ""));
    }
    if (msg.type === "stop") {
      activeAbort?.abort();
      activeAbort = undefined;
      panel.webview.postMessage({ type: "status", state: "Listo" satisfies AgentState });
    }
    if (msg.type === "stopServer") {
      const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspace) return;
      const stopped = stopPreviewServer(workspace);
      panel.webview.postMessage({
        type: stopped ? "serverStopped" : "error",
        text: stopped ? "Servidor detenido." : "No hay servidor activo para este workspace."
      });
      panel.webview.postMessage({ type: "status", state: "Listo" satisfies AgentState });
    }
    if (msg.type === "saveKey") {
      const key = String(msg.key ?? "").trim();
      if (!key) {
        panel.webview.postMessage({ type: "error", text: "Pegá una API key válida." });
        return;
      }
      await context.secrets.store(KEY_NAME, key);
      cachedModels = undefined;
      panel.webview.postMessage({ type: "ready" });
      panel.webview.postMessage({ type: "status", state: "Listo" satisfies AgentState });
    }
    if (msg.type === "clearKey") {
      await context.secrets.delete(KEY_NAME);
      cachedModels = undefined;
      panel.webview.postMessage({ type: "needKey" });
    }
    if (msg.type === "applyDiff") {
      await applyDiff(panel, String(msg.diff ?? ""));
    }
    if (msg.type === "runTestGate") {
      await handleTestGate(panel);
    }
  });
  await ensureKey(context, panel);
}

function redactSecrets(input: string): string {
  return input
    .replace(/sk-[A-Za-z0-9_-]{6,}/g, "[REDACTED]")
    .replace(/ghp_[A-Za-z0-9]{16,}/g, "[REDACTED]")
    .replace(/github_pat_[A-Za-z0-9_]{16,}/g, "[REDACTED]");
}

async function ensureKey(context: vscode.ExtensionContext, panel: vscode.WebviewPanel) {
  const key = await context.secrets.get(KEY_NAME);
  panel.webview.postMessage({ type: key ? "ready" : "needKey" });
  panel.webview.postMessage({ type: "status", state: "Listo" satisfies AgentState });
}

async function handleRun(context: vscode.ExtensionContext, panel: vscode.WebviewPanel, prompt: string) {
  if (!prompt.trim()) {
    panel.webview.postMessage({ type: "error", text: "Escribí una tarea para el agente." });
    return;
  }

  const localIntent = detectLocalActionIntent(prompt);
  if (localIntent === "preview") {
    const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspace) {
      panel.webview.postMessage({ type: "error", text: "Abrí una carpeta para levantar preview local." });
      return;
    }
    panel.webview.postMessage({ type: "status", state: "Verificando" satisfies AgentState });
    try {
      const preview = await ensurePreviewServer(workspace);
      panel.webview.postMessage({
        type: "serverReady",
        reused: preview.reused,
        url: preview.url,
        logs: preview.logs.join("\n")
      });
    } catch (error) {
      panel.webview.postMessage({ type: "error", text: redactSecrets(String(error)) });
    } finally {
      panel.webview.postMessage({ type: "status", state: "Listo" satisfies AgentState });
    }
    return;
  }

  const apiKey = await context.secrets.get(KEY_NAME);
  if (!apiKey) {
    panel.webview.postMessage({ type: "needKey" });
    panel.webview.postMessage({ type: "error", text: "Pegá tu DeepSeek API key para conectar LemonWoo." });
    return;
  }

  activeAbort?.abort();
  activeAbort = new AbortController();

  const editor = vscode.window.activeTextEditor;
  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const selectedText = editor?.document.getText(editor.selection) ?? "";
  const fileText = editor?.document.getText() ?? "";
  const filePath = editor?.document.uri.fsPath ?? "";
  const diagnostics = editor ? vscode.languages.getDiagnostics(editor.document.uri) : [];
  const rules = workspace ? readRules(workspace) : "";
  const agentsMd = workspace ? readOptionalFile(join(workspace, "AGENTS.md")) : "";
  const diff = workspace ? await readGitDiff(workspace) : "";

  const system = [
    "You are LemonWoo Agent, a coding agent inside LemonWoo IDE.",
    "DeepSeek only. No provider picker, no model picker.",
    "Use the provided repo context. Never output secrets.",
    "Never claim actions are done (created/modified/run/server started) unless LemonWoo actually executed and verified them locally.",
    "If you return code changes, treat them as propuesta until Apply succeeds.",
    "When proposing code edits, include a concise explanation and a fenced ```diff block."
  ].join("\n");
  const user = [
    `User task:\n${prompt}`,
    `File:\n${filePath}`,
    `Selection:\n${selectedText}`,
    `Diagnostics:\n${diagnostics.map((d) => d.message).join("\n")}`,
    `Git diff:\n${diff}`,
    `AGENTS.md:\n${agentsMd}`,
    `.lemonwoo/rules:\n${rules}`,
    `Open file context (truncated):\n${fileText.slice(0, 4000)}`
  ].join("\n\n");

  const route = routePanelTask(prompt);
  panel.webview.postMessage({ type: "status", state: route.state });
  try {
    const models = await resolveDeepSeekModels(apiKey, activeAbort.signal);
    const firstModel = route.modelKey === "flash" ? models.flash : models.pro;
    let out = await deepseekChat(apiKey, system, user, firstModel, activeAbort.signal);
    if (route.modelKey === "flash" && !out.trim()) {
      panel.webview.postMessage({ type: "status", state: "Pensando" satisfies AgentState });
      out = await deepseekChat(apiKey, system, user, models.pro, activeAbort.signal);
    }
    const hasDiff = /```diff[\s\S]*?```/.test(out);
    const resultText = hasDiff ? `Propuesta (todavía no aplicada):\n\n${out}` : out;
    panel.webview.postMessage({ type: "result", text: redactSecrets(resultText), hasDiff });
    panel.webview.postMessage({ type: "status", state: "Listo" satisfies AgentState });
  } catch (error) {
    const text = String(error);
    if (text.includes("AbortError") || text.includes("aborted")) {
      panel.webview.postMessage({ type: "error", text: "Tarea cancelada." });
    } else {
      if (/401|unauthorized|invalid.?key/i.test(text)) {
        panel.webview.postMessage({ type: "needKey" });
      }
      panel.webview.postMessage({ type: "error", text: redactSecrets(text) });
    }
    panel.webview.postMessage({ type: "status", state: "Listo" satisfies AgentState });
  } finally {
    activeAbort = undefined;
  }
}

function routePanelTask(prompt: string): AgentRoute {
  const text = prompt.toLowerCase();
  const asksForReasoning = /(refactor|debug|depur|test|verific|error|arquitect|plan|multi.?archivo|seguridad|auth|base de datos|corrige|fix|falla|build|migraci|analiza|explica)/i.test(text);
  const asksForSmallWrite = /(tab|autocomplete|autocomplet|inline|complet|contin[uú]a|escrib|genera|crea|agrega|añad|cambia|renombra|formatea)/i.test(text);
  if (asksForSmallWrite && !asksForReasoning) {
    return { modelKey: "flash", state: "Escribiendo" };
  }
  return { modelKey: "pro", state: "Pensando" };
}

async function resolveDeepSeekModels(apiKey: string, signal?: AbortSignal): Promise<{ pro: string; flash: string }> {
  if (cachedModels) return cachedModels;
  try {
    const response = await fetch(`${BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal
    });
    if (!response.ok) {
      throw new Error(`DeepSeek /models failed: ${response.status}`);
    }
    const json: any = await response.json();
    const ids = new Set((json.data ?? []).map((m: any) => m.id));
    if (ids.has(MODEL_PRO) && ids.has(MODEL_FLASH)) {
      cachedModels = { pro: MODEL_PRO, flash: MODEL_FLASH };
    } else if (ids.has(ALIAS_PRO) && ids.has(ALIAS_FLASH)) {
      cachedModels = { pro: ALIAS_PRO, flash: ALIAS_FLASH };
    } else {
      cachedModels = { pro: MODEL_PRO, flash: MODEL_FLASH };
    }
  } catch (error) {
    if (String(error).includes("AbortError") || String(error).includes("aborted")) {
      throw error;
    }
    cachedModels = { pro: MODEL_PRO, flash: MODEL_FLASH };
  }
  return cachedModels;
}

async function deepseekChat(
  apiKey: string,
  system: string,
  prompt: string,
  model: string,
  signal?: AbortSignal
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), model === MODEL_PRO || model === ALIAS_PRO ? 120_000 : 25_000);
  const abortListener = () => controller.abort();
  signal?.addEventListener("abort", abortListener, { once: true });
  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt }
        ],
        stream: false
      }),
      signal: controller.signal
    });
    const json: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(JSON.stringify(json));
    }
    return json.choices?.[0]?.message?.content ?? "";
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortListener);
  }
}

function readOptionalFile(path: string): string {
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8").slice(0, 6000);
}

function readRules(workspace: string): string {
  const rulesDir = join(workspace, ".lemonwoo", "rules");
  if (!existsSync(rulesDir)) return "";
  const files = readdirSync(rulesDir).filter((f) => f.endsWith(".md"));
  return files.map((f) => readOptionalFile(join(rulesDir, f))).join("\n---\n");
}

async function readGitDiff(workspace: string): Promise<string> {
  return await new Promise((resolve) => {
    const child = spawn("git", ["diff", "--", "."], { cwd: workspace, shell: false });
    let out = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve(out.slice(0, 6000));
    }, 2000);
    child.stdout.on("data", (d) => (out += d.toString()));
    child.on("exit", () => {
      clearTimeout(timer);
      resolve(out.slice(0, 6000));
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve("");
    });
  });
}

function isSafeWorkspacePath(workspace: string, filePath: string): boolean {
  const rel = relative(workspace, filePath);
  return Boolean(rel) && !rel.startsWith("..") && !rel.startsWith("/") && !rel.split(/[\\/]/).includes(".git");
}

async function applyDiff(panel: vscode.WebviewPanel, rawDiff: string) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    panel.webview.postMessage({ type: "error", text: "Abrí un archivo antes de aplicar cambios." });
    return;
  }
  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspace) {
    panel.webview.postMessage({ type: "error", text: "Abrí una carpeta antes de aplicar cambios." });
    return;
  }
  const filePath = editor.document.uri.fsPath;
  if (!isSafeWorkspacePath(workspace, filePath)) {
    panel.webview.postMessage({ type: "error", text: "Ruta bloqueada por seguridad." });
    return;
  }
  const original = editor.document.getText();
  const replacement = applyUnifiedDiffToText(original, rawDiff);
  if (!replacement) {
    panel.webview.postMessage({ type: "error", text: "No pude aplicar el diff: falta un bloque ```diff o el contexto no coincide con el archivo activo." });
    return;
  }
  const edit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(editor.document.positionAt(0), editor.document.positionAt(original.length));
  edit.replace(editor.document.uri, fullRange, replacement);
  const ok = await vscode.workspace.applyEdit(edit);
  if (!ok) {
    panel.webview.postMessage({ type: "error", text: "No se pudo aplicar el diff. El archivo quedó sin cambios." });
    return;
  }
  panel.webview.postMessage({ type: "applied" });
}

function extractDiffBlock(raw: string): string | null {
  const match = raw.match(/```diff([\s\S]*?)```/);
  return match?.[1] ?? null;
}

function applyUnifiedDiffToText(original: string, rawDiff: string): string | null {
  const block = extractDiffBlock(rawDiff);
  if (!block) return null;

  const newline = original.includes("\r\n") ? "\r\n" : "\n";
  const hadTrailingNewline = original.endsWith("\n");
  const originalLines = original.length ? original.split(/\r?\n/) : [];
  if (hadTrailingNewline) originalLines.pop();

  const diffLines = block.split(/\r?\n/);
  const output: string[] = [];
  let cursor = 0;
  let sawHunk = false;

  for (let i = 0; i < diffLines.length; i += 1) {
    const header = diffLines[i].match(/^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/);
    if (!header) continue;
    sawHunk = true;
    const hunkStart = Number(header[1]) - 1;
    if (hunkStart < cursor) return null;
    while (cursor < hunkStart) output.push(originalLines[cursor++]);

    i += 1;
    for (; i < diffLines.length; i += 1) {
      const line = diffLines[i];
      if (line.startsWith("@@")) {
        i -= 1;
        break;
      }
      if (line.startsWith("\\ No newline")) continue;
      if (line.startsWith(" ")) {
        const expected = line.slice(1);
        if (originalLines[cursor] !== expected) return null;
        output.push(originalLines[cursor++]);
        continue;
      }
      if (line.startsWith("-")) {
        const expected = line.slice(1);
        if (originalLines[cursor] !== expected) return null;
        cursor += 1;
        continue;
      }
      if (line.startsWith("+")) {
        output.push(line.slice(1));
      }
    }
  }

  if (!sawHunk) return null;
  while (cursor < originalLines.length) output.push(originalLines[cursor++]);
  return output.join(newline) + (hadTrailingNewline ? newline : "");
}

async function handleTestGate(panel: vscode.WebviewPanel) {
  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspace) {
    panel.webview.postMessage({ type: "error", text: "Abrí una carpeta para ejecutar TestGate." });
    return;
  }
  panel.webview.postMessage({ type: "status", state: "Verificando" satisfies AgentState });
  const result = await runTestGateLocal(workspace);
  panel.webview.postMessage({ type: "testOutput", text: result.output, ok: result.ok });
  panel.webview.postMessage({ type: "status", state: "Listo" satisfies AgentState });
}

async function runTestGateLocal(workspace: string): Promise<{ ok: boolean; output: string }> {
  const pkg = join(workspace, "package.json");
  if (!existsSync(pkg)) return { ok: true, output: "No hay package.json; TestGate omitido." };
  const scripts = JSON.parse(readFileSync(pkg, "utf8")).scripts ?? {};
  const command = scripts.typecheck
    ? ["run", "typecheck"]
    : scripts.lint
      ? ["run", "lint"]
      : scripts.test
        ? ["run", "test"]
        : null;
  if (!command) return { ok: true, output: "No se detectaron scripts test/lint/typecheck." };
  const manager = existsSync(join(workspace, "pnpm-lock.yaml"))
    ? "pnpm"
    : existsSync(join(workspace, "yarn.lock"))
      ? "yarn"
      : "npm";
  return await new Promise((resolve) => {
    const child = spawn(manager, command, { cwd: workspace, shell: false });
    let out = "";
    let settled = false;
    const finish = (result: { ok: boolean; output: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: result.ok, output: redactSecrets(result.output) });
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish({ ok: false, output: "TestGate timeout after 120s" });
    }, 120_000);
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (out += d.toString()));
    child.on("error", (error) => finish({ ok: false, output: String(error) }));
    child.on("exit", (code) => finish({ ok: code === 0, output: out }));
  });
}

function renderHtml(): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    :root { color-scheme: light dark; }
    body { font-family: var(--vscode-font-family); margin: 0; padding: 20px; }
    main { max-width: 860px; margin: 0 auto; display: grid; gap: 14px; }
    .row { display: flex; gap: 8px; align-items: center; }
    #state { color: var(--vscode-descriptionForeground); font-size: 12px; }
    #keyBox { border: 1px solid var(--vscode-input-border); padding: 12px; border-radius: 6px; }
    input, textarea { width: 100%; box-sizing: border-box; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px; padding: 10px; }
    textarea { min-height: 118px; resize: vertical; }
    button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: 0; border-radius: 4px; padding: 8px 12px; cursor: pointer; }
    button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    #stop, #retry, #apply, #tests, #stopServer { display: none; }
    pre { white-space: pre-wrap; word-break: break-word; border-top: 1px solid var(--vscode-panel-border); padding-top: 14px; }
  </style>
</head>
<body>
  <main>
    <div class="row">
      <strong>LemonWoo Agent</strong>
      <span id="state">Listo</span>
    </div>
    <div id="keyBox">
      <p>Conectá DeepSeek para empezar a programar.</p>
      <div class="row">
        <input id="key" type="password" placeholder="DeepSeek API key" />
        <button onclick="saveKey()">Conectar</button>
      </div>
    </div>
    <textarea id="prompt" placeholder="Escribile al agente qué querés programar..."></textarea>
    <div class="row">
      <button onclick="run()">Enviar</button>
      <button id="stop" class="secondary" onclick="stop()">Stop</button>
      <button id="retry" class="secondary" onclick="retry()">Retry</button>
      <button id="apply" onclick="applyDiff()">Aplicar diff</button>
      <button id="tests" class="secondary" onclick="runTestGate()">Verificar</button>
      <button id="stopServer" class="secondary" onclick="stopServer()">Detener servidor</button>
    </div>
    <pre id="out"></pre>
  </main>
  <script>
    const vscode = acquireVsCodeApi();
    let last = "";
    function run(){
      document.getElementById('retry').style.display='none';
      vscode.postMessage({type:'run', text: document.getElementById('prompt').value});
    }
    function retry(){ run(); }
    function stop(){ vscode.postMessage({type:'stop'}); }
    function saveKey(){ vscode.postMessage({type:'saveKey', key: document.getElementById('key').value});}
    function applyDiff(){ vscode.postMessage({type:'applyDiff', diff: last}); }
    function runTestGate(){ vscode.postMessage({type:'runTestGate'}); }
    function stopServer(){ vscode.postMessage({type:'stopServer'}); }
    window.addEventListener('message', (event) => {
      const m = event.data;
      if (m.type === 'status') {
        document.getElementById('state').textContent = m.state;
        document.getElementById('stop').style.display = m.state === 'Pensando' || m.state === 'Escribiendo' || m.state === 'Verificando' ? 'inline-block' : 'none';
      }
      if (m.type === 'result') {
        last = m.text;
        document.getElementById('out').textContent = m.text;
        document.getElementById('apply').style.display = m.hasDiff ? 'inline-block' : 'none';
        document.getElementById('tests').style.display = 'inline-block';
      }
      if (m.type === 'serverReady') {
        const header = m.reused ? 'Servidor ya activo.' : 'Servidor iniciado.';
        document.getElementById('out').textContent = header + '\\nURL: ' + m.url + '\\n\\n' + (m.logs || '');
        document.getElementById('stopServer').style.display='inline-block';
      }
      if (m.type === 'serverStopped') {
        document.getElementById('out').textContent = m.text;
        document.getElementById('stopServer').style.display='none';
      }
      if (m.type === 'error') {
        document.getElementById('out').textContent = 'ERROR: ' + m.text;
        document.getElementById('retry').style.display='inline-block';
      }
      if (m.type === 'needKey') {
        document.getElementById('keyBox').style.display='block';
      }
      if (m.type === 'ready') {
        document.getElementById('keyBox').style.display='none';
      }
      if (m.type === 'testOutput') document.getElementById('out').textContent = m.text;
      if (m.type === 'applied') document.getElementById('out').textContent += '\\n[diff aplicado]';
    });
  </script>
</body>
</html>`;
}

export function deactivate() {
  activeAbort?.abort();
  stopAllPreviewServers();
}
