import * as vscode from "vscode";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { planMultiFileApply } from "@lemonwoo/agent-runtime";

export function isSafeWorkspacePath(workspace: string, relPath: string): boolean {
  const abs = join(workspace, relPath);
  const rel = relative(workspace, abs);
  return Boolean(rel) && !rel.startsWith("..") && !rel.startsWith("/") && !rel.split(/[\\/]/).includes(".git");
}

export async function applyMultiFileDiff(
  workspace: string,
  rawDiff: string
): Promise<{ ok: boolean; touched: string[]; error?: string }> {
  const readFile = (relPath: string): string | null => {
    if (!isSafeWorkspacePath(workspace, relPath)) return null;
    const abs = join(workspace, relPath);
    if (!existsSync(abs)) return null;
    return readFileSync(abs, "utf8");
  };

  const plan = planMultiFileApply(rawDiff, readFile);
  if (!plan.ok) {
    return { ok: false, touched: [], error: plan.error };
  }

  const edit = new vscode.WorkspaceEdit();
  for (const patch of plan.patches) {
    if (!patch.ok || patch.content === undefined) {
      return { ok: false, touched: [], error: patch.error ?? "Patch inválido" };
    }
    const abs = join(workspace, patch.relPath);
    const uri = vscode.Uri.file(abs);
    if (existsSync(abs)) {
      const doc = await vscode.workspace.openTextDocument(uri);
      const fullRange = new vscode.Range(
        doc.positionAt(0),
        doc.positionAt(doc.getText().length)
      );
      edit.replace(uri, fullRange, patch.content);
    } else {
      edit.createFile(uri, { ignoreIfExists: false });
      edit.insert(uri, new vscode.Position(0, 0), patch.content);
    }
  }

  const ok = await vscode.workspace.applyEdit(edit);
  if (!ok) {
    return { ok: false, touched: [], error: "No se pudo aplicar el diff (applyEdit falló)." };
  }

  for (const patch of plan.patches) {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(join(workspace, patch.relPath)));
    const saved = await doc.save();
    if (!saved) {
      return { ok: false, touched: [], error: `No se pudo guardar ${patch.relPath}.` };
    }
  }

  return { ok: true, touched: plan.patches.map((p) => p.relPath) };
}
