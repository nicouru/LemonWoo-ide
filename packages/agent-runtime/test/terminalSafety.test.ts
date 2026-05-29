import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyTerminalCommand,
  classifyPathArguments,
  parseAllowedTerminalCommand,
  parseTerminalTimeoutMs,
  hasShellMetacharacters,
  buildSanitizedTerminalEnv
} from "../src/terminalSafety.js";

describe("classifyTerminalCommand", () => {
  it("allows npm test and rg literal query", () => {
    expect(classifyTerminalCommand("npm test").policy).toBe("allow");
    expect(classifyTerminalCommand("pnpm run test").policy).toBe("allow");
    expect(classifyTerminalCommand("rg foo").policy).toBe("allow");
  });

  it("requires confirmation for install, find, cat, and rg flags", () => {
    expect(classifyTerminalCommand("pnpm install").policy).toBe("confirm");
    expect(classifyTerminalCommand("find . -name x").policy).toBe("confirm");
    expect(classifyTerminalCommand("cat file.txt").policy).toBe("confirm");
    expect(classifyTerminalCommand("rg --files").policy).toBe("confirm");
  });

  it("blocks destructive commands", () => {
    expect(classifyTerminalCommand("rm -rf node_modules").policy).toBe("block");
    expect(classifyTerminalCommand("sudo npm test").policy).toBe("block");
    expect(classifyTerminalCommand("git push origin main").policy).toBe("block");
    expect(classifyTerminalCommand("find . -delete").policy).toBe("block");
  });

  it("requires confirmation for shell metacharacters", () => {
    expect(hasShellMetacharacters("npm test && rm -rf /")).toBe(true);
    expect(classifyTerminalCommand("cat file > other").policy).toBe("confirm");
    expect(classifyTerminalCommand("npm test; npm run lint").policy).toBe("confirm");
  });

  it("blocks or confirms path arguments outside workspace scope", () => {
    expect(classifyTerminalCommand("ls /Users").policy).toBe("confirm");
    expect(classifyTerminalCommand("rg foo /tmp").policy).toBe("confirm");
    expect(classifyTerminalCommand("rg foo ../outside").policy).toBe("block");
    expect(classifyTerminalCommand("rg foo src").policy).toBe("allow");
    expect(classifyTerminalCommand("ls src").policy).toBe("allow");
    expect(classifyTerminalCommand("ls .git").policy).toBe("block");
    expect(classifyTerminalCommand("rg --files").policy).toBe("confirm");
  });

  it("classifyPathArguments rejects traversal and .git", () => {
    expect(classifyPathArguments(["../outside"])).toBe("block");
    expect(classifyPathArguments([".git"])).toBe("block");
    expect(classifyPathArguments(["src"])).toBeNull();
    expect(classifyPathArguments(["/tmp"])).toBe("confirm");
  });

  it("parses allowed commands without shell", () => {
    expect(parseAllowedTerminalCommand("npm test")).toEqual({ executable: "npm", args: ["test"] });
    expect(parseAllowedTerminalCommand("rg foo src")).toEqual({ executable: "rg", args: ["foo", "src"] });
    expect(parseAllowedTerminalCommand("ls /Users")).toBeNull();
    expect(parseAllowedTerminalCommand("rg foo /tmp")).toBeNull();
    expect(parseAllowedTerminalCommand("find .")).toBeNull();
    expect(parseAllowedTerminalCommand("cat x")).toBeNull();
  });

  it("sanitized env removes DEEPSEEK_API_KEY", () => {
    const env = buildSanitizedTerminalEnv({
      PATH: "/bin",
      HOME: "/tmp",
      DEEPSEEK_API_KEY: "sk-secret",
      GITHUB_TOKEN: "ghp_secret",
      LANG: "C"
    });
    expect(env.DEEPSEEK_API_KEY).toBeUndefined();
    expect(env.GITHUB_TOKEN).toBeUndefined();
    expect(env.PATH).toBe("/bin");
    expect(env.HOME).toBe("/tmp");
  });

  it("caps timeout parsing", () => {
    expect(parseTerminalTimeoutMs(undefined)).toBe(30_000);
    expect(parseTerminalTimeoutMs("999999")).toBe(120_000);
  });
});
