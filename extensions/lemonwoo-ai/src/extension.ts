import * as vscode from "vscode";
import {
  DeepSeekAbortError,
  DeepSeekAuthError,
  DeepSeekClient,
  DeepSeekNetworkError,
  DeepSeekRateLimitError,
  redactSecrets
} from "@lemonwoo/deepseek";
import { runTestGate } from "@lemonwoo/test-gate";
import { runAgentTask } from "@lemonwoo/agent-runtime";
import {
  detectLocalActionIntent,
  ensurePreviewServer,
  stopAllPreviewServers,
  stopPreviewServer
} from "./localActions.js";
import { gatherAgentContext } from "./agentContext.js";
import { applyMultiFileDiff } from "./multiDiffApply.js";
import { getPreferredTextEditor, registerTextEditorTracking } from "./editorTracking.js";
import { registerInlineCompletionProvider, resetInlineCompletionState } from "./inlineCompletion.js";

const KEY_NAME = "deepseek.apiKey";
const VIEW_TYPE = "lemonwoo.agentView";

type AgentState = "Pensando" | "Escribiendo" | "Verificando" | "Sirviendo" | "Listo";

let activePanel: vscode.WebviewPanel | undefined;
let activeAbort: AbortController | undefined;
let lastAgentText = "";
let lastRawDiff: string | null = null;
let lastTouchedFiles: string[] = [];
let lastTestOutput = "";
let lastTestFailed = false;
let lastUserTask = "";
let lastStreamed = "";

export function activate(context: vscode.ExtensionContext) {
  registerTextEditorTracking(context);
  const openAgent = vscode.commands.registerCommand("lemonwoo.openAgent", async () => {
    await openAgentPanel(context);
  });
  context.subscriptions.push(openAgent);
  context.subscriptions.push(registerInlineCompletionProvider(context));
  void openAgentPanel(context);
}

async function openAgentPanel(context: vscode.ExtensionContext) {
  await closeWelcomeTabs();
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
  panel.webview.onDidReceiveMessage(async (msg) => {
    if (msg.type === "initialized") {
      await ensureKey(context, panel);
    }
    if (msg.type === "run") await handleRun(context, panel, String(msg.text ?? ""));
    if (msg.type === "fixAgent") await handleFixWithAgent(context, panel);
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
      panel.webview.postMessage({ type: "status", state: "Pensando" satisfies AgentState });
      panel.webview.postMessage({ type: "info", text: "Conectando DeepSeek..." });
      try {
        const client = new DeepSeekClient({ apiKey: key });
        const check = await client.validateKey();
        if (check.status !== "valid") {
          panel.webview.postMessage({ type: "error", text: mapDeepSeekConnectMessage(check.status) });
          panel.webview.postMessage({ type: "needKey" });
          panel.webview.postMessage({ type: "status", state: "Listo" satisfies AgentState });
          return;
        }
        await context.secrets.store(KEY_NAME, key);
        panel.webview.postMessage({ type: "ready" });
        panel.webview.postMessage({ type: "status", state: "Listo" satisfies AgentState });
      } catch (error) {
        panel.webview.postMessage({
          type: "error",
          text:
            error instanceof DeepSeekAuthError
              ? "Key inválida."
              : "Sin red o DeepSeek no disponible."
        });
        panel.webview.postMessage({ type: "needKey" });
        panel.webview.postMessage({ type: "status", state: "Listo" satisfies AgentState });
      }
    }
    if (msg.type === "clearKey") {
      await context.secrets.delete(KEY_NAME);
      resetInlineCompletionState();
      panel.webview.postMessage({ type: "needKey" });
    }
    if (msg.type === "applyDiff") {
      await handleApplyDiff(panel, String(msg.diff ?? lastAgentText));
    }
    if (msg.type === "runTestGate") {
      await handleTestGate(panel);
    }
  });
  panel.webview.html = renderHtml();
}

function isWelcomeTab(tab: vscode.Tab): boolean {
  const input = tab.input;
  if (input && typeof input === "object" && "uri" in input && (input as any).uri?.scheme === "file") {
    return false;
  }
  const label = tab.label.toLowerCase();
  if (label.includes("welcome")) {
    return true;
  }
  if (input instanceof vscode.TabInputText) {
    const value = `${input.uri.scheme}:${input.uri.path}`.toLowerCase();
    return value.includes("walkthrough") || value.includes("getting-started") || value.includes("welcome");
  }
  if (input instanceof vscode.TabInputWebview) {
    return input.viewType.toLowerCase().includes("welcome") || input.viewType.toLowerCase().includes("gettingstarted");
  }
  return false;
}

async function closeWelcomeTabs(): Promise<void> {
  const closable = vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .filter((tab) => !tab.isDirty && !tab.isPinned && isWelcomeTab(tab));
  if (closable.length > 0) {
    await vscode.window.tabGroups.close(closable, true);
  }
}

async function ensureKey(context: vscode.ExtensionContext, panel: vscode.WebviewPanel) {
  const key = await context.secrets.get(KEY_NAME);
  panel.webview.postMessage({ type: key ? "ready" : "needKey" });
  panel.webview.postMessage({ type: "status", state: "Listo" satisfies AgentState });
}

async function getApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
  return await context.secrets.get(KEY_NAME);
}

function hasSingleDiffBlock(text: string): boolean {
  const matches = [...text.matchAll(/```diff[\s\S]*?```/g)];
  return matches.length === 1;
}

function hasMultipleDiffBlocks(text: string): boolean {
  return [...text.matchAll(/```diff[\s\S]*?```/g)].length > 1;
}

function mapDeepSeekConnectMessage(status: string): string {
  if (status === "invalid") return "Key inválida.";
  if (status === "rate-limited") return "Rate limit, reintentando.";
  if (status === "models-unavailable") return "DeepSeek no devolvió modelos compatibles.";
  return "Sin red o DeepSeek no disponible.";
}

async function handleRun(context: vscode.ExtensionContext, panel: vscode.WebviewPanel, prompt: string) {
  if (!prompt.trim()) {
    panel.webview.postMessage({ type: "error", text: "Escribí una tarea para el agente." });
    return;
  }

  if (detectLocalActionIntent(prompt) === "preview") {
    const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspace) {
      panel.webview.postMessage({ type: "error", text: "Abrí una carpeta para levantar preview local." });
      return;
    }
    panel.webview.postMessage({ type: "status", state: "Sirviendo" satisfies AgentState });
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
      panel.webview.postMessage({ type: "status", state: "Listo" satisfies AgentState });
    }
    return;
  }

  const apiKey = await getApiKey(context);
  if (!apiKey) {
    panel.webview.postMessage({ type: "needKey" });
    panel.webview.postMessage({ type: "error", text: "Pegá tu DeepSeek API key para conectar LemonWoo." });
    return;
  }

  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspace) {
    panel.webview.postMessage({ type: "error", text: "Abrí una carpeta de proyecto." });
    return;
  }

  await runAgentCycle(context, panel, apiKey, workspace, prompt);
}

async function handleFixWithAgent(context: vscode.ExtensionContext, panel: vscode.WebviewPanel) {
  if (!lastTestFailed || !lastTestOutput.trim()) {
    panel.webview.postMessage({ type: "error", text: "No hay fallos de TestGate para corregir." });
    return;
  }
  const apiKey = await getApiKey(context);
  if (!apiKey) {
    panel.webview.postMessage({ type: "needKey" });
    return;
  }
  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspace) return;

  const originalTask = lastUserTask.trim() || "Corregir fallos de tests";
  await runAgentCycle(context, panel, apiKey, workspace, originalTask, lastTestOutput);
}

async function runAgentCycle(
  context: vscode.ExtensionContext,
  panel: vscode.WebviewPanel,
  apiKey: string,
  workspace: string,
  prompt: string,
  fixTestOutput?: string
) {
  activeAbort?.abort();
  activeAbort = new AbortController();
  const signal = activeAbort.signal;

  lastTestFailed = false;
  panel.webview.postMessage({ type: "fixAgent", show: false });

  if (!fixTestOutput) {
    lastUserTask = prompt;
  }

  try {
    lastStreamed = "";
    const snapshot = await gatherAgentContext(workspace, prompt, {
      signal,
      editor: getPreferredTextEditor()
    });
    const client = new DeepSeekClient({ apiKey });

    for await (const event of runAgentTask({
      client,
      context: snapshot,
      signal,
      fixTestOutput
    })) {
      if (event.type === "phase") {
        panel.webview.postMessage({ type: "status", state: event.phase satisfies AgentState });
      }
      if (event.type === "delta") {
        lastStreamed += event.text;
        panel.webview.postMessage({ type: "stream", text: redactSecrets(lastStreamed) });
      }
      if (event.type === "message") {
        lastAgentText = redactSecrets(event.text);
        lastRawDiff = event.text.includes("```diff") ? event.text : null;
      }
      if (event.type === "done") {
        lastAgentText = redactSecrets(event.result.message);
        lastRawDiff = event.result.rawDiff;
        lastTouchedFiles = event.result.touchedFiles;
        panel.webview.postMessage({
          type: "result",
          text: lastAgentText,
          hasDiff: event.result.hasDiff
        });
        if (event.result.hasDiff && hasSingleDiffBlock(event.result.message)) {
          panel.webview.postMessage({ type: "info", text: "Diff listo para revisar." });
        }
        if (!event.result.hasDiff && hasMultipleDiffBlocks(event.result.message)) {
          panel.webview.postMessage({
            type: "error",
            text: "Se detectaron múltiples bloques diff; enviá una sola propuesta diff para aplicar."
          });
        }
      }
    }
    panel.webview.postMessage({ type: "status", state: "Listo" satisfies AgentState });
  } catch (error) {
    if (error instanceof DeepSeekAbortError) {
      panel.webview.postMessage({ type: "error", text: "Tarea cancelada." });
    } else if (error instanceof DeepSeekAuthError) {
      panel.webview.postMessage({ type: "needKey" });
      panel.webview.postMessage({ type: "error", text: "Key inválida." });
    } else if (error instanceof DeepSeekRateLimitError) {
      panel.webview.postMessage({ type: "error", text: "Rate limit, reintentando." });
    } else if (error instanceof DeepSeekNetworkError) {
      panel.webview.postMessage({ type: "error", text: "Sin red o DeepSeek no disponible." });
    } else {
      panel.webview.postMessage({ type: "error", text: redactSecrets(String(error)) });
    }
    panel.webview.postMessage({ type: "status", state: "Listo" satisfies AgentState });
  } finally {
    activeAbort = undefined;
  }
}

async function handleApplyDiff(panel: vscode.WebviewPanel, raw: string) {
  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspace) {
    panel.webview.postMessage({ type: "error", text: "Abrí una carpeta antes de aplicar cambios." });
    return;
  }
  const diffSource = lastRawDiff ?? raw;
  if (!diffSource.trim() || !diffSource.includes("--- ")) {
    panel.webview.postMessage({
      type: "error",
      text: "No hay diff multi-archivo para aplicar. Pedile al agente un bloque ```diff."
    });
    return;
  }
  if (hasMultipleDiffBlocks(diffSource)) {
    panel.webview.postMessage({
      type: "error",
      text: "Múltiples bloques diff detectados. Dejá sólo uno para aplicar con seguridad."
    });
    return;
  }

  const applied = await applyMultiFileDiff(workspace, diffSource);
  if (!applied.ok) {
    panel.webview.postMessage({ type: "error", text: applied.error ?? "No se pudo aplicar el diff." });
    return;
  }
  lastTouchedFiles = applied.touched;
  panel.webview.postMessage({ type: "applied", touched: applied.touched });
}

async function handleTestGate(panel: vscode.WebviewPanel) {
  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspace) {
    panel.webview.postMessage({ type: "error", text: "Abrí una carpeta para ejecutar TestGate." });
    return;
  }

  activeAbort?.abort();
  activeAbort = new AbortController();

  panel.webview.postMessage({ type: "status", state: "Verificando" satisfies AgentState });
  try {
    const changed = lastTouchedFiles.length ? lastTouchedFiles : ["."];
    const result = await runTestGate(workspace, changed, activeAbort.signal);
    lastTestOutput = result.output;
    lastTestFailed = !result.ok;
    panel.webview.postMessage({
      type: "testOutput",
      text: result.output,
      ok: result.ok
    });
    panel.webview.postMessage({ type: "fixAgent", show: !result.ok });
    if (!result.ok) {
      panel.webview.postMessage({ type: "info", text: "Tests fallaron, podés corregir con agente." });
    }
  } catch (error) {
    const text = String(error);
    if (text.includes("AbortError") || text.includes("aborted")) {
      panel.webview.postMessage({ type: "error", text: "Verificación cancelada." });
    } else {
      panel.webview.postMessage({ type: "error", text: redactSecrets(text) });
    }
  } finally {
    activeAbort = undefined;
    panel.webview.postMessage({ type: "status", state: "Listo" satisfies AgentState });
  }
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
    .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    #state { color: var(--vscode-descriptionForeground); font-size: 12px; }
    #keyBox { border: 1px solid var(--vscode-input-border); padding: 12px; border-radius: 6px; }
    input, textarea { width: 100%; box-sizing: border-box; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px; padding: 10px; }
    textarea { min-height: 118px; resize: vertical; }
    button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: 0; border-radius: 4px; padding: 8px 12px; cursor: pointer; }
    button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    #stop, #retry, #apply, #tests, #stopServer, #fixAgent { display: none; }
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
      <button id="stop" class="secondary" onclick="stop()">Detener</button>
      <button id="retry" class="secondary" onclick="retry()">Reintentar</button>
      <button id="apply" onclick="applyDiff()">Aplicar diff</button>
      <button id="tests" class="secondary" onclick="runTestGate()">Verificar</button>
      <button id="fixAgent" class="secondary" onclick="fixAgent()">Corregir con agente</button>
      <button id="stopServer" class="secondary" onclick="stopServer()">Detener servidor</button>
    </div>
    <pre id="out"></pre>
  </main>
  <script>
    const vscode = acquireVsCodeApi();
    vscode.postMessage({type:'initialized'});
    let last = "";
    function run(){
      document.getElementById('retry').style.display='none';
      document.getElementById('fixAgent').style.display='none';
      vscode.postMessage({type:'run', text: document.getElementById('prompt').value});
    }
    function retry(){ run(); }
    function stop(){ vscode.postMessage({type:'stop'}); }
    function saveKey(){ vscode.postMessage({type:'saveKey', key: document.getElementById('key').value});}
    function applyDiff(){ vscode.postMessage({type:'applyDiff', diff: last}); }
    function runTestGate(){ vscode.postMessage({type:'runTestGate'}); }
    function fixAgent(){ vscode.postMessage({type:'fixAgent'}); }
    function stopServer(){ vscode.postMessage({type:'stopServer'}); }
    function focusKey(){
      setTimeout(() => document.getElementById('key')?.focus(), 0);
    }
    function focusPrompt(){
      setTimeout(() => document.getElementById('prompt')?.focus(), 0);
    }
    function escapeHtml(value){
      return String(value || '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[ch]);
    }
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
      if (m.type === 'stream') {
        last = m.text;
        document.getElementById('out').textContent = m.text;
        document.getElementById('apply').style.display = 'none';
      }
      if (m.type === 'info') {
        const prev = document.getElementById('out').textContent || '';
        document.getElementById('out').textContent = (prev ? prev + '\\n' : '') + m.text;
      }
      if (m.type === 'serverReady') {
        const header = m.reused ? 'Servidor ya activo.' : 'Servidor iniciado.';
        const safeUrl = escapeHtml(m.url);
        document.getElementById('out').innerHTML = escapeHtml(header) + '\\nURL: <a href="' + safeUrl + '">' + safeUrl + '</a>\\n\\n' + escapeHtml(m.logs || '');
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
        focusKey();
      }
      if (m.type === 'ready') {
        document.getElementById('keyBox').style.display='none';
        focusPrompt();
      }
      if (m.type === 'testOutput') {
        document.getElementById('out').textContent = m.text;
        document.getElementById('tests').style.display='inline-block';
      }
      if (m.type === 'fixAgent') {
        document.getElementById('fixAgent').style.display = m.show ? 'inline-block' : 'none';
      }
      if (m.type === 'applied') {
        document.getElementById('out').textContent += '\\n[diff aplicado: ' + (m.touched || []).join(', ') + ']';
      }
    });
  </script>
</body>
</html>`;
}

export function deactivate() {
  activeAbort?.abort();
  stopAllPreviewServers();
}
