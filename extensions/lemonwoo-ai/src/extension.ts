import * as vscode from "vscode";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

const KEY_NAME = "deepseek.apiKey";
const VIEW_TYPE = "lemonwoo.agentView";
const BASE_URL = "https://api.deepseek.com";
const MODEL_PRO = "deepseek-v4-pro";
const MODEL_FLASH = "deepseek-v4-flash";

type AgentState = "Pensando" | "Escribiendo" | "Verificando";

export function activate(context: vscode.ExtensionContext) {
  const openAgent = vscode.commands.registerCommand("lemonwoo.openAgent", async () => {
    const panel = vscode.window.createWebviewPanel(VIEW_TYPE, "LemonWoo Agent", vscode.ViewColumn.Beside, {
      enableScripts: true,
      retainContextWhenHidden: true
    });
    panel.webview.html = renderHtml();
    panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === "run") {
        await handleRun(context, panel, String(msg.text ?? ""));
      }
      if (msg.type === "saveKey") {
        await context.secrets.store(KEY_NAME, String(msg.key ?? ""));
        panel.webview.postMessage({ type: "status", state: "Escribiendo" satisfies AgentState });
      }
      if (msg.type === "applyDiff") {
        await applyDiff(panel, String(msg.diff ?? ""));
      }
      if (msg.type === "runTestGate") {
        await handleTestGate(panel);
      }
    });
    await ensureKey(context, panel);
  });
  context.subscriptions.push(openAgent);
}

function redactSecrets(input: string): string {
  return input
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[REDACTED]")
    .replace(/ghp_[A-Za-z0-9]{16,}/g, "[REDACTED]")
    .replace(/github_pat_[A-Za-z0-9_]{16,}/g, "[REDACTED]");
}

function routeModel(prompt: string): { model: string; state: AgentState } {
  const p = prompt.toLowerCase();
  if (p.length < 120 && !/(refactor|debug|agent|verify|test|architecture)/.test(p)) {
    return { model: MODEL_FLASH, state: "Escribiendo" };
  }
  return { model: MODEL_PRO, state: "Pensando" };
}

async function ensureKey(context: vscode.ExtensionContext, panel: vscode.WebviewPanel) {
  const key = await context.secrets.get(KEY_NAME);
  if (!key) {
    panel.webview.postMessage({ type: "needKey" });
  } else {
    panel.webview.postMessage({ type: "ready" });
  }
}

async function handleRun(context: vscode.ExtensionContext, panel: vscode.WebviewPanel, prompt: string) {
  const apiKey = await context.secrets.get(KEY_NAME);
  if (!apiKey) {
    panel.webview.postMessage({ type: "error", text: "Falta DeepSeek API key" });
    return;
  }
  const editor = vscode.window.activeTextEditor;
  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const selectedText = editor?.document.getText(editor.selection) ?? "";
  const fileText = editor?.document.getText() ?? "";
  const filePath = editor?.document.uri.fsPath ?? "";
  const diagnostics = filePath ? vscode.languages.getDiagnostics(editor!.document.uri) : [];
  const rules = workspace ? readRules(workspace) : "";
  const agentsMd = workspace ? readOptionalFile(join(workspace, "AGENTS.md")) : "";

  const system = [
    "You are LemonWoo Agent.",
    "No provider picker, no model picker, DeepSeek only.",
    "Return markdown response and optional unified diff fenced as ```diff.",
    "Never output secrets."
  ].join("\n");
  const user = [
    `Prompt: ${prompt}`,
    `File: ${filePath}`,
    `Selection:\n${selectedText}`,
    `Diagnostics:\n${diagnostics.map((d) => d.message).join("\n")}`,
    `AGENTS.md:\n${agentsMd}`,
    `.lemonwoo/rules:\n${rules}`,
    `Context (truncated):\n${fileText.slice(0, 3000)}`
  ].join("\n\n");

  panel.webview.postMessage({ type: "status", state: "Pensando" satisfies AgentState });
  try {
    const routed = routeModel(prompt);
    panel.webview.postMessage({ type: "status", state: routed.state });
    const out = await deepseekChat(apiKey, system, user, routed.model);
    panel.webview.postMessage({ type: "status", state: "Escribiendo" satisfies AgentState });
    panel.webview.postMessage({ type: "result", text: redactSecrets(out) });
  } catch (error) {
    panel.webview.postMessage({ type: "error", text: redactSecrets(String(error)) });
  }
}

async function deepseekChat(apiKey: string, system: string, prompt: string, model: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), model === MODEL_PRO ? 120_000 : 25_000);
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
    const json: any = await response.json();
    if (!response.ok) {
      throw new Error(JSON.stringify(json));
    }
    return json.choices?.[0]?.message?.content ?? "";
  } finally {
    clearTimeout(timeout);
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

async function applyDiff(panel: vscode.WebviewPanel, rawDiff: string) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    panel.webview.postMessage({ type: "error", text: "No active editor for Apply" });
    return;
  }
  const diff = extractSingleFileReplacement(rawDiff);
  if (!diff) {
    panel.webview.postMessage({ type: "error", text: "Diff no valido para apply v1" });
    return;
  }
  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspace) {
    panel.webview.postMessage({ type: "error", text: "No workspace abierto" });
    return;
  }
  const filePath = editor.document.uri.fsPath;
  if (!filePath.startsWith(workspace) || filePath.includes("/.git/")) {
    panel.webview.postMessage({ type: "error", text: "Ruta bloqueada por seguridad" });
    return;
  }
  const edit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(
    editor.document.positionAt(0),
    editor.document.positionAt(editor.document.getText().length)
  );
  edit.replace(editor.document.uri, fullRange, diff);
  const ok = await vscode.workspace.applyEdit(edit);
  if (!ok) {
    panel.webview.postMessage({ type: "error", text: "No se pudo aplicar el diff" });
    return;
  }
  panel.webview.postMessage({ type: "applied" });
}

function extractSingleFileReplacement(raw: string): string | null {
  const match = raw.match(/```diff([\s\S]*?)```/);
  if (!match) return null;
  const lines = match[1].split("\n");
  const added: string[] = [];
  for (const line of lines) {
    if (line.startsWith("+") && !line.startsWith("+++")) added.push(line.slice(1));
  }
  return added.length ? added.join("\n") : null;
}

async function handleTestGate(panel: vscode.WebviewPanel) {
  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspace) {
    panel.webview.postMessage({ type: "error", text: "No workspace for TestGate" });
    return;
  }
  panel.webview.postMessage({ type: "status", state: "Verificando" satisfies AgentState });
  const result = await runTestGateLocal(workspace);
  panel.webview.postMessage({ type: "testOutput", text: result.output, ok: result.ok });
  panel.webview.postMessage({ type: "status", state: "Escribiendo" satisfies AgentState });
}

async function runTestGateLocal(workspace: string): Promise<{ ok: boolean; output: string }> {
  const pkg = join(workspace, "package.json");
  if (!existsSync(pkg)) return { ok: true, output: "No package.json; TestGate skipped" };
  const scripts = JSON.parse(readFileSync(pkg, "utf8")).scripts ?? {};
  const command = scripts.typecheck
    ? ["run", "typecheck"]
    : scripts.lint
      ? ["run", "lint"]
      : scripts.test
        ? ["run", "test"]
        : null;
  if (!command) return { ok: true, output: "No test/lint/typecheck scripts detected" };
  const manager = existsSync(join(workspace, "pnpm-lock.yaml"))
    ? "pnpm"
    : existsSync(join(workspace, "yarn.lock"))
      ? "yarn"
      : "npm";
  return await new Promise((resolve) => {
    const child = spawn(manager, command, { cwd: workspace, shell: false });
    let out = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ ok: false, output: "TestGate timeout after 120s" });
    }, 120_000);
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (out += d.toString()));
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, output: redactSecrets(out) });
    });
  });
}

function renderHtml(): string {
  return `<!doctype html>
<html>
<body>
  <h3>LemonWoo Agent</h3>
  <div id="state">Estado: Escribiendo</div>
  <div id="keyBox">
    <p>Pega una DeepSeek API key:</p>
    <input id="key" type="password" />
    <button onclick="saveKey()">Guardar key</button>
  </div>
  <textarea id="prompt" rows="5" cols="70" placeholder="Describe la tarea..."></textarea><br/>
  <button onclick="run()">Run</button>
  <button onclick="retry()">Retry</button>
  <button onclick="stop()">Stop</button>
  <button onclick="runTestGate()">TestGate</button>
  <button onclick="applyDiff()">Apply</button>
  <pre id="out"></pre>
  <script>
    const vscode = acquireVsCodeApi();
    let last = "";
    function run(){ vscode.postMessage({type:'run', text: document.getElementById('prompt').value});}
    function retry(){ run(); }
    function stop(){ document.getElementById('state').textContent='Estado: Escribiendo'; }
    function saveKey(){ vscode.postMessage({type:'saveKey', key: document.getElementById('key').value});}
    function applyDiff(){ vscode.postMessage({type:'applyDiff', diff: last}); }
    function runTestGate(){ vscode.postMessage({type:'runTestGate'}); }
    window.addEventListener('message', (event) => {
      const m = event.data;
      if (m.type === 'status') document.getElementById('state').textContent = 'Estado: ' + m.state;
      if (m.type === 'result') { last = m.text; document.getElementById('out').textContent = m.text; }
      if (m.type === 'error') document.getElementById('out').textContent = 'ERROR: ' + m.text;
      if (m.type === 'needKey') document.getElementById('keyBox').style.display='block';
      if (m.type === 'ready') document.getElementById('keyBox').style.display='none';
      if (m.type === 'testOutput') document.getElementById('out').textContent = m.text;
      if (m.type === 'applied') document.getElementById('out').textContent += '\\n[diff aplicado]';
    });
  </script>
</body>
</html>`;
}

export function deactivate() {}
