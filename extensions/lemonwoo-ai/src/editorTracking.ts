import * as vscode from "vscode";

let lastTextEditor: vscode.TextEditor | undefined;

export function isTextEditor(editor: vscode.TextEditor | undefined): editor is vscode.TextEditor {
  if (!editor) return false;
  return editor.document.uri.scheme === "file";
}

function trackActiveEditor(editor: vscode.TextEditor | undefined) {
  if (isTextEditor(editor)) {
    lastTextEditor = editor;
  }
}

export function registerTextEditorTracking(context: vscode.ExtensionContext) {
  trackActiveEditor(vscode.window.activeTextEditor);
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(trackActiveEditor));
}

/** Prefer a real file editor when the agent webview has focus. */
export function getPreferredTextEditor(): vscode.TextEditor | undefined {
  const active = vscode.window.activeTextEditor;
  if (isTextEditor(active)) return active;
  if (isTextEditor(lastTextEditor)) return lastTextEditor;
  const withSelection = vscode.window.visibleTextEditors.find(
    (ed) => isTextEditor(ed) && !ed.selection.isEmpty
  );
  if (withSelection) return withSelection;
  return vscode.window.visibleTextEditors.find(isTextEditor);
}
