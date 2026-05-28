import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT = path.resolve(process.cwd());

// 1. Get all git-tracked files in docs/, scripts/, README.md, package.json
let files = [];
try {
  const output = execSync('git ls-files docs scripts README.md package.json', { cwd: ROOT, encoding: 'utf8' });
  files = output.trim().split('\n').filter(Boolean);
} catch (err) {
  console.error("Failed to run git ls-files:", err);
  process.exit(1);
}

const forbiddenPatterns = [
  { name: 'file:///Users', regex: /file:\/\/\/Users/ },
  { name: '/Users/lskjdnf', regex: /\/Users\/lskjdnf/ },
  { name: 'PR #4', regex: /PR #4/ },
  { name: 'PR #5', regex: /PR #5/ },
  { name: 'PR #6', regex: /PR #6/ },
  { name: 'feature/agent-programming', regex: /feature\/agent-programming/ },
  { name: 'Done in PR', regex: /Done in PR/ },
  { name: 'merge PR', regex: /merge PR/ },
  { name: 'mergeable', regex: /mergeable/ },
  { name: '0bb7c42', regex: /0bb7c42/ },
  { name: 'Partial pass', regex: /Partial pass/ },
  { name: 'Continue integration', regex: /Continue integration/ },
  { name: 'Open Agent Window', regex: /Open Agent Window/ },
  { name: 'Start Preview', regex: /Start Preview/ },
  { name: 'Stop Preview', regex: /Stop Preview/ },
];

let failed = false;

for (const file of files) {
  // Skip verify-docs-current.mjs itself to avoid checking its own patterns
  if (file === 'scripts/verify-docs-current.mjs') {
    continue;
  }

  const fullPath = path.join(ROOT, file);
  if (!fs.existsSync(fullPath)) continue;

  const content = fs.readFileSync(fullPath, 'utf8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Check simple patterns
    for (const pattern of forbiddenPatterns) {
      if (pattern.regex.test(line)) {
        console.error(`FAIL: Forbidden pattern "${pattern.name}" found in ${file}:${lineNum}`);
        console.error(`  Line: ${line.trim()}`);
        failed = true;
      }
    }

    // Check docs/RC-REPORT.md usage: allowed if explicitly called a template/plantilla, or inside script logic
    if (line.includes('docs/RC-REPORT.md')) {
      const isTemplateMention = line.toLowerCase().includes('template') || line.toLowerCase().includes('plantilla');
      const isScriptLogic = file.endsWith('.mjs') || file.endsWith('.js') || file.endsWith('.sh');
      if (!isTemplateMention && !isScriptLogic && file !== 'docs/RC-REPORT.md') {
        console.error(`FAIL: Ambiguous usage of "docs/RC-REPORT.md" found in ${file}:${lineNum}`);
        console.error(`  Line: ${line.trim()}`);
        failed = true;
      }
    }

    // Check Antigravity: allowed only in docs/ANTIGRAVITY-AUDIT.md or as a filename reference to ANTIGRAVITY-AUDIT.md
    // We clean the filename reference from the line before testing
    const lineWithoutFilenameRef = line.replace(/ANTIGRAVITY-AUDIT\.md/gi, '');
    if (lineWithoutFilenameRef.toLowerCase().includes('antigravity')) {
      if (file !== 'docs/ANTIGRAVITY-AUDIT.md') {
        console.error(`FAIL: Mention of "Antigravity" found in unauthorized file ${file}:${lineNum}`);
        console.error(`  Line: ${line.trim()}`);
        failed = true;
      }
    }

    // Check Cursor: brand name "Cursor" (capital C) is allowed only in docs/PUBLIC-RELEASE-CHECKLIST.md or verify-release-artifacts.sh
    if (line.includes('Cursor')) {
      const allowedFiles = [
        'docs/PUBLIC-RELEASE-CHECKLIST.md',
        'scripts/verify-release-artifacts.sh'
      ];
      if (!allowedFiles.includes(file)) {
        console.error(`FAIL: Mention of "Cursor" found in unauthorized file ${file}:${lineNum}`);
        console.error(`  Line: ${line.trim()}`);
        failed = true;
      }
    }
  }
}

if (failed) {
  process.exit(1);
} else {
  console.log("PASS: Documentation consistency check completed successfully.");
  process.exit(0);
}
