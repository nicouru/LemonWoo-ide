import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, acc);
    } else if (st.isFile() && full.endsWith(".ts")) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * Strips block (`/* ... *​/`) and line (`// ...`) comments so the check
 * targets the executing code, not documentation that intentionally names
 * what we exclude. Approximate but sufficient: it does not parse strings,
 * but our source has no inline string literals containing the exclusion
 * tokens.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

describe("v1 scope exclusions in source code", () => {
  const srcDir = resolve(process.cwd(), "src");
  const files = walk(srcDir);

  it("source tree must have files to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("executing code must not import or reference Anthropic compatibility", () => {
    for (const f of files) {
      const text = stripComments(readFileSync(f, "utf8")).toLowerCase();
      expect(text, `file: ${f}`).not.toContain("anthropic");
    }
  });

  it("executing code must not depend on FIM beta as a hot-path feature", () => {
    for (const f of files) {
      const text = stripComments(readFileSync(f, "utf8")).toLowerCase();
      expect(text, `file: ${f}`).not.toMatch(/\bfim_completion\b/);
      expect(text, `file: ${f}`).not.toMatch(/\bfill-in-middle\b/);
    }
  });

  it("executing code must not include MCP Hub / Inspector / Registry plumbing", () => {
    for (const f of files) {
      const text = stripComments(readFileSync(f, "utf8"));
      expect(text, `file: ${f}`).not.toMatch(/mcp[-_]?hub/i);
      expect(text, `file: ${f}`).not.toMatch(/mcp[-_]?inspector/i);
      expect(text, `file: ${f}`).not.toMatch(/mcp[-_]?registry/i);
    }
  });
});
